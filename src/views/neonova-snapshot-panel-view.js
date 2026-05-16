/**
 * Shared snapshot paradigm: header + canvas + drilldown wiring.
 * Mounted into whatever container the wrapping view provides — modal
 * content area for NeonovaSnapshotView, parent slot for
 * NeonovaReportSnapshotView. Container element is provided by the wrapper.
 *
 * Selectors are class-scoped (.snap-panel-*) and queried within
 * this.container so multiple panels could coexist without ID collision.
 */
class NeonovaSnapshotPanelView {

    static CHART_HEIGHT_PX = 320;

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
                <div class="px-8 py-6 border-b border-zinc-700 bg-[#09090b] flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <button class="snap-panel-back-btn hidden px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            ← Back
                        </button>
                        <div>
                            <div class="snap-panel-subtitle text-emerald-400 text-xs font-mono tracking-widest">${this.model.friendlyName || 'Customer'} — Connection Timeline</div>
                            <div class="snap-panel-daterange text-2xl font-semibold text-white mt-1">${this.model.getDateRangeString()}</div>
                            <div class="snap-panel-uptime text-base font-medium text-emerald-400 mt-1">Uptime: ${this.model.getUptimePercent()}%</div>
                        </div>
                    </div>
                </div>
                <div class="snap-panel-body p-6">
                    <div style="height: ${NeonovaSnapshotPanelView.CHART_HEIGHT_PX}px;">
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
            <div style="height: ${NeonovaSnapshotPanelView.CHART_HEIGHT_PX}px;">
                <canvas class="snap-panel-canvas"></canvas>
            </div>
        `;
    }

    #initChart() {
        const canvas = this.container.querySelector('.snap-panel-canvas');
        if (!canvas) return;

        const result = NeonovaSnapshotChart.build(
            canvas,
            this.model,
            (startDate, endDate) => this.#onRangeClick(startDate, endDate)
        );
        this.#chartInstance = result.chart;
    }

    #updateHeader() {
        const subtitle  = this.container.querySelector('.snap-panel-subtitle');
        const daterange = this.container.querySelector('.snap-panel-daterange');
        const uptime    = this.container.querySelector('.snap-panel-uptime');
        const backBtn   = this.container.querySelector('.snap-panel-back-btn');

        if (subtitle)  subtitle.textContent  = `${this.model.friendlyName || 'Customer'} — Connection Timeline`;
        if (daterange) daterange.textContent = this.model.getDateRangeString();
        if (uptime)    uptime.textContent    = `Uptime: ${this.model.getUptimePercent()}%`;

        if (backBtn) backBtn.classList.toggle('hidden', !this.controller.canGoBack());
    }

    #attachListeners() {
        const backBtn = this.container.querySelector('.snap-panel-back-btn');
        backBtn?.addEventListener('click', () => this.#onBack());
    }

    async #onRangeClick(startDate, endDate) {
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
    module.exports = NeonovaSnapshotPanelView;
}
