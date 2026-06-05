/**
 * Shared snapshot paradigm: header + canvas + drilldown wiring.
 * Mounted into whatever container the wrapping view provides — modal
 * content area for NovaSnapshotView, parent slot for
 * NovaReportSnapshotView. Container element is provided by the wrapper.
 *
 * Selectors are class-scoped (.snap-panel-*) and queried within
 * this.container so multiple panels could coexist without ID collision.
 */
class NovaSnapshotPanelView {

    static CHART_HEIGHT_PX = 260;

    #chartInstance = null;

    constructor(controller, model, containerEl) {
        this.controller = controller;
        this.model = model;
        this.container = containerEl;
    }

    show() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="bg-zinc-900 border border-zinc-700 rounded-3xl overflow-hidden">
                <div class="px-8 py-4 border-b border-zinc-700 bg-[#09090b] flex items-center justify-between gap-6">
                    <div class="flex items-center gap-4 shrink-0">
                        <button class="snap-panel-back-btn hidden px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            ← Back
                        </button>
                        <div>
                            <div class="snap-panel-subtitle text-emerald-400 text-xs font-mono tracking-widest">${this.model.friendlyName || 'Customer'} — Connection Timeline</div>
                            <div class="snap-panel-daterange text-lg font-semibold text-white mt-1">${this.model.getDateRangeString()}</div>
                        </div>
                    </div>
                    <div class="snap-panel-ribbon flex flex-col gap-1.5 shrink-0">
                        ${this.#buildRibbon()}
                    </div>
                </div>
                <div class="snap-panel-body p-6">
                    <div style="height: ${NovaSnapshotPanelView.CHART_HEIGHT_PX}px;">
                        <canvas class="snap-panel-canvas"></canvas>
                    </div>
                </div>
            </div>
        `;

        this.#attachListeners();
        setTimeout(() => this.#initChart(), 150);
    }

    #renderBody() {
        const body = this.container.querySelector('.snap-panel-body');
        if (!body) return;
        body.innerHTML = `
            <div style="height: ${NovaSnapshotPanelView.CHART_HEIGHT_PX}px;">
                <canvas class="snap-panel-canvas"></canvas>
            </div>
        `;
    }

    #initChart() {
        const canvas = this.container.querySelector('.snap-panel-canvas');
        if (!canvas) return;

        const result = NovaSnapshotChart.build(
            canvas,
            this.model,
            (startDate, endDate) => this.#onRangeClick(startDate, endDate)
        );
        this.#chartInstance = result.chart;
    }

    #updateHeader() {
        const subtitle  = this.container.querySelector('.snap-panel-subtitle');
        const daterange = this.container.querySelector('.snap-panel-daterange');
        const ribbon    = this.container.querySelector('.snap-panel-ribbon');
        const backBtn   = this.container.querySelector('.snap-panel-back-btn');

        if (subtitle)  subtitle.textContent  = `${this.model.friendlyName || 'Customer'} — Connection Timeline`;
        if (daterange) { daterange.textContent = this.model.getDateRangeString(); daterange.className = 'snap-panel-daterange text-lg font-semibold text-white mt-1'; }
        if (ribbon)    ribbon.innerHTML      = this.#buildRibbon();

        if (backBtn) backBtn.classList.toggle('hidden', !this.controller.canGoBack());
        this.#attachTooltipListeners();
    }

    #attachListeners() {
        const backBtn = this.container.querySelector('.snap-panel-back-btn');
        backBtn?.addEventListener('click', () => this.#onBack());
        this.#attachTooltipListeners();
    }

    #attachTooltipListeners() {
        const anchor = this.container.querySelector('.snap-tooltip-anchor');
        if (!anchor) return;

        let hideTimer = null;

        const showTooltip = () => {
            clearTimeout(hideTimer);
            if (document.getElementById('snap-floating-tooltip')) return;

            const longList = this.model.getMetrics().longDisconnects || [];
            const rows = longList.length === 0
                ? '<div class="text-zinc-500 text-xs">None</div>'
                : longList.map(d => {
                    const fmt = (dt) => dt instanceof Date
                        ? dt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : '—';
                    const dur = d.durationSec ? formatDuration(d.durationSec) : '—';
                    return `<div class="text-white text-xs py-0.5 border-b border-zinc-700 last:border-0 whitespace-nowrap">
                        ${fmt(d.stopDate)} → ${fmt(d.startDate)}
                        <span class="text-red-400 ml-1">(${dur})</span>
                    </div>`;
                }).join('');

            const tip = document.createElement('div');
            tip.id = 'snap-floating-tooltip';
            tip.innerHTML = `
                <style>
                    #snap-floating-tooltip::-webkit-scrollbar { width: 7px; }
                    #snap-floating-tooltip::-webkit-scrollbar-track { background: #18181b; border-radius: 9999px; }
                    #snap-floating-tooltip::-webkit-scrollbar-thumb { background: #34d399; border-radius: 9999px; border: 2px solid #18181b; }
                    #snap-floating-tooltip::-webkit-scrollbar-thumb:hover { background: #10b981; }
                </style>
                <div class="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mb-2">Outages &gt; 30 min</div>
                ${rows}
            `;
            tip.className = 'fixed z-[10100] bg-zinc-900 border border-zinc-600 rounded-xl p-3 max-h-48 overflow-y-auto w-96 text-left shadow-2xl';
            tip.style.scrollbarWidth = 'thin';
            tip.style.scrollbarColor = '#34d399 #18181b';
            document.body.appendChild(tip);

            const rect = anchor.getBoundingClientRect();
            tip.style.left = `${Math.max(8, rect.right - tip.offsetWidth)}px`;
            tip.style.top  = `${rect.bottom}px`;

            tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            tip.addEventListener('mouseleave', hideTooltip);
        };

        const hideTooltip = () => {
            hideTimer = setTimeout(() => {
                document.getElementById('snap-floating-tooltip')?.remove();
            }, 80);
        };

        anchor.addEventListener('mouseenter', showTooltip);
        anchor.addEventListener('mouseleave', hideTooltip);
    }

    #buildRibbon() {
        const m      = this.model.getMetrics();
        const status = this.model.getCurrentStatus();
        const isLive = this.model.isLiveWindow();

        const statusColor = status.isUp === null
            ? 'text-zinc-400'
            : status.isUp ? 'text-emerald-400' : 'text-red-400';

        const fmtMin = (v) => {
            if (v == null || v === 'N/A' || isNaN(Number(v))) return 'N/A';
            return formatDuration(Number(v) * 60);
        };

        const longList = m.longDisconnects || [];

        const uptime = parseFloat(this.model.getUptimePercent());
        const uptimeColor = uptime >= 75 ? 'text-emerald-400' : uptime >= 60 ? 'text-yellow-400' : 'text-red-400';

        const stat = (label, value, valueClass = 'text-white') =>
            `<div class="flex flex-col items-center px-3 py-1.5 bg-zinc-800 rounded-xl min-w-[90px]">
                <span class="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">${label}</span>
                <span class="text-sm font-semibold ${valueClass} whitespace-nowrap">${value}</span>
            </div>`;

        const longDisconnectStat =
            `<div class="snap-tooltip-anchor flex flex-col items-center px-3 py-1.5 bg-zinc-800 rounded-xl min-w-[90px] cursor-default">
                <span class="text-[10px] font-mono text-zinc-400 tracking-wider uppercase whitespace-nowrap">Long Disconnects</span>
                <span class="text-sm font-semibold text-white">${longList.length}</span>
            </div>`;

        return `
            <div class="flex gap-2">
                ${stat(isLive ? 'Current Status' : 'End Status', `${status.label}: ${status.duration}`, statusColor)}
                ${stat('Uptime', `${this.model.getUptimePercent()}%`, uptimeColor)}
                ${stat('Disconnects', m.disconnects ?? 'N/A')}
                ${stat('Last Drop', m.timeSinceLastStr || 'N/A')}
                ${longDisconnectStat}
            </div>
            <div class="flex gap-2">
                ${stat('Avg Session', fmtMin(m.avgSessionMin))}
                ${stat('Longest Session', fmtMin(m.longestSessionMin))}
                ${stat('Avg Reconnect', fmtMin(m.avgReconnectMin))}
                ${stat('Business Hrs', m.businessDisconnects ?? 'N/A')}
                ${stat('Off-Hours', m.offHoursDisconnects ?? 'N/A')}
            </div>
        `;
    }

    async #onRangeClick(startDate, endDate) {
        const eventsInRange = (this.model.getEvents() || []).filter(e =>
            e.dateObj && e.dateObj >= startDate && e.dateObj <= endDate
        );
        if (eventsInRange.length === 0) {
            NovaToast.error('No change in status for this customer within the requested range.');
            return;
        }

        const fmt = (d) => d.toLocaleDateString();
        const body = this.container.querySelector('.snap-panel-body');
        if (body) {
            body.innerHTML = `
                <div class="flex items-center justify-center gap-4 py-20">
                    <div class="w-8 h-8 rounded-full border-4 border-zinc-700 border-t-emerald-400 animate-spin"></div>
                    <span class="text-emerald-400 font-mono text-sm">Loading ${fmt(startDate)} — ${fmt(endDate)}...</span>
                </div>
            `;
        }

        const model = await this.controller.drillTo(startDate, endDate);
        if (!model) {
            NovaToast.error('No change in status for this customer within the requested range.');
            this.#renderBody();
            setTimeout(() => this.#initChart(), 150);
            return;
        }
        this.model = model;
        this.#updateHeader();
        this.#renderBody();
        setTimeout(() => this.#initChart(), 150);
    }

    #onBack() {
        const model = this.controller.goBack();
        if (!model) return;
        this.model = model;
        this.#updateHeader();
        this.#renderBody();
        setTimeout(() => this.#initChart(), 150);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaSnapshotPanelView;
}
