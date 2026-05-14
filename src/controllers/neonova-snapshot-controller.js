/**
 * Owns the data pipeline and history stack for a snapshot session.
 * Views are dumb: they call drillTo / goBack / canGoBack and re-render.
 *
 * Public surface:
 *   static async buildData(username, friendlyName, startDate, endDate)
 *       -> NeonovaSnapshotModel | null
 *   static createHeadless(username, friendlyName)
 *       -> NeonovaSnapshotController (no fetch, no view, no history)
 *   constructor(username, friendlyName, startDate, endDate)
 *       -> immediately fetches and shows the modal snapshot
 *   async drillTo(startDate, endDate) -> NeonovaSnapshotModel | null
 *   async goBack() -> NeonovaSnapshotModel | null
 *   canGoBack() -> boolean
 *   seedHistory(model) -> void  (used by inline callers)
 */
class NeonovaSnapshotController {

    constructor(username, friendlyName, startDate = null, endDate = null) {
        this.username = username;
        this.friendlyName = friendlyName || username;
        this.historyStack = [];
        this.view = null;

        // Modal flow is the default. Callers that want a headless controller
        // (report view embedding) should use NeonovaSnapshotController.createHeadless().
        if (startDate && endDate) {
            this.#loadAndShow(startDate, endDate);
        }
    }

    /**
     * Build a controller that does NO fetching and owns NO view.
     * Caller seeds its history with a model and hands it to an inline view.
     */
    static createHeadless(username, friendlyName) {
        return new NeonovaSnapshotController(username, friendlyName);
    }

    async #loadInitial() {
        this.spinnerView.show();
        try {
            const built = await this.#buildModel(this.startDate, this.endDate);
            this.spinnerView.hide();
    
            if (built === null) {
                const fmt = (d) => d.toLocaleString([], {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit'
                });
                NeonovaToast.show(`No data was found within this timeframe, [${fmt(this.startDate)} — ${fmt(this.endDate)}]`);
                return;
            }
    
            this.model = built;
            this.view = new NeonovaSnapshotView(this);
            this.view.show();
        } catch (err) {
            this.spinnerView.hide();
            console.error('Failed to load snapshot:', err);
            alert('Could not load connection snapshot. Check console.');
        }
    }

    async #buildModel(startDate, endDate) {
        const rawEntries = await NeonovaHTTPController.paginateReportLogs(
            this.username, startDate, endDate, 0, 0, 23, 59
        );
        const cleanResult = NeonovaCollector.cleanEntries(rawEntries || []);
        const cleaned = cleanResult.cleanedEntries || [];
    
        // Initial-load empty guard. Drilldowns are exempt — even an empty
        // sub-range is renderable because state is inferable from context.
        // Only the top-level entry into a snapshot can return null here;
        // drillDown() doesn't go through this branch.
        const isInitialLoad = (this.model == null);
        if (isInitialLoad && cleaned.length < 1) return null;
    
        // Filter to the window for analyzer math. The analyzer's lead-time
        // logic assumes entries are pre-filtered to [startDate, endDate];
        // events that predate startDate get processed after the injected
        // boundary entry, producing sessions whose duration spans from a
        // pre-window event to an in-window event — sessionSeconds overflows
        // and percentConnected clamps to 100%.
        //
        // The model still holds the unfiltered `cleaned` array so the chart
        // can infer leading state from the most recent pre-window event.
        const startMs = startDate.getTime();
        const endMs   = endDate.getTime();
        const inWindow = cleaned.filter(e => {
            const t = e.dateObj && e.dateObj.getTime();
            return t != null && t >= startMs && t <= endMs;
        });
    
        const metrics = NeonovaAnalyzer.computeMetrics(inWindow, startDate, endDate);
    
        return new NeonovaSnapshotModel(
            this.username,
            this.friendlyName,
            startDate,
            endDate,
            cleaned,
            metrics
        );
    }

    /* ============================================================
     *  STATIC DATA PIPELINE
     * ============================================================ */

    /**
     * Fetch → clean → compute → return NeonovaSnapshotModel.
     * Used by both the modal flow and any inline caller that wants a
     * snapshot model for a specific range without owning the pipeline.
     */
    static async buildData(username, friendlyName, startDate, endDate) {
        try {
            const raw = await NeonovaHTTPController.paginateReportLogs(
                username, startDate, endDate
            );
            const cleanResult = NeonovaCollector.cleanEntries(raw);
            const cleaned = Array.isArray(cleanResult)
                ? cleanResult
                : (cleanResult?.cleanedEntries || []);
            const metrics = NeonovaAnalyzer.computeMetrics(cleanResult, startDate, endDate);
            if (!metrics) return null;
            const entriesResult = NeonovaAnalyzer.getEntries(cleanResult, startDate);
            const entries = entriesResult?.entries || cleaned;

            return new NeonovaSnapshotModel(
                username,
                friendlyName || username,
                startDate,
                endDate,
                metrics,
                entries
            );
        } catch (err) {
            console.error('NeonovaSnapshotController.buildData failed', err);
            return null;
        }
    }

    /* ============================================================
     *  MODAL FLOW (spinner + view)
     * ============================================================ */

    async #loadAndShow(startDate, endDate) {
        const spinner = new NeonovaSpinnerView('Building snapshot…');
        spinner.show();

        const model = await NeonovaSnapshotController.buildData(
            this.username, this.friendlyName, startDate, endDate
        );
        spinner.hide();

        if (!model) {
            NeonovaToast.error("No change in status for this customer within the requested range.");
            return;
        }

        this.historyStack = [model];
        this.view = new NeonovaSnapshotView(this, model);
        this.view.show();
    }

    /* ============================================================
     *  INSTANCE HISTORY API
     * ============================================================ */

    /**
     * Push current onto history, fetch new range, return new model.
     * Caller (view) re-renders with the returned model. Null on failure.
     */
    async drillTo(startDate, endDate) {
        const model = await NeonovaSnapshotController.buildData(
            this.username, this.friendlyName, startDate, endDate
        );
        if (!model) return null;
        this.historyStack.push(model);
        return model;
    }

    /**
     * Pop top of history, return the now-current model. Null if nothing to go back to.
     */
    goBack() {
        if (this.historyStack.length <= 1) return null;
        this.historyStack.pop();
        return this.historyStack[this.historyStack.length - 1];
    }

    canGoBack() {
        return this.historyStack.length > 1;
    }

    /**
     * Used by inline callers (report view) to seed history when the initial
     * model was built directly from in-memory metrics, without going through
     * buildData.
     */
    seedHistory(model) {
        this.historyStack = [model];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeonovaSnapshotController;
}
