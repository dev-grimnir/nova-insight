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
     * Analyze-only: build a model from an already-fetched events array,
     * filtered to the requested sub-window. The analyzer's leadTime logic
     * injects a boundary event at startDate, so dead space at the window's
     * left edge is handled even without pre-window context.
     */
    static buildFromEvents(username, friendlyName, events, startDate, endDate) {
        try {
            const startMs = startDate.getTime();
            const endMs   = endDate.getTime();
            const inWindow = (events || []).filter(e => {
                const t = e.dateObj && e.dateObj.getTime();
                return t != null && t >= startMs && t <= endMs;
            });
    
            const metrics = NeonovaAnalyzer.computeMetrics(inWindow, startDate, endDate);
            if (!metrics) return null;
            const entriesResult = NeonovaAnalyzer.getEntries(inWindow, startDate);
            const entries = entriesResult?.entries || inWindow;
    
            return new NeonovaSnapshotModel(
                username,
                friendlyName || username,
                startDate,
                endDate,
                metrics,
                entries
            );
        } catch (err) {
            console.error('NeonovaSnapshotController.buildFromEvents failed', err);
            return null;
        }
    }

    /**
     * Build a controller that does NO fetching and owns NO view.
     * Caller seeds its history with a model and hands it to an inline view.
     */
    static createHeadless(username, friendlyName) {
        return new NeonovaSnapshotController(username, friendlyName);
    }

    /* ============================================================
     *  STATIC DATA PIPELINE
     * ============================================================ */

    /**
     * Analyze-only: build a model from an already-fetched events array,
     * filtered to the requested sub-window. The analyzer's leadTime logic
     * injects a boundary event at startDate, so dead space at the window's
     * left edge is handled even without pre-window context.
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
    
            // Defensive filter — paginateReportLogs's silent shour/smin defaults
            // can widen the fetched window beyond what the caller requested.
            // Both buildData and buildFromEvents must hand the analyzer events
            // that match the [startDate, endDate] it's told to analyze.
            const startMs = startDate.getTime();
            const endMs   = endDate.getTime();
            const inWindow = cleaned.filter(e => {
                const t = e.dateObj && e.dateObj.getTime();
                return t != null && t >= startMs && t <= endMs;
            });
    
            const metrics = NeonovaAnalyzer.computeMetrics(inWindow, startDate, endDate);
            if (!metrics) return null;
            const entriesResult = NeonovaAnalyzer.getEntries(inWindow, startDate);
            const entries = entriesResult?.entries || inWindow;
    
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
     * Drill into a sub-range of the current model's data. Pure transform —
     * no HTTP. Pushes the new model onto history. Null on failure.
     */
    async drillTo(startDate, endDate) {
        const parent = this.historyStack[this.historyStack.length - 1];
        if (!parent) return null;
    
        const model = NeonovaSnapshotController.buildFromEvents(
            this.username, this.friendlyName, parent.events, startDate, endDate
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
