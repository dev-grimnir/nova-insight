/**
 * @file src/controllers/nova-collector.js
 * Handles page scraping, pagination, and entry cleaning
 * @requires ../models/log-entry
 */
class NovaCollector {
    /**************************************************************************
     * STATIC PROPERTIES
     **************************************************************************/

    static analysisMode = localStorage.getItem('novaAnalysisMode') === 'true';

    static allEntries = JSON.parse(localStorage.getItem('novaEntries') || '[]');

    static pages = parseInt(localStorage.getItem('novaPages') || '0', 10);

    static table = null; // Will be set at runtime when needed

    /**************************************************************************
     * STATIC METHODS
     **************************************************************************/

    /**
     * Dedupes and cleans an array of entries.
     * This is a pure function — no side effects, no reliance on instance/state.
     * 
     * @param {Array} entries - Raw entries from pagination
     * @returns {Object} { cleanedEntries: Array (sorted oldest → newest), totalProcessed: number, ignored: number }
     */
    static cleanEntries(entries) {
        let totalProcessed = entries.length;
        let ignored = 0;

        if (!entries || totalProcessed === 0) {
            return { cleanedEntries: [], totalProcessed: 0, ignored: 0 };
        }

        // Map to standardized format and filter invalids
        let allEntries = entries.map(entry => {
            const date = entry.dateObj.getTime();  // Unix ms (numeric, unique)
            if (isNaN(date)) {
                ignored++;
                return null;
            }
            return { date, status: entry.status, dateObj: entry.dateObj };
        }).filter(entry => entry !== null);  // Remove invalids
        ignored += totalProcessed - allEntries.length;  // Add invalids to ignored count

        // Sort ascending by date (oldest to newest)
        allEntries.sort((a, b) => a.date - b.date);

        // De-dupe: Ignore timestamps entirely. Keep only the first occurrence of consecutive same statuses.
        const cleaned = [];
        if (allEntries.length > 0) {
            let prevStatus = null;
            allEntries.forEach(entry => {
                if (entry.status !== prevStatus) {
                    cleaned.push(entry);
                    prevStatus = entry.status;
                } else {
                    ignored++;  // Ignored consecutive duplicate status
                }
            });
        }

        return {
            cleanedEntries: cleaned,
            totalProcessed,  // Original input count
            ignored          // Invalids + consecutive dups
        };
    }
}
