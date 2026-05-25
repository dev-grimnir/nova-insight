class NovaAnalyzer {

    /* ============================================================
     *  INPUT NORMALIZATION
     * ============================================================ */

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

    /* ============================================================
     *  BOUNDARY HANDLING
     * ============================================================ */

    /**
     * When the first real log entry lands after requestedStart we have no
     * record of the prior state, so we inject an opposite-status entry at
     * the exact boundary. Trailing boundary is handled in #calculateEndTime
     * via a pure delta (no entry injection).
     */
    static #computeLeadTime(normalized, requestedStart) {
        if (!requestedStart || !(requestedStart instanceof Date) || isNaN(requestedStart.getTime())) {
            console.error('NovaAnalyzer: requestedStart is required and must be a valid Date');
            return null;
        }
        if (!normalized?.entries || normalized.entries.length === 0) {
            console.error('NovaAnalyzer: no log entries found in the requested window');
            return null;
        }

        const firstReal = normalized.entries[0];
        if (firstReal.dateObj.getTime() === requestedStart.getTime()) {
            return normalized;
        }

        const oppositeStatus = firstReal.status === 'Start' ? 'Stop' : 'Start';
        normalized.entries.unshift({
            dateObj: new Date(requestedStart.getTime()),
            status: oppositeStatus
        });

        return normalized;
    }

    /**
     * If the final state is "up", the tail of the window (lastTransitionTime → requestedEnd)
     * is added as a connected session AND as a connectedInterval so monthly buckets see it.
     * If the final state is "down", the tail is a disconnect; record it as a long outage
     * if > 30 minutes, matching #processAllEntries behavior.
     */
    static #calculateEndTime(counters, requestedEnd) {
        if (!requestedEnd || !(requestedEnd instanceof Date) || isNaN(requestedEnd.getTime())) {
            console.error('NovaAnalyzer: requestedEnd is required and must be a valid Date');
            return;
        }

        const endMs = requestedEnd.getTime();

        if (counters.currentState === 'up' && counters.lastTransitionTime !== null) {
            const durationSec = (endMs - counters.lastTransitionTime) / 1000;
            if (durationSec > 0) {
                counters.sessionSeconds.push(durationSec);
                counters.connectedIntervals.push({
                    startMs: counters.lastTransitionTime,
                    endMs: endMs
                });
            }
        }
        else if (counters.currentState === 'down' && counters.lastTransitionTime !== null) {
            const gapSec = (endMs - counters.lastTransitionTime) / 1000;
            if (gapSec > 1800) {
                counters.longDisconnects.push({
                    stopDate: new Date(counters.lastTransitionTime),
                    startDate: new Date(endMs),
                    durationSec: gapSec
                });
            }
        }
    }

    /* ============================================================
     *  CORE PROCESSING
     * ============================================================ */

    static #initializeCounters() {
        return {
            disconnects: 0,
            sessionSeconds: [],
            reconnectSeconds: [],
            longDisconnects: [],
            connectedIntervals: [],          // feeds #computeMonthlyBuckets
            firstDate: null,
            lastDate: null,
            lastDisconnectDate: null,
            hourlyDisconnects: Array(24).fill(0),
            hourlyCount: Array(24).fill(0),
            dailyCount: {},                  // feeds peak-day in #computePeakMetrics
            currentState: null,
            lastTransitionTime: null
        };
    }

    /**
     * Single pass state machine. Closes an up-interval (pushes both sessionSeconds
     * and connectedIntervals) on every up→down transition. Long outages > 30 min
     * are captured on every down→up transition.
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

                if (counters.currentState === "up" || counters.currentState === null) {
                    if (counters.currentState === "up" && counters.lastTransitionTime !== null) {
                        const duration = (ts - counters.lastTransitionTime) / 1000;
                        if (duration > 0) {
                            counters.sessionSeconds.push(duration);
                            counters.connectedIntervals.push({
                                startMs: counters.lastTransitionTime,
                                endMs: ts
                            });
                        }
                    }
                    counters.currentState = "down";
                    counters.lastTransitionTime = ts;
                    counters.lastDisconnectDate = date;
                }
            }
        });
    }

    /* ============================================================
     *  METRIC COMPUTATION
     * ============================================================ */

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

    static #computeTimeSinceLast(lastDisconnectDate) {
        if (!lastDisconnectDate) return { timeSinceLastStr: 'N/A' };
        const sinceSec = (new Date() - lastDisconnectDate) / 1000;
        return { timeSinceLastStr: formatDuration(sinceSec) + ' ago' };
    }

    static #computeUptimeMetrics(sessionSeconds, firstDate, lastDate, requestedStart, requestedEnd) {
        const totalConnectedSec = sessionSeconds.reduce((a, b) => a + b, 0) || 0;

        const rangeStart = requestedStart || firstDate;
        const rangeEnd   = requestedEnd   || lastDate;

        const totalRangeSec = rangeStart && rangeEnd
            ? (rangeEnd.getTime() - rangeStart.getTime()) / 1000
            : 1;

        let percentConnected = totalRangeSec > 0
            ? (totalConnectedSec / totalRangeSec * 100)
            : 0;
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

    static #computeSessionMetrics(sessionSeconds) {
        const n = sessionSeconds.length;
        if (n === 0) {
            return { avgSessionMin: 'N/A', longestSessionMin: 0, shortestSessionMin: 'N/A' };
        }
        const avgSessionMin     = (sessionSeconds.reduce((a, b) => a + b, 0) / n / 60).toFixed(1);
        const longestSessionMin = Math.max(...sessionSeconds) / 60;
        const positives         = sessionSeconds.filter(s => s > 0);
        const shortestSessionMin = positives.length ? Math.min(...positives) / 60 : 'N/A';
        return { avgSessionMin, longestSessionMin, shortestSessionMin };
    }

    static #computeReconnectMetrics(reconnectSeconds) {
        if (reconnectSeconds.length === 0) {
            return { medianReconnectMin: 'N/A', avgReconnectMin: 'N/A' };
        }
        const sorted = [...reconnectSeconds].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianSec = sorted.length % 2
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
        const medianReconnectMin = (medianSec / 60).toFixed(1);
        const avgReconnectMin    = (sorted.reduce((a, b) => a + b, 0) / sorted.length / 60).toFixed(1);
        return { medianReconnectMin, avgReconnectMin };
    }

    /* ============================================================
     *  MONTHLY BUCKETS
     * ============================================================ */

    /**
     * Walks calendar months across [requestedStart, requestedEnd] and
     * computes connected/disconnected seconds for each, clipping partial
     * months at the boundaries to the actual requested range.
     *
     * A March bar on a Mar 15 – Nov 22 report reflects Mar 15–31 only.
     * Tooltips and drill-down should use startDate/endDate from each bucket.
     */
    static #computeMonthlyBuckets(connectedIntervals, requestedStart, requestedEnd) {
        if (!requestedStart || !requestedEnd) return [];

        const buckets  = [];
        const reqStart = requestedStart.getTime();
        const reqEnd   = requestedEnd.getTime();

        let year  = requestedStart.getFullYear();
        let month = requestedStart.getMonth();

        while (true) {
            const calStart = new Date(year, month,     1, 0, 0, 0, 0).getTime();
            const calEnd   = new Date(year, month + 1, 1, 0, 0, 0, 0).getTime(); // exclusive

            if (calStart >= reqEnd) break;

            const startMs = Math.max(calStart, reqStart);
            const endMs   = Math.min(calEnd,   reqEnd);

            if (endMs > startMs) {
                const totalSec = (endMs - startMs) / 1000;

                let connectedSec = 0;
                for (const iv of connectedIntervals) {
                    const oStart = Math.max(iv.startMs, startMs);
                    const oEnd   = Math.min(iv.endMs,   endMs);
                    if (oEnd > oStart) connectedSec += (oEnd - oStart) / 1000;
                }
                connectedSec = Math.min(connectedSec, totalSec);  // clamp FP slop
                const disconnectedSec = totalSec - connectedSec;

                buckets.push({
                    year,
                    month,                                // 0-indexed
                    startDate: new Date(startMs),
                    endDate:   new Date(endMs),
                    connectedSec,
                    disconnectedSec,
                    percentConnected:    parseFloat((connectedSec    / totalSec * 100).toFixed(2)),
                    percentDisconnected: parseFloat((disconnectedSec / totalSec * 100).toFixed(2))
                });
            }

            month++;
            if (month > 11) { month = 0; year++; }
        }

        return buckets;
    }

    /* ============================================================
     *  RETURN ASSEMBLY
     * ============================================================ */

    static #assembleReturnObject(parts) {
        const {
            peakMetrics,
            timeSinceLast,
            uptimeMetrics,
            sessionMetrics,
            reconnectMetrics,
            monthlyBuckets,
            counters,
            totalResultsCounted,
            ignoredAsDuplicates
        } = parts;

        return {
            // Peak
            peakHourStr:         peakMetrics.peakHourStr,
            peakDayStr:          peakMetrics.peakDayStr,
            businessDisconnects: peakMetrics.businessDisconnects,
            offHoursDisconnects: peakMetrics.offHoursDisconnects,

            // Time
            timeSinceLastStr: timeSinceLast.timeSinceLastStr,
            monitoringPeriod: uptimeMetrics.firstDate && uptimeMetrics.lastDate
                ? `${uptimeMetrics.firstDate.toLocaleString()} to ${uptimeMetrics.lastDate.toLocaleString()}`
                : 'N/A',
            daysSpanned: uptimeMetrics.daysSpanned,

            // Uptime
            totalConnectedSec:    uptimeMetrics.totalConnectedSec,
            totalDisconnectedSec: uptimeMetrics.totalDisconnectedSec,
            percentConnected:     uptimeMetrics.percentConnected,

            // Sessions
            avgSessionMin:      sessionMetrics.avgSessionMin,
            longestSessionMin:  sessionMetrics.longestSessionMin,
            shortestSessionMin: sessionMetrics.shortestSessionMin,

            // Reconnects
            avgReconnectMin:    reconnectMetrics.avgReconnectMin,
            medianReconnectMin: reconnectMetrics.medianReconnectMin,

            // Counts
            disconnects:         counters.disconnects,
            longDisconnects:     counters.longDisconnects,
            hourlyDisconnects:   counters.hourlyDisconnects,
            dailyCount:          counters.dailyCount,
            totalResultsCounted: totalResultsCounted || 0,
            ignoredAsDuplicates: ignoredAsDuplicates || 0,

            // Monthly bar chart (NEW)
            monthlyBuckets
        };
    }

    /* ============================================================
     *  PUBLIC API
     * ============================================================ */

    static computeMetrics(cleanedEntries, requestedStart = null, requestedEnd = null) {
        const normalized = this.#normalizeInput(cleanedEntries);
        const gapped = this.#computeLeadTime(normalized, requestedStart);
        if (!gapped) return null;

        const counters = this.#initializeCounters();
        this.#processAllEntries(gapped.entries, counters);
        this.#calculateEndTime(counters, requestedEnd);

        const peakMetrics      = this.#computePeakMetrics(counters);
        const timeSinceLast    = this.#computeTimeSinceLast(counters.lastDisconnectDate);
        const uptimeMetrics    = this.#computeUptimeMetrics(
            counters.sessionSeconds,
            counters.firstDate,
            counters.lastDate,
            requestedStart,
            requestedEnd
        );
        const sessionMetrics   = this.#computeSessionMetrics(counters.sessionSeconds);
        const reconnectMetrics = this.#computeReconnectMetrics(counters.reconnectSeconds);
        const monthlyBuckets   = this.#computeMonthlyBuckets(
            counters.connectedIntervals,
            requestedStart,
            requestedEnd
        );

        return this.#assembleReturnObject({
            peakMetrics,
            timeSinceLast,
            uptimeMetrics,
            sessionMetrics,
            reconnectMetrics,
            monthlyBuckets,
            counters,
            totalResultsCounted: normalized.totalProcessed || 0,
            ignoredAsDuplicates: normalized.ignored || 0
        });
    }

    static getEntries(cleanedEntries, requestedStart) {
        if (!requestedStart || !(requestedStart instanceof Date) || isNaN(requestedStart.getTime())) {
            console.error('NovaAnalyzer.getEntries: requestedStart must be a valid Date');
            return { entries: Array.isArray(cleanedEntries) ? cleanedEntries : [] };
        }
        const normalized = this.#normalizeInput(cleanedEntries);
        const gapped = this.#computeLeadTime(normalized, requestedStart);
        return gapped || { entries: normalized.entries || [] };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaAnalyzer;
}
