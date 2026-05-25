class NovaAnalyzer {

    /**
 * PRIVATE HELPER
 * Normalizes the input argument so we always work with a clean array.
 * Handles the legacy case where the caller passes the full stats object instead of just the array.
 * Early logging for transparency. Returns empty array if nothing valid.
 * @param {Array|Object} input - whatever was passed to computeMetrics
 * @returns {{entries: Array}} normalized object
 */
static #normalizeInput(input) {
    if (!input) {
        return { entries: [], totalProcessed: 0, ignored: 0 };
    }

    if (Array.isArray(input)) {
        return { entries: input, totalProcessed: input.length, ignored: 0 };
    }

    if (input.cleanedEntries !== undefined) {
        return {
            entries: input.cleanedEntries,
            totalProcessed: input.totalProcessed || input.cleanedEntries.length,
            ignored: input.ignored || 0
        };
    }

    return { entries: [], totalProcessed: 0, ignored: 0 };
}

    /**
 * Handles the leading boundary gap for a requested analysis window.
 *
 * When the first real log entry occurs *after* the requestedStart timestamp,
 * we have no prior knowledge of the modem's state. This method injects a
 * single leading entry at the exact requestedStart time with the *opposite*
 * status of the first real entry. This bootstraps the state machine correctly
 * so the very first real transition is processed as a normal Start → Stop
 * or Stop → Start.
 *
 * The trailing boundary is deliberately NOT handled here — we know the final
 * state from the last real entry, so it will be credited/debited as a simple
 * time delta later in the pipeline (no entry is ever injected at the end).
 *
 * Side effects:
 *   - Mutates normalized.entries in place (adds at most one object at index 0).
 *   - Does NOT touch totalProcessed, ignored, or any other counters.
 *   - The injected entry is indistinguishable from any real log entry.
 *
 * @param {Object} normalized - Result of #normalizeInput (must contain .entries array)
 * @param {Date} requestedStart - Required start of the analysis window
 * @returns {Object|null} The (possibly mutated) normalized object, or null on error
 * @throws {never} Errors are logged to console and null is returned (consistent
 *                 with NovaHTTPController / NovaCollector pattern)
 */
