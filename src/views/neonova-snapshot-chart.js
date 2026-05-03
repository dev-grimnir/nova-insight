/**
 * Shared chart builder for both NeonovaSnapshotView (modal) and
 * NeonovaReportSnapshotView (inline). Views are dumb — they call
 * build() with a canvas, a model, and a click callback.
 *
 * Single-dataset architecture: one line that steps between y=+1 (connected)
 * and y=-1 (disconnected), with fill split above/below origin (green above,
 * red below). This eliminates the dual-dataset interpolation artifacts that
 * produced phantom diagonals on dense long-range charts.
 *
 * Tick density scales with range: month / day / hour. Click in the bottom
 * tick-label strip drills to the matching range granularity.
 */
class NeonovaSnapshotChart {

    static #MS_PER_DAY = 86400000;
    static #MONTH_THRESHOLD_DAYS = 60;

    /* ============================================================
     *  GRANULARITY + TICKS
     * ============================================================ */

    static #getGranularity(startMs, endMs) {
        const days = (endMs - startMs) / this.#MS_PER_DAY;
        if (days >= this.#MONTH_THRESHOLD_DAYS) return 'month';
        if (days > 1.01) return 'day';
        return 'hour';
    }

    static #monthTickValues(startMs, endMs) {
        const ticks = [];
        const start = new Date(startMs);
        let year  = start.getFullYear();
        let month = start.getMonth();
        if (start.getDate() !== 1 || start.getHours() !== 0 || start.getMinutes() !== 0) {
            month++;
            if (month > 11) { month = 0; year++; }
        }
        while (true) {
            const t = new Date(year, month, 1, 0, 0, 0, 0).getTime();
            if (t > endMs) break;
            ticks.push(t);
            month++;
            if (month > 11) { month = 0; year++; }
        }
        return ticks;
    }

    static #dayTickValues(startMs, endMs) {
        const ticks = [];
        const cursor = new Date(startMs);
        cursor.setHours(0, 0, 0, 0);
        if (cursor.getTime() < startMs) cursor.setDate(cursor.getDate() + 1);
        while (cursor.getTime() <= endMs) {
            ticks.push(cursor.getTime());
            cursor.setDate(cursor.getDate() + 1);
        }
        return ticks;
    }

    static #hourTickValues(startMs, endMs) {
        const ticks = [];
        const cursor = new Date(startMs);
        cursor.setMinutes(0, 0, 0);
        if (cursor.getTime() < startMs) cursor.setHours(cursor.getHours() + 1);
        while (cursor.getTime() <= endMs) {
            ticks.push(cursor.getTime());
            cursor.setHours(cursor.getHours() + 1);
        }
        return ticks;
    }

    static #formatTick(ms, granularity) {
        const d = new Date(ms);
        if (granularity === 'month') {
            return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        }
        if (granularity === 'day') {
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        return `${d.getHours().toString().padStart(2, '0')}:00`;
    }

    /* ============================================================
     *  PERIOD BUILDING
     * ============================================================ */

    /**
     * Group consecutive same-state events into periods. Each period
     * carries its start/end timestamps and connected flag.
     */
    static #buildPeriods(sortedEvents, endTime) {
        const periods = [];
        if (sortedEvents.length === 0) return periods;

        let i = 0;
        while (i < sortedEvents.length) {
            const isConnected = (sortedEvents[i].status === 'Start' || sortedEvents[i].status === 'connected');
            const startMs = sortedEvents[i].dateObj.getTime();

            let j = i + 1;
            while (j < sortedEvents.length &&
                   ((sortedEvents[j].status === 'Start' || sortedEvents[j].status === 'connected') === isConnected)) {
                j++;
            }

            const endMs = j < sortedEvents.length
                ? sortedEvents[j].dateObj.getTime()
                : endTime;

            periods.push({ startMs, endMs, isConnected });
            i = j;
        }
        return periods;
    }

    /**
     * Collapse periods that are below the visible pixel threshold into
     * aggregated runs. At 1200px wide across 11 months, each pixel covers
     * ~6.6 hours — anything shorter is invisible anyway. Aggregation
     * preserves visual accuracy while keeping render volume manageable.
     *
     * Strategy: scan periods in order. If the current period is shorter
     * than minMs, merge it with adjacent short periods into a single
     * aggregate whose state is determined by total duration of each side.
     */
    static #aggregatePeriods(periods, minMs) {
        if (periods.length === 0) return periods;

        const out = [];
        let i = 0;
        while (i < periods.length) {
            const p = periods[i];
            const dur = p.endMs - p.startMs;

            if (dur >= minMs) {
                out.push(p);
                i++;
                continue;
            }

            // Walk forward absorbing periods until we have a chunk >= minMs
            let chunkStart = p.startMs;
            let chunkEnd = p.endMs;
            let connectedMs = p.isConnected ? dur : 0;
            let disconnectedMs = p.isConnected ? 0 : dur;
            let j = i + 1;
            while (j < periods.length && (chunkEnd - chunkStart) < minMs) {
                const q = periods[j];
                const qDur = q.endMs - q.startMs;
                chunkEnd = q.endMs;
                if (q.isConnected) connectedMs += qDur;
                else               disconnectedMs += qDur;
                j++;
            }

            out.push({
                startMs: chunkStart,
                endMs:   chunkEnd,
                isConnected: connectedMs >= disconnectedMs
            });
            i = j;
        }
        return out;
    }

    /* ============================================================
     *  PUBLIC BUILD
     * ============================================================ */

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {NeonovaSnapshotModel} model
     * @param {(startDate: Date, endDate: Date) => void} onRangeClick
     * @returns {{ chart: Chart, periods: Array }}
     */
    static build(canvas, model, onRangeClick) {
        const events = (model.getEvents ? model.getEvents() : model.events) || [];
        const sortedEvents = [...events].sort((a, b) =>
            (a.dateObj || new Date(0)) - (b.dateObj || new Date(0))
        );

        const startTime = model.startDate.getTime();
        const endTime   = model.endDate.getTime();

        const rawPeriods = this.#buildPeriods(sortedEvents, endTime);
        const granularity = this.#getGranularity(startTime, endTime);

        // Estimate the canvas's visible pixel width. We don't have it before
        // the chart mounts, so use the canvas's CSS size or fall back to 1200.
        const canvasWidth = canvas.clientWidth || canvas.width || 1200;
        const rangeMs = endTime - startTime;
        const msPerPixel = rangeMs / canvasWidth;
        // Aggregate periods narrower than half a pixel — invisible anyway.
        const minVisibleMs = msPerPixel * 0.5;
        const periods = this.#aggregatePeriods(rawPeriods, minVisibleMs);

        const tickValues = granularity === 'month' ? this.#monthTickValues(startTime, endTime)
                         : granularity === 'day'   ? this.#dayTickValues(startTime, endTime)
                         :                            this.#hourTickValues(startTime, endTime);

        // ONE dataset. Each period is two points at the same y, separated
        // from the next period by a NaN-y point. Chart.js treats NaN y as
        // a discontinuity — it ends the current fill segment and starts a
        // new one. This prevents the fill renderer from drawing transitional
        // polygons that leak the wrong color across the origin axis when a
        // period transitions from +1 to -1.
        const data = [];
        periods.forEach((p, idx) => {
            const y = p.isConnected ? 1 : -1;
            data.push({ x: p.startMs, y });
            data.push({ x: p.endMs,   y });
            // Discontinuity between periods. The NaN point's x sits at the
            // boundary so the next period picks up exactly where this one ends.
            if (idx < periods.length - 1) {
                data.push({ x: p.endMs, y: NaN });
            }
        });

        const chart = new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Connection',
                    data,
                    borderColor: 'transparent',
                    borderWidth: 0,
                    stepped: 'before',
                    tension: 0,
                    pointRadius: 0,
                    spanGaps: false,
                    fill: {
                        target: 'origin',
                        above: '#10b98188',  // green when y > 0
                        below: '#ef444488'   // red when y < 0
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    decimation: { enabled: false },
                    tooltip: {
                        enabled: true,
                        intersect: false,
                        mode: 'index',
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                return new Date(items[0].parsed.x).toLocaleString([], {
                                    month: 'short', day: 'numeric',
                                    hour: 'numeric', minute: '2-digit'
                                });
                            },
                            label: (ctx) => {
                                if (ctx.parsed.y === 0) return "";

                                const currentX = ctx.parsed.x;
                                const period = periods.find(p => currentX >= p.startMs && currentX <= p.endMs);
                                if (!period) return '';

                                const fmt = (ms) => new Date(ms).toLocaleString([], {
                                    month: 'short', day: 'numeric',
                                    hour: 'numeric', minute: '2-digit'
                                });

                                const durMs  = period.endMs - period.startMs;
                                const hours  = Math.floor(durMs / 3600000);
                                const mins   = Math.floor((durMs % 3600000) / 60000);
                                const durStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                                const label = period.isConnected ? 'Connected' : 'Disconnected';
                                return `${label} — ${fmt(period.startMs)} to ${fmt(period.endMs)} (${durStr})`;
                            },
                            labelColor: (ctx) => {
                                if (ctx.parsed.y === 0) return null;
                                const period = periods.find(p => ctx.parsed.x >= p.startMs && ctx.parsed.x <= p.endMs);
                                if (!period) return null;
                                const color = period.isConnected ? '#10b981' : '#ef4444';
                                return {
                                    borderColor: color,
                                    backgroundColor: color
                                };
                            },
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: startTime,
                        max: endTime,
                        grid: { color: '#27272a' },
                        ticks: {
                            color: '#64748b',
                            autoSkip: false,
                            callback: (value) => this.#formatTick(value, granularity)
                        },
                        afterBuildTicks: (axis) => {
                            axis.ticks = tickValues.map(v => ({ value: v }));
                        }
                    },
                    y: {
                        min: -1.25,
                        max: 1.25,
                        ticks: { display: false },
                        grid: {
                            color: ctx => ctx.tick.value === 0 ? '#a3a3a3' : '#27272a',
                            lineWidth: ctx => ctx.tick.value === 0 ? 4 : 1.5
                        }
                    }
                },
                layout: { padding: { right: 40, left: 20, top: 30, bottom: 20 } }
            }
        });

        setTimeout(() => {
            chart?.resize();
            this.#mountTickClickTargets(canvas, chart, tickValues, granularity, startTime, endTime, onRangeClick);
        }, 100);

        return { chart, periods };
    }

    /**
     * Position invisible clickable elements over each x-axis tick label.
     * Each tick is its own DOM target — no pixel math at click time, real
     * hover state on the actual label region. Re-runs on resize.
     */
    static #mountTickClickTargets(canvas, chart, tickValues, granularity, startTime, endTime, onRangeClick) {
        if (!onRangeClick || granularity === 'hour') return;

        const parent = canvas.parentElement;
        if (!parent) return;

        // Make the parent a positioning context so absolutely-positioned
        // overlays sit relative to the canvas.
        const computedPos = getComputedStyle(parent).position;
        if (computedPos === 'static') parent.style.position = 'relative';

        // Clear any prior overlays from a previous build (drill re-renders).
        parent.querySelectorAll('[data-tick-target]').forEach(el => el.remove());

        const xScale = chart.scales.x;
        if (!xScale) return;

        const canvasRect = canvas.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const offsetLeft = canvasRect.left - parentRect.left;
        const offsetTop  = canvasRect.top  - parentRect.top;

        const labelTop    = chart.chartArea.bottom + offsetTop;
        const labelHeight = canvas.height - chart.chartArea.bottom + offsetTop;

        tickValues.forEach((tickMs, idx) => {
            const px = xScale.getPixelForValue(tickMs);
            if (px == null || isNaN(px)) return;

            // Determine the click target's horizontal extent — half-distance
            // to neighboring ticks. Edge ticks extend out to the chart edge.
            const prevMs = idx > 0 ? tickValues[idx - 1] : startTime;
            const nextMs = idx < tickValues.length - 1 ? tickValues[idx + 1] : endTime;
            const prevPx = xScale.getPixelForValue(prevMs);
            const nextPx = xScale.getPixelForValue(nextMs);

            const leftPx  = (prevPx + px) / 2;
            const rightPx = (px + nextPx) / 2;
            const widthPx = rightPx - leftPx;

            const target = document.createElement('div');
            target.setAttribute('data-tick-target', '1');
            target.style.cssText = `
                position: absolute;
                left: ${leftPx + offsetLeft}px;
                top: ${labelTop}px;
                width: ${widthPx}px;
                height: ${labelHeight}px;
                cursor: pointer;
                z-index: 10;
            `;

            target.addEventListener('click', () => {
                const clicked = new Date(tickMs);
                let drillStart, drillEnd;

                if (granularity === 'month') {
                    drillStart = new Date(clicked.getFullYear(), clicked.getMonth(), 1, 0, 0, 0, 0);
                    drillEnd   = new Date(clicked.getFullYear(), clicked.getMonth() + 1, 1, 0, 0, 0, 0);
                    drillEnd   = new Date(drillEnd.getTime() - 1);
                    if (drillStart.getTime() < startTime) drillStart = new Date(startTime);
                    if (drillEnd.getTime()   > endTime)   drillEnd   = new Date(endTime);
                } else {
                    drillStart = new Date(clicked.getFullYear(), clicked.getMonth(), clicked.getDate(), 0, 0, 0, 0);
                    drillEnd   = new Date(clicked.getFullYear(), clicked.getMonth(), clicked.getDate(), 23, 59, 59, 999);
                }

                onRangeClick(drillStart, drillEnd);
            });

            parent.appendChild(target);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeonovaSnapshotChart;
}
