/**
 * Shared chart builder for both NovaSnapshotView (modal) and
 * NovaReportSnapshotView (inline). Views are dumb — they call
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
class NovaSnapshotChart {

    static #MS_PER_DAY = 86400000;
    static #MONTH_THRESHOLD_DAYS = 60;
    static #HOUR_THRESHOLD_DAYS  = 0.05;

    /* ============================================================
     *  GRANULARITY + TICKS
     * ============================================================ */

    static #getGranularity(startMs, endMs) {
        const days = (endMs - startMs) / this.#MS_PER_DAY;
        if (days >= this.#MONTH_THRESHOLD_DAYS) return 'month';
        if (days > 1.01) return 'day';
        if (days > this.#HOUR_THRESHOLD_DAYS) return 'hour';
        return 'minute';
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

    static #minuteTickValues(startMs, endMs) {
        const INTERVAL = 10 * 60 * 1000;
        const ticks = [];
        const cursor = new Date(Math.ceil(startMs / INTERVAL) * INTERVAL);
        while (cursor.getTime() <= endMs) {
            ticks.push(cursor.getTime());
            cursor.setTime(cursor.getTime() + INTERVAL);
        }
        if (ticks.length === 0 || ticks[ticks.length - 1] < endMs) {
            ticks.push(endMs);
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
        if (granularity === 'hour') {
            return `${d.getHours().toString().padStart(2, '0')}:00`;
        }
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    /* ============================================================
     *  PERIOD BUILDING
     * ============================================================ */

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

    static build(canvas, model, onRangeClick) {
        const events = (model.getEvents ? model.getEvents() : model.events) || [];
        const sortedEvents = [...events].sort((a, b) =>
            (a.dateObj || new Date(0)) - (b.dateObj || new Date(0))
        );

        const startTime = model.startDate.getTime();
        const endTime   = model.endDate.getTime();

        const rawPeriods = this.#buildPeriods(sortedEvents, endTime);
        const granularity = this.#getGranularity(startTime, endTime);

        const canvasWidth = canvas.clientWidth || canvas.width || 1200;
        const rangeMs = endTime - startTime;
        const msPerPixel = rangeMs / canvasWidth;
        const minVisibleMs = msPerPixel * 0.5;
        const periods = this.#aggregatePeriods(rawPeriods, minVisibleMs);

        const tickValues = granularity === 'month'  ? this.#monthTickValues(startTime, endTime)
                         : granularity === 'day'    ? this.#dayTickValues(startTime, endTime)
                         : granularity === 'hour'   ? this.#hourTickValues(startTime, endTime)
                         :                            this.#minuteTickValues(startTime, endTime);

        const data = [];
        periods.forEach((p, idx) => {
            const y = p.isConnected ? 1 : -1;
            data.push({ x: p.startMs, y });
            data.push({ x: p.endMs,   y });
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
                        above: '#10b98188',
                        below: '#ef444488'
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    decimation: { enabled: false },
                    tooltip: { enabled: false }
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

        this.#mountCustomTooltip(canvas, chart, periods);

        return { chart, periods };
    }

    static #mountCustomTooltip(canvas, chart, periods) {
        const TIP_ID = 'snap-chart-tooltip';

        const fmt = function(ms) {
            return new Date(ms).toLocaleString([], {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            });
        };

        const hide = function() {
            var el = document.getElementById(TIP_ID);
            if (el) el.remove();
        };

        canvas.addEventListener('mousemove', function(e) {
            var rect    = canvas.getBoundingClientRect();
            var mouseX  = e.clientX - rect.left;
            var area    = chart.chartArea;
            if (!area || mouseX < area.left || mouseX > area.right) { hide(); return; }

            var xScale  = chart.scales.x;
            var pxLeft  = xScale.left;
            var pxRight = xScale.right;
            var t       = (mouseX - pxLeft) / (pxRight - pxLeft);
            var cursorMs = xScale.min + t * (xScale.max - xScale.min);

            var period = null;
            for (var i = 0; i < periods.length; i++) {
                var isLast = (i === periods.length - 1);
                if (cursorMs >= periods[i].startMs && (isLast ? cursorMs <= periods[i].endMs : cursorMs < periods[i].endMs)) {
                    period = periods[i]; break;
                }
            }
            if (!period) { hide(); return; }

            var durMs  = period.endMs - period.startMs;
            var hours  = Math.floor(durMs / 3600000);
            var mins   = Math.floor((durMs % 3600000) / 60000);
            var durStr = hours > 0 ? (hours + 'h ' + mins + 'm') : (mins + 'm');
            var label  = period.isConnected ? 'Connected' : 'Disconnected';
            var color  = period.isConnected ? '#10b981' : '#ef4444';
            var title  = new Date(cursorMs).toLocaleString([], {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            });

            var tip = document.getElementById(TIP_ID);
            if (!tip) {
                tip = document.createElement('div');
                tip.id = TIP_ID;
                tip.style.position      = 'fixed';
                tip.style.zIndex        = '10200';
                tip.style.pointerEvents = 'none';
                tip.style.background    = '#27272a';
                tip.style.border        = '1px solid #3f3f46';
                tip.style.borderRadius  = '0.5rem';
                tip.style.padding       = '0.5rem 0.75rem';
                tip.style.fontSize      = '0.8rem';
                tip.style.color         = '#e5e7eb';
                tip.style.boxShadow     = '0 4px 16px rgba(0,0,0,0.5)';
                tip.style.whiteSpace    = 'nowrap';
                document.body.appendChild(tip);
            }

            tip.innerHTML =
                '<div style="font-weight:600;margin-bottom:3px;">' + title + '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;' +
                        'background:' + color + ';border:1px solid ' + color + ';flex-shrink:0;"></span>' +
                    '<span>' + label + ' &mdash; ' + fmt(period.startMs) + ' to ' + fmt(period.endMs) + ' (' + durStr + ')</span>' +
                '</div>';

            var pad = 12;
            var tw  = tip.offsetWidth;
            var th  = tip.offsetHeight;
            var tx  = e.clientX + pad;
            var ty  = e.clientY - th - pad;
            if (tx + tw > window.innerWidth - 8) tx = e.clientX - tw - pad;
            if (ty < 8) ty = e.clientY + pad;
            tip.style.left = tx + 'px';
            tip.style.top  = ty + 'px';
        });

        canvas.addEventListener('mouseleave', hide);
    }

    static #mountTickClickTargets(canvas, chart, tickValues, granularity, startTime, endTime, onRangeClick) {
        if (!onRangeClick || granularity === 'minute') return;

        const parent = canvas.parentElement;
        if (!parent) return;

        const computedPos = getComputedStyle(parent).position;
        if (computedPos === 'static') parent.style.position = 'relative';

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
                } else if (granularity === 'day') {
                    drillStart = new Date(clicked.getFullYear(), clicked.getMonth(), clicked.getDate(), 0, 0, 0, 0);
                    drillEnd   = new Date(clicked.getFullYear(), clicked.getMonth(), clicked.getDate(), 23, 59, 59, 999);
                    if (drillStart.getTime() < startTime) drillStart = new Date(startTime);
                    const upperMs = Math.min(endTime, Date.now());
                    if (drillEnd.getTime() > upperMs) drillEnd = new Date(upperMs);
                } else {
                    drillStart = new Date(clicked.getFullYear(), clicked.getMonth(), clicked.getDate(), clicked.getHours(), 0, 0, 0);
                    drillEnd   = new Date(clicked.getFullYear(), clicked.getMonth(), clicked.getDate(), clicked.getHours(), 59, 59, 999);
                    if (drillStart.getTime() < startTime) drillStart = new Date(startTime);
                    const upperMs = Math.min(endTime, Date.now());
                    if (drillEnd.getTime() > upperMs) drillEnd = new Date(upperMs);
                }

                onRangeClick(drillStart, drillEnd);
            });

            parent.appendChild(target);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaSnapshotChart;
}
