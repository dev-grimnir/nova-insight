/**
 * Owns the data pipeline and history stack for a snapshot session.
 * Views are dumb: they call drillTo / goBack / canGoBack and re-render.
 *
 * Public surface:
 *   static async buildData(username, friendlyName, startDate, endDate)
 *       -> NovaSnapshotModel | null
 *   static createHeadless(username, friendlyName)
 *       -> NovaSnapshotController (no fetch, no view, no history)
 *   constructor(username, friendlyName, startDate, endDate)
 *       -> immediately fetches and shows the modal snapshot
 *   async drillTo(startDate, endDate) -> NovaSnapshotModel | null
 *   async goBack() -> NovaSnapshotModel | null
 *   canGoBack() -> boolean
 *   seedHistory(model) -> void  (used by inline callers)
 */
class NovaSnapshotController {
    constructor(username, friendlyName, startDate = null, endDate = null) {
        this.username = username;
        this.friendlyName = friendlyName || username;
        this.historyStack = [];
        this.view = null;

        // Modal flow is the default. Callers that want a headless controller
        // (report view embedding) should use NovaSnapshotController.createHeadless().
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
    
            const metrics = NovaAnalyzer.computeMetrics(inWindow, startDate, endDate);
            if (!metrics) return null;
            const entriesResult = NovaAnalyzer.getEntries(inWindow, startDate);
            const entries = entriesResult?.entries || inWindow;
    
            return new NovaSnapshotModel(
                username,
                friendlyName || username,
                startDate,
                endDate,
                metrics,
                entries
            );
        } catch (err) {
            console.error('NovaSnapshotController.buildFromEvents failed', err);
            return null;
        }
    }

    /**
     * Build a controller that does NO fetching and owns NO view.
     * Caller seeds its history with a model and hands it to an inline view.
     */
    static createHeadless(username, friendlyName) {
        return new NovaSnapshotController(username, friendlyName);
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
            const raw = await NovaHTTPController.paginateReportLogs(
                username, startDate, endDate
            );
            const cleanResult = NovaCollector.cleanEntries(raw);
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
    
            const metrics = NovaAnalyzer.computeMetrics(inWindow, startDate, endDate);
            if (!metrics) return null;
            const entriesResult = NovaAnalyzer.getEntries(inWindow, startDate);
            const entries = entriesResult?.entries || inWindow;
    
            return new NovaSnapshotModel(
                username,
                friendlyName || username,
                startDate,
                endDate,
                metrics,
                entries
            );
        } catch (err) {
            console.error('NovaSnapshotController.buildData failed', err);
            return null;
        }
    }

    /* ============================================================
     *  MODAL FLOW (spinner + view)
     * ============================================================ */

    async #loadAndShow(startDate, endDate) {
        const spinner = new NovaSpinnerView('Building snapshot…');
        spinner.show();

        const model = await NovaSnapshotController.buildData(
            this.username, this.friendlyName, startDate, endDate
        );
        spinner.hide();

        if (!model) {
            NovaToast.error("No change in status for this customer within the requested range.");
            return;
        }

        this.historyStack = [model];
        this.view = new NovaSnapshotView(this, model);
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
    
        const model = NovaSnapshotController.buildFromEvents(
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
    module.exports = NovaSnapshotController;
}
