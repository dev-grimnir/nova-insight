class NeonovaSnapshotView extends NeonovaBaseModalView {
    #hasShown = false;
    #chartInstance = null;

    constructor(controller, model) {
        super(controller);
        this.controller = controller;
        this.model = model;
    }

    show() {
        if (this.#hasShown) return;
        this.#hasShown = true;

        const modalHTML = `
            <div id="snapshot-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[10001] opacity-0 transition-opacity duration-400">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl w-[1280px] max-w-[96vw] max-h-[96vh] overflow-hidden shadow-2xl flex flex-col transform scale-95 transition-all duration-500">
                    <div class="px-8 py-6 border-b border-[#27272a] bg-[#09090b] flex-shrink-0 flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <button id="back-btn" class="hidden px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                                ← Back
                            </button>
                            <div>
                                <div class="text-emerald-400 text-xs font-mono tracking-widest" id="snapshot-subtitle">${this.model.friendlyName || 'Customer'} — Connection Timeline</div>
                                <div class="text-3xl font-semibold text-white mt-1" id="snapshot-daterange">${this.model.getDateRangeString()}</div>
                                <div class="text-lg font-medium text-emerald-400 mt-1" id="snapshot-uptime">Uptime: ${this.model.getUptimePercent()}%</div>
                            </div>
                        </div>
                        <button id="close-snapshot-btn" class="px-6 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            ✕ Close
                        </button>
                    </div>
                    <div id="snapshot-content" class="flex-1 overflow-y-auto p-8 bg-[#18181b]"></div>
                </div>
            </div>
        `;

        super.createModal(modalHTML).then(() => {
            this.#render();
            this.#attachListeners();

            const modalOverlay = this.modal.querySelector('#snapshot-modal');
            if (modalOverlay) {
                modalOverlay.style.opacity = '1';
                modalOverlay.style.transform = 'scale(1)';
            }

            setTimeout(() => this.#initChart(), 150);
        }).catch(err => {
            console.error('Snapshot modal creation failed:', err);
        });
    }

    /* ============================================================
     *  RENDER
     * ============================================================ */

    #render() {
        const content = this.modal?.querySelector('#snapshot-content');
        if (!content) return;
        content.innerHTML = `
            <div class="max-w-6xl mx-auto">
                <div class="bg-zinc-900 border border-zinc-700 rounded-3xl p-8" style="height: 360px; min-height: 360px;">
                    <canvas id="snapshotChart" class="w-full h-full"></canvas>
                </div>
            </div>
            <style>
                #snapshot-content::-webkit-scrollbar { width: 7px; }
                #snapshot-content::-webkit-scrollbar-track { background: #18181b; border-radius: 9999px; }
                #snapshot-content::-webkit-scrollbar-thumb { background: #34d399; border-radius: 9999px; border: 2px solid #18181b; }
                #snapshot-content::-webkit-scrollbar-thumb:hover { background: #10b981; }
                #snapshot-content { scrollbar-width: thin; scrollbar-color: #34d399 #18181b; }
            </style>
        `;

        if (!this.model.events || this.model.events.length < 2) {
            content.innerHTML += `<div class="text-center text-zinc-400 py-20 text-lg">No connection events found for this period.</div>`;
        }
    }

    #initChart() {
        const canvas = this.modal.querySelector('#snapshotChart');
        if (!canvas) return;

        if (this.#chartInstance) {
            this.#chartInstance.destroy();
            this.#chartInstance = null;
        }

        const result = NeonovaSnapshotChart.build(
            canvas,
            this.model,
            (startDate, endDate) => this.#onRangeClick(startDate, endDate)
        );
        this.#chartInstance = result.chart;
    }

    #updateHeader() {
        const subtitle  = this.modal.querySelector('#snapshot-subtitle');
        const daterange = this.modal.querySelector('#snapshot-daterange');
        const uptime    = this.modal.querySelector('#snapshot-uptime');
        const backBtn   = this.modal.querySelector('#back-btn');

        if (subtitle)  subtitle.textContent  = `${this.model.friendlyName || 'Customer'} — Connection Timeline`;
        if (daterange) daterange.textContent = this.model.getDateRangeString();
        if (uptime)    uptime.textContent    = `Uptime: ${this.model.getUptimePercent()}%`;

        if (backBtn) backBtn.classList.toggle('hidden', !this.controller.canGoBack());
    }

    /* ============================================================
     *  EVENT WIRING
     * ============================================================ */

    #attachListeners() {
        const closeBtn = this.modal.querySelector('#close-snapshot-btn');
        const backBtn  = this.modal.querySelector('#back-btn');
        const modalEl  = this.modal.querySelector('#snapshot-modal');

        closeBtn?.addEventListener('click', () => this.hide());
        backBtn?.addEventListener('click',  () => this.#onBack());
        modalEl?.addEventListener('click', e => { if (e.target === modalEl) this.hide(); });
    }

    async #onRangeClick(startDate, endDate) {
        const fmt = (d) => d.toLocaleDateString();
        const content = this.modal.querySelector('#snapshot-content');
        if (content) {
            content.innerHTML = `
                <div class="flex items-center justify-center h-full gap-4">
                    <div class="w-8 h-8 rounded-full border-4 border-zinc-700 border-t-emerald-400 animate-spin"></div>
                    <span class="text-emerald-400 font-mono text-sm">Loading ${fmt(startDate)} — ${fmt(endDate)}...</span>
                </div>
            `;
        }

        const model = await this.controller.drillTo(startDate, endDate);
        if (!model) {
            // Drill failed; redraw current model so the user isn't stuck on the spinner.
            this.#render();
            setTimeout(() => this.#initChart(), 150);
            return;
        }
        this.model = model;
        this.#updateHeader();
        this.#render();
        setTimeout(() => this.#initChart(), 150);
    }

    #onBack() {
        const model = this.controller.goBack();
        if (!model) return;
        this.model = model;
        this.#updateHeader();
        this.#render();
        setTimeout(() => this.#initChart(), 150);
    }

    hide() {
        if (this.#chartInstance) {
            this.#chartInstance.destroy();
            this.#chartInstance = null;
        }
        super.hide();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeonovaSnapshotView;
}
