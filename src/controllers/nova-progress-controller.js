class NovaProgressController {
    constructor() {
        // No state needed here
    }

    /**
     * Orchestrates the entire report progress flow:
     * 1. Creates and shows progress view
     * 2. Fetches raw entries
     * 3. Cleans/dedupes
     * 4. Computes metrics
     * 5. Hands everything (incl. sanitized entries + requested range) to the
     *    report controller so the inline snapshot can mount without refetching
     * 6. Closes view on success or error
     *
     * @param {string} username
     * @param {string} friendlyName
     * @param {Date|null} startDate
     * @param {Date|null} endDate
     * @param {AbortSignal|null} [signal=null] - Optional, for cancellation
     * @returns {Promise<void>} Resolves when report is complete or cancelled
     */
    async start(username, friendlyName, startDate = null, endDate = null, signal = null) {
        const progressView = new NovaProgressView(this, username, friendlyName);
        progressView.show();

        let rawEntries = [];

        try {
            rawEntries = await NovaHTTPController.paginateReportLogs(
                username,
                startDate,
                endDate,
                (fetched, page, total) => {
                    progressView.updateProgress(fetched, page, total);
                },
                signal || progressView.signal
            );

            const cleanResult = NovaCollector.cleanEntries(rawEntries);

            // cleanEntries returns { cleanedEntries, totalProcessed, ignored }.
            // Analyzer handles both shapes, but the report/snapshot models
            // expect a plain array of entries. Unwrap once here.
            const sanitizedEntries = Array.isArray(cleanResult)
                ? cleanResult
                : (cleanResult?.cleanedEntries || []);

            const metrics = NovaAnalyzer.computeMetrics(cleanResult, startDate, endDate);

            // longDisconnects now ride on metrics (analyzer output). Pull them
            // out here so the report model receives them explicitly, matching
            // its existing constructor shape.
            const longDisconnects = (metrics && metrics.longDisconnects) || [];

            const reportController = new NovaReportController(
                username,
                friendlyName,
                metrics,
                sanitizedEntries.length,
                longDisconnects,
                sanitizedEntries,
                startDate,
                endDate
            );

            progressView.markComplete();

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Report generation cancelled by user');
                return;
            }
            console.error('Report generation failed:', err);
            progressView.showError(err.message || 'Failed to generate report');
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaProgressController;
}