static #computeLeadTime(normalized, requestedStart) {
    // Enforce mandatory date (we made this required across the class)
    if (!requestedStart || !(requestedStart instanceof Date) || isNaN(requestedStart.getTime())) {
        console.error('NovaAnalyzer: requestedStart is required and must be a valid Date');
        return null;
    }

    // Early no-data case (standard Nova error pattern)
    if (!normalized?.entries || normalized.entries.length === 0) {
        console.error('NovaAnalyzer: no log entries found in the requested window');
        return null;
    }

    const firstReal = normalized.entries[0];

    // Zero-delta case: first real entry already lands exactly on requestedStart
    // → nothing to inject, state machine can proceed as-is
    if (firstReal.dateObj.getTime() === requestedStart.getTime()) {
        return normalized;
    }

    // Leading gap exists → inject opposite-status entry at the exact boundary
    const oppositeStatus = firstReal.status === 'Start' ? 'Stop' : 'Start';

    const leadEntry = {
        dateObj: new Date(requestedStart.getTime()), // exact copy of boundary timestamp
        status: oppositeStatus
    };

    // Insert at the very front (mutates in place)
    normalized.entries.unshift(leadEntry);

    return normalized;
}

    /**
     * Calculates the trailing boundary gap after all entries (plus any leading-gap injection)
     * have been processed.
     *
     * - If final state is "up" → the gap is connected time; add it to sessionSeconds.
     * - If final state is "down" → the gap is a disconnect duration. If that duration
     *   is > 30 minutes (1800 seconds), record it in counters.longDisconnects exactly
     *   like any other long outage (so the stability score's longOutagePenalty counts it).
     *
     * This is deliberately NOT done by injecting an entry (unlike the leading gap).
     * We already know the final state, so a pure delta is sufficient and keeps the
     * entries array clean.
     *
     * @param {Object} counters - counters object after #processAllEntries
     * @param {Date} requestedEnd - required end of the analysis window
     * @returns {void}
     */
    static #calculateEndTime(counters, requestedEnd) {
        // Guard – requestedEnd is now mandatory across the class
        if (!requestedEnd || !(requestedEnd instanceof Date) || isNaN(requestedEnd.getTime())) {
            console.error('NovaAnalyzer: requestedEnd is required and must be a valid Date');
            return;
        }
    
        const endMs = requestedEnd.getTime();
    
        if (counters.currentState === 'up' && counters.lastDate) {
            // Trailing gap = uptime
            const durationSec = (endMs - counters.lastDate.getTime()) / 1000;
            if (durationSec > 0) {
                counters.sessionSeconds.push(durationSec);
            }
        } 
        else if (counters.currentState === 'down' && counters.lastTransitionTime !== null) {
            // Trailing gap = disconnect duration
            const gapSec = (endMs - counters.lastTransitionTime) / 1000;
    
            if (gapSec > 0) {
                // Record long outage if > 30 minutes (exactly as #processAllEntries does)
                if (gapSec > 1800) {
                    counters.longDisconnects.push({
                        stopDate: new Date(counters.lastTransitionTime),
                        startDate: new Date(endMs),           // virtual "end" of the window
                        durationSec: gapSec
                    });
                }
            }
        }
    }

    static getEntries(cleanedEntries, requestedStart, requestedEnd) {
        const normalized = this.#normalizeInput(cleanedEntries);
        const gapped = this.#computeLeadTime(normalized, requestedStart);
        return gapped;
    }
    
    /**
     * PUBLIC API — SIGNATURE NOW EXTENDED (but fully backward-compatible)
     * @param {Array|Object} cleanedEntries
     * @param {Date|null} requestedStart - optional, from the date picker
     * @param {Date|null} requestedEnd   - optional, from the date picker
     */
    static computeMetrics(cleanedEntries, requestedStart = null, requestedEnd = null) {
        const normalized = this.#normalizeInput(cleanedEntries);

        // New leading-gap handler (only thing that ever touches the entries array for boundaries)
        const gapped = this.#computeLeadTime(normalized, requestedStart);
        const counters = this.#initializeCounters();
        this.#processAllEntries(gapped.entries, counters);
        this.#calculateEndTime(counters, requestedEnd);

        const totalConnectedSec = counters.sessionSeconds.reduce((a, b) => a + b, 0) || 0;
        
        const uptimeMetrics = this.#computeUptimeMetrics(
            counters.sessionSeconds,
            counters.firstDate,
            counters.lastDate,
            requestedStart,
            requestedEnd,
            totalConnectedSec
        );

        const peakMetrics = this.#computePeakMetrics(counters);
        const timeSinceLast = this.#computeTimeSinceLast(counters.lastDisconnectDate);
        const dailyAverages = this.#computeDailyAverages(counters.dailyCount);
        const sessionMetrics = this.#computeSessionMetrics(counters.sessionSeconds);
        const reconnectMetrics = this.#computeReconnectMetrics(counters.reconnectSeconds);
        const stabilityScore = this.#computeStabilityScore({
            uptimeMetrics,
            sessionMetrics,
            reconnectMetrics,
            counters,
            dailyAverages
        });

        return this.#assembleReturnObject({
            peakMetrics,
            timeSinceLast,
            dailyAverages,
            uptimeMetrics,
            sessionMetrics,
            reconnectMetrics,
            stabilityScore,
            counters,
            entriesLength: normalized.entries.length,
            totalResultsCounted: normalized.totalProcessed || 0,
            ignoredAsDuplicates: normalized.ignored || 0
        });
    }
    
    static #getSessionBonus(metricMin) {
        const metricHours = parseFloat(metricMin) / 60 || 0;
        return 25 * Math.tanh(metricHours / 6);
    }

    /**
     * PRIVATE HELPER
     * Creates and returns a single object containing EVERY counter, array, date, and state variable.
     * Eliminates 20+ scattered "let xyz = ..." declarations at the top of the old method.
     * Makes the rest of the code readable and prevents accidental variable shadowing.
     * @returns {Object} fully initialized counters object
     */
    static #initializeCounters() {
        return {
            disconnects: 0,
            sessionSeconds: [],
            reconnectSeconds: [],
            reconnects: [],
            longDisconnects: [],
            firstDate: null,
            lastDate: null,
            lastDisconnectDate: null,
            hourlyDisconnects: Array(24).fill(0),
            dayOfWeekDisconnects: Array(7).fill(0),
            hourlyCount: Array(24).fill(0),
            dailyCount: {},
            disconnectDates: [],
            currentState: null,
            lastTransitionTime: null
        };
    }

    /**
     * PRIVATE HELPER
     * The heart of the analysis — the original state-machine forEach loop.
     * Walks every entry once, updates ALL counters, tracks state transitions (Start/Stop), builds disconnectDates, etc.
     * Now isolated so you can unit-test the entire processing logic without touching the rest of the method.
     * @param {Array} entries - normalized cleaned entries (oldest → newest)
     * @param {Object} counters - mutable reference (updated in-place for simplicity/performance)
     */
    static #processAllEntries(entries, counters) {
        entries.forEach(entry => {
            const date = entry.dateObj;
            const ts = date.getTime();

            if (!counters.firstDate) counters.firstDate = date;
            counters.lastDate = date;

            if (entry.status === "Start") {
                if (counters.currentState === "down" || counters.currentState === null) {
                    if (counters.currentState === "down" && counters.lastTransitionTime !== null) {
                        const reconnectSec = (ts - counters.lastTransitionTime) / 1000;
                        if (reconnectSec > 0) {
                            counters.reconnectSeconds.push(reconnectSec);
                            counters.reconnects.push({ dateObj: date, sec: reconnectSec });
                            if (reconnectSec > 1800) {
                                counters.longDisconnects.push({
                                    stopDate: new Date(counters.lastTransitionTime),
                                    startDate: date,
                                    durationSec: reconnectSec
                                });
                            }
                        }
                    }
                    counters.currentState = "up";
                    counters.lastTransitionTime = ts;
                }
            } else if (entry.status === "Stop") {
                counters.disconnects++;
                const hour = date.getHours();
                counters.hourlyDisconnects[hour]++;
                counters.hourlyCount[hour]++;
                const dayKey = date.toLocaleDateString();
                counters.dailyCount[dayKey] = (counters.dailyCount[dayKey] || 0) + 1;
                counters.dayOfWeekDisconnects[date.getDay()]++;
                if (counters.currentState === "up" || counters.currentState === null) {
                    if (counters.currentState === "up" && counters.lastTransitionTime !== null) {
                        const duration = (ts - counters.lastTransitionTime) / 1000;
                        if (duration > 0) counters.sessionSeconds.push(duration);
                    }
                    counters.currentState = "down";
                    counters.lastTransitionTime = ts;
                    counters.lastDisconnectDate = date;
                    counters.disconnectDates.push(date);
                }
            }
        });
    }

    /**
     * PRIVATE HELPER
     * Computes peak hour string, peak day string, and business vs off-hours disconnect counts.
     * All peak-related logic lives here — easy to tweak or test.
     * @param {Object} counters - contains hourly* and dailyCount
     * @returns {Object} {peakHourStr, peakDayStr, businessDisconnects, offHoursDisconnects}
     */
    static #computePeakMetrics(counters) {
        const peakHourCount = Math.max(...counters.hourlyCount);
        const peakHour = counters.hourlyCount.indexOf(peakHourCount);
        const peakHourStr = peakHourCount > 0 
            ? `${peakHour}:00-${peakHour + 1}:00 (${peakHourCount} disconnects)` 
            : 'None';

        let peakDayStr = 'None';
        let peakDayCount = 0;
        for (const [day, count] of Object.entries(counters.dailyCount)) {
            if (count > peakDayCount) {
                peakDayCount = count;
                peakDayStr = `${day} (${count} disconnects)`;
            }
        }

        let businessDisconnects = 0;
        let offHoursDisconnects = 0;
        for (let h = 0; h < 24; h++) {
            if (h >= 8 && h < 18) businessDisconnects += counters.hourlyDisconnects[h];
            else offHoursDisconnects += counters.hourlyDisconnects[h];
        }

        return { peakHourStr, peakDayStr, businessDisconnects, offHoursDisconnects };
    }

    /**
     * PRIVATE HELPER
     * Calculates human-readable "time since last disconnect" string.
     * Uses the global formatDuration helper (left unchanged).
     * @param {Date|null} lastDisconnectDate
     * @returns {Object} {timeSinceLastStr: string}
     */
    static #computeTimeSinceLast(lastDisconnectDate) {
        let timeSinceLastStr = 'N/A';
        if (lastDisconnectDate) {
            const sinceSec = (new Date() - lastDisconnectDate) / 1000;
            timeSinceLastStr = formatDuration(sinceSec) + ' ago';
        }
        return { timeSinceLastStr };
    }

    /**
     * PRIVATE HELPER
     * Computes average daily disconnects and sorted daily arrays/labels for charts.
     * @param {Object} dailyCount
     * @returns {Object} {avgDaily, sortedDailyDisconnects, sortedKeys}
     */
    static #computeDailyAverages(dailyCount) {
        const sortedKeys = Object.keys(dailyCount).sort((a, b) => new Date(a) - new Date(b));
        const sortedDailyDisconnects = sortedKeys.map(k => dailyCount[k]);

        const dailyValues = Object.values(dailyCount);
        const avgDaily = dailyValues.length 
            ? (dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length).toFixed(1) 
            : '0';

        return { avgDaily, sortedDailyDisconnects, sortedKeys };
    }

    /**
     * PRIVATE HELPER
     * All uptime-related math: total connected/disconnected seconds, percent, days spanned.
     * @param {Array} sessionSeconds
     * @param {Date|null} firstDate
     * @param {Date|null} lastDate
     * @returns {Object} uptime metrics
     */
    static #computeUptimeMetrics(sessionSeconds, firstDate, lastDate, requestedStart = null, requestedEnd = null, totalConnectedSecOverride = null) {
        const totalConnectedSec = totalConnectedSecOverride !== null 
            ? totalConnectedSecOverride 
            : sessionSeconds.reduce((a, b) => a + b, 0) || 0;

        let rangeStart = firstDate;
        let rangeEnd   = lastDate;

        if (requestedStart) rangeStart = requestedStart;
        if (requestedEnd)   rangeEnd   = requestedEnd;

        const totalRangeSec = rangeStart && rangeEnd 
            ? (rangeEnd.getTime() - rangeStart.getTime()) / 1000 
            : 1;

        let percentConnected = totalRangeSec > 0 
            ? (totalConnectedSec / totalRangeSec * 100).toFixed(2) 
            : 'N/A';

        percentConnected = Math.min(100, percentConnected).toFixed(1);
        const daysSpanned = (totalRangeSec / 86400).toFixed(2);

        return { 
            totalConnectedSec, 
            totalDisconnectedSec: totalRangeSec - totalConnectedSec, 
            percentConnected, 
            daysSpanned,
            firstDate: rangeStart,
            lastDate: rangeEnd
        };
    }

    /**
     * PRIVATE HELPER
     * All session stats: count, avg, min, max, median.
     * @param {Array} sessionSeconds
     * @returns {Object} session metrics
     */
    static #computeSessionMetrics(sessionSeconds) {
        const numSessions = sessionSeconds.length;
        const avgSessionMin = numSessions 
            ? (sessionSeconds.reduce((a, b) => a + b, 0) / numSessions / 60).toFixed(1) 
            : 'N/A';
        const longestSessionMin = numSessions ? Math.max(...sessionSeconds) / 60 : 0;
        const shortestSessionMin = numSessions 
            ? Math.min(...sessionSeconds.filter(s => s > 0)) / 60 
            : 'N/A';

        // median
        let sessionSecondsSorted = [...sessionSeconds].sort((a, b) => a - b);
        let medianSessionSec = 0;
        if (numSessions > 0) {
            const mid = Math.floor(numSessions / 2);
            medianSessionSec = numSessions % 2 
                ? sessionSecondsSorted[mid] 
                : (sessionSecondsSorted[mid - 1] + sessionSecondsSorted[mid]) / 2;
        }
        const medianSessionMin = numSessions ? (medianSessionSec / 60).toFixed(1) : 'N/A';

        return {
            numSessions,
            avgSessionMin,
            longestSessionMin,
            shortestSessionMin,
            medianSessionMin
        };
    }

    /**
     * PRIVATE HELPER
     * All reconnect stats: median, p95, avg, quick count.
     * @param {Array} reconnectSeconds
     * @returns {Object} reconnect metrics
     */
    static #computeReconnectMetrics(reconnectSeconds) {
        let medianReconnectMin = 'N/A';
        let p95ReconnectMin = 'N/A';
        if (reconnectSeconds.length > 0) {
            reconnectSeconds.sort((a, b) => a - b);
            const mid = Math.floor(reconnectSeconds.length / 2);
            const medianSec = reconnectSeconds.length % 2 
                ? reconnectSeconds[mid] 
                : (reconnectSeconds[mid - 1] + reconnectSeconds[mid]) / 2;
            medianReconnectMin = (medianSec / 60).toFixed(1);

            const p95Index = Math.floor(reconnectSeconds.length * 0.95);
            const p95Sec = reconnectSeconds[p95Index];
            p95ReconnectMin = (p95Sec / 60).toFixed(1);
        }

        const avgReconnectMin = reconnectSeconds.length 
            ? (reconnectSeconds.reduce((a, b) => a + b, 0) / reconnectSeconds.length / 60).toFixed(1) 
            : 'N/A';

        const quickReconnects = reconnectSeconds.filter(s => s <= 300).length;

        return {
            medianReconnectMin,
            p95ReconnectMin,
            avgReconnectMin,
            quickReconnects,
            reconnectSeconds   // passed through for scoring
        };
    }

    /**
     * PRIVATE HELPER
     * The entire NEW stability scoring block (uptime dominant + bonuses/penalties).
     * Isolated so you can tweak the formula without touching date or counter logic.
     * Uses global getSessionBonus (unchanged).
     * @param {Object} params - aggregated data from previous helpers
     * @returns {Object} all scoring fields (uptimeComponent, meanStabilityScore, etc.)
     */
    static #computeStabilityScore({ uptimeMetrics, sessionMetrics, reconnectMetrics, counters, dailyAverages }) {
        const UPTIME_WEIGHT = 0.90;
        const SESSION_BONUS_MAX = 20;
        const FAST_RECOVERY_MAX = 12;
        const FLAPPING_PENALTY_MAX = 22;
        const LONG_OUTAGE_PENALTY_MAX = 28;
        const MIN_SCORE_FLOOR = 30;

        const days = Math.max(uptimeMetrics.daysSpanned || 1, 1);
        const uptimeScore = parseFloat(uptimeMetrics.percentConnected) || 0;

        const uptimePoints = uptimeScore * UPTIME_WEIGHT;

        const sessionBonusMean = Math.min(SESSION_BONUS_MAX, getSessionBonus(sessionMetrics.avgSessionMin) || 0);
        const sessionBonusMedian = Math.min(SESSION_BONUS_MAX, getSessionBonus(sessionMetrics.medianSessionMin) || 0);

        const totalReconnects = reconnectMetrics.reconnectSeconds.length;
        const quickRatio = totalReconnects > 0 
            ? reconnectMetrics.reconnectSeconds.filter(s => s <= 300).length / totalReconnects 
            : 0;
        const fastBonus = Math.min(FAST_RECOVERY_MAX, quickRatio * 50);

        const shortDisconnects = counters.disconnects - counters.longDisconnects.length;
        const flapsPerDay = shortDisconnects / days;
        const flappingPenalty = -Math.min(FLAPPING_PENALTY_MAX, Math.pow(flapsPerDay + 1, 1.3) * 4);

        const longOutagesPerWeek = (counters.longDisconnects.length / days) * 7;
        const longOutagePenalty = -Math.min(LONG_OUTAGE_PENALTY_MAX, longOutagesPerWeek * 8);

        let rawMeanScore = uptimePoints + sessionBonusMean + fastBonus + flappingPenalty + longOutagePenalty;
        if (uptimeScore >= 90) rawMeanScore = Math.max(MIN_SCORE_FLOOR, rawMeanScore);
        rawMeanScore = Math.max(0, Math.min(100, rawMeanScore));

        let rawMedianScore = uptimePoints + sessionBonusMedian + fastBonus + flappingPenalty + longOutagePenalty;
        if (uptimeScore >= 90) rawMedianScore = Math.max(MIN_SCORE_FLOOR, rawMedianScore);
        rawMedianScore = Math.max(0, Math.min(100, rawMedianScore));

        return {
            uptimeComponent: uptimePoints.toFixed(1),
            sessionBonusMean: sessionBonusMean.toFixed(1),
            sessionBonusMedian: sessionBonusMedian.toFixed(1),
            totalFastBonus: fastBonus.toFixed(1),
            flappingPenalty: Math.abs(flappingPenalty).toFixed(1),
            longOutagePenalty: Math.abs(longOutagePenalty).toFixed(1),
            rawMeanScore: rawMeanScore.toFixed(1),
            meanStabilityScore: Math.round(rawMeanScore),
            rawMedianScore: rawMedianScore.toFixed(1),
            medianStabilityScore: Math.round(rawMedianScore)
        };
    }

    /**
     * PRIVATE HELPER — #assembleReturnObject
     * Builds the EXACT return object that the rest of the app expects.
     * All previous helpers feed into this single place.
     * Rolling7Day is computed once and properly destructured (permanent fix for the old object bug).
     * @param {Object} parts - all intermediate results
     * @returns {Object} final metrics object (identical to original)
     */
    static #assembleReturnObject(parts) {
        const { peakMetrics, 
                timeSinceLast, 
                dailyAverages, 
                uptimeMetrics, 
                sessionMetrics, 
                reconnectMetrics, 
                stabilityScore, 
                counters, 
                entriesLength,
                totalResultsCounted,  
                ignoredAsDuplicates} = parts;

        // Rolling 7-day — compute ONCE and destructure (prevents the old object-vs-array bug)
        const rolling = NovaAnalyzer.computeRolling7Day(
            counters.disconnectDates, 
            uptimeMetrics.firstDate, 
            uptimeMetrics.lastDate
        );

        return {
            peakHourStr: peakMetrics.peakHourStr,
            peakDayStr: peakMetrics.peakDayStr,
            businessDisconnects: peakMetrics.businessDisconnects,
            offHoursDisconnects: peakMetrics.offHoursDisconnects,
            timeSinceLastStr: timeSinceLast.timeSinceLastStr,
            avgDaily: dailyAverages.avgDaily,
            totalConnectedSec: uptimeMetrics.totalConnectedSec,
            totalDisconnectedSec: uptimeMetrics.totalDisconnectedSec,
            percentConnected: uptimeMetrics.percentConnected,
            numSessions: sessionMetrics.numSessions,
            avgSessionMin: sessionMetrics.avgSessionMin,
            longestSessionMin: sessionMetrics.longestSessionMin,
            shortestSessionMin: sessionMetrics.shortestSessionMin,
            medianReconnectMin: reconnectMetrics.medianReconnectMin,
            p95ReconnectMin: reconnectMetrics.p95ReconnectMin,
            avgReconnectMin: reconnectMetrics.avgReconnectMin,
            quickReconnects: reconnectMetrics.quickReconnects,
            daysSpanned: uptimeMetrics.daysSpanned,
            uptimeComponent: stabilityScore.uptimeComponent,
            sessionBonusMean: stabilityScore.sessionBonusMean,
            sessionBonusMedian: stabilityScore.sessionBonusMedian,
            totalFastBonus: stabilityScore.totalFastBonus,
            flappingPenalty: stabilityScore.flappingPenalty,
            longOutagePenalty: stabilityScore.longOutagePenalty,
            meanStabilityScore: stabilityScore.meanStabilityScore,
            medianStabilityScore: stabilityScore.medianStabilityScore,
            rawMeanScore: stabilityScore.rawMeanScore,
            rawMedianScore: stabilityScore.rawMedianScore,
            monitoringPeriod: uptimeMetrics.firstDate && uptimeMetrics.lastDate 
                ? `${uptimeMetrics.firstDate.toLocaleString()} to ${uptimeMetrics.lastDate.toLocaleString()}` 
                : 'N/A',
            sessionBins: NovaAnalyzer.computeSessionBins(counters.sessionSeconds),
            reconnectBins: NovaAnalyzer.computeReconnectBins(counters.reconnectSeconds),
            rolling7Day: rolling.rolling7Day || [],
            rollingLabels: rolling.rollingLabels || [],
            longDisconnects: counters.longDisconnects,
            disconnects: counters.disconnects,
            hourlyDisconnects: counters.hourlyDisconnects,
            cleanedEntriesLength: entriesLength,
            dailyDisconnects: dailyAverages.sortedDailyDisconnects,
            dailyLabels: dailyAverages.sortedKeys,
            hourlyCount: counters.hourlyCount,
            totalResultsCounted: totalResultsCounted || 0,
            ignoredAsDuplicates: ignoredAsDuplicates || 0
        };
    }

    static computeSessionBins(sessionSeconds) {
        const bins = [0, 0, 0, 0, 0];
        sessionSeconds.forEach(sec => {
            const min = sec / 60;
            if (min <= 5) bins[0]++;
            else if (min <= 30) bins[1]++;
            else if (min <= 60) bins[2]++;
            else if (min <= 240) bins[3]++;
            else bins[4]++;
        });
        return bins;
    }

    static computeReconnectBins(reconnectSeconds) {
        const bins = [0, 0, 0, 0];
        reconnectSeconds.forEach(sec => {
            const min = sec / 60;
            if (min <= 1) bins[0]++;
            else if (min <= 5) bins[1]++;
            else if (min <= 30) bins[2]++;
            else bins[3]++;
        });
        return bins;
    }

    /**
     * Computes a rolling 7-day disconnect count for the given date range.
     * @param {Array<Date>} disconnectDates - Sorted array of disconnect dates
     * @param {Date} firstDate - Start of the monitoring period
     * @param {Date} lastDate - End of the monitoring period
     * @returns {Object} Object containing rolling7Day (array of counts) and rollingLabels (array of date strings)
     */
    static computeRolling7Day(disconnectDates, firstDate, lastDate) {
        if (disconnectDates === undefined || disconnectDates === null) {
            disconnectDates = [];
        }

        disconnectDates.sort((a, b) => a - b);

        const rolling7Day = [];
        const rollingLabels = [];
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        let currentDate = new Date(firstDate || Date.now());
        currentDate.setHours(0,0,0,0);

        while (currentDate <= (lastDate || new Date())) {
            const windowStart = new Date(currentDate - sevenDaysMs);
            const count = disconnectDates.filter(d => d >= windowStart && d <= currentDate).length;
            rolling7Day.push(count);
            rollingLabels.push(currentDate.toLocaleDateString());
            currentDate = new Date(currentDate.getTime() + 24*60*60*1000);
        }
        
        return { rolling7Day, rollingLabels };
    }

    static getEntries(cleanedEntries, requestedStart, requestedEnd = null) {
        if (!requestedStart || !(requestedStart instanceof Date) || isNaN(requestedStart.getTime())) {
            console.error('NovaAnalyzer.getEntries: requestedStart must be a valid Date');
            return { entries: Array.isArray(cleanedEntries) ? cleanedEntries : [] };
        }
    
        const normalized = this.#normalizeInput(cleanedEntries);   // or this.normalizeInput after removing #
        const gapped = this.#computeLeadTime(normalized, requestedStart);
    
        return gapped || { entries: normalized.entries || [] };
    }

    /**
     * PUBLIC API — SIGNATURE NOW EXTENDED (but fully backward-compatible)
     * @param {Array|Object} cleanedEntries
     * @param {Date|null} requestedStart - optional, from the date picker
     * @param {Date|null} requestedEnd   - optional, from the date picker
     */
    static computeMetrics(cleanedEntries, requestedStart = null, requestedEnd = null) {
        const normalized = this.#normalizeInput(cleanedEntries);

        // New leading-gap handler (only thing that ever touches the entries array for boundaries)
        const gapped = this.#computeLeadTime(normalized, requestedStart);
        const counters = this.#initializeCounters();
        this.#processAllEntries(gapped.entries, counters);
        this.#calculateEndTime(counters, requestedEnd);

        const totalConnectedSec = counters.sessionSeconds.reduce((a, b) => a + b, 0) || 0;
        
        const uptimeMetrics = this.#computeUptimeMetrics(
            counters.sessionSeconds,
            counters.firstDate,
            counters.lastDate,
            requestedStart,
            requestedEnd,
            totalConnectedSec
        );

        const peakMetrics = this.#computePeakMetrics(counters);
        const timeSinceLast = this.#computeTimeSinceLast(counters.lastDisconnectDate);
        const dailyAverages = this.#computeDailyAverages(counters.dailyCount);
        const sessionMetrics = this.#computeSessionMetrics(counters.sessionSeconds);
        const reconnectMetrics = this.#computeReconnectMetrics(counters.reconnectSeconds);
        const stabilityScore = this.#computeStabilityScore({
            uptimeMetrics,
            sessionMetrics,
            reconnectMetrics,
            counters,
            dailyAverages
        });

        return this.#assembleReturnObject({
            peakMetrics,
            timeSinceLast,
            dailyAverages,
            uptimeMetrics,
            sessionMetrics,
            reconnectMetrics,
            stabilityScore,
            counters,
            entriesLength: normalized.entries.length,
            totalResultsCounted: normalized.totalProcessed || 0,
            ignoredAsDuplicates: normalized.ignored || 0
        });
    }
    
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaAnalyzer;
}
