class NovaReportOrderView extends NovaBaseModalView {
    controller;
    constructor(controller, username, friendlyName) {
        super(controller);
        this.controller = controller;
        this.username = username;
        this.friendlyName = friendlyName || username;
    }

    show() {
        const html = `
            <div id="report-order-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[10000] opacity-0 transition-opacity duration-400">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl w-[820px] max-w-[92vw] max-h-[92vh] overflow-hidden shadow-2xl flex flex-col transform translate-x-12 transition-all duration-500">
                    <!-- Header -->
                    <div class="px-8 py-6 border-b border-[#27272a] bg-[#09090b] flex-shrink-0 flex items-center justify-between">
                        <div>
                            <div class="text-emerald-400 text-xs font-mono tracking-widest">GENERATE REPORT</div>
                            <div class="text-2xl font-semibold text-white mt-1">${this.friendlyName}</div>
                        </div>
                        <button id="close-btn" class="px-6 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>

                    <!-- Content -->
                    <div id="report-content" class="flex-1 overflow-y-auto p-8 bg-[#18181b]">
                        <!-- Populated by render() -->
                    </div>
                </div>
            </div>
        `;

        super.createModal(html);
        this.render();
        this.attachListeners();
    }

    render() {
        if (!this.modal) {
            return;
        }
        
        const content = this.modal.querySelector('#report-content');
        if (!content) return;

        content.innerHTML = `
            <div class="p-6 space-y-8">
                <h2 class="text-3xl font-bold mb-8 text-white" style="text-shadow: 0 0 25px #10b981;">
                    Generate Report for ${this.friendlyName}
                </h2>

                <!-- Quick Presets -->
                <div class="flex flex-wrap gap-3">
                    <button class="quick-btn px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition flex items-center gap-2 shadow-md" data-days="1">
                        <i class="fas fa-calendar-day"></i> Last 1 day
                    </button>
                    <button class="quick-btn px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition flex items-center gap-2 shadow-md" data-days="2">
                        <i class="fas fa-calendar-day"></i> Last 2 days
                    </button>
                    <button class="quick-btn px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition flex items-center gap-2 shadow-md" data-days="3">
                        <i class="fas fa-calendar-day"></i> Last 3 days
                    </button>
                    <button class="quick-btn px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition flex items-center gap-2 shadow-md" data-days="7">
                        <i class="fas fa-calendar-week"></i> Last 7 days
                    </button>
                    <button class="quick-btn px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition flex items-center gap-2 shadow-md" data-days="30">
                        <i class="fas fa-calendar"></i> Last 30 days
                    </button>
                    <button class="quick-btn px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl text-sm transition flex items-center gap-2 shadow-md" data-days="90">
                        <i class="fas fa-calendar-alt"></i> Last 90 days
                    </button>
                </div>

                <!-- Custom Date Range -->
                <div class="grid grid-cols-2 gap-8">
                    <div>
                        <label class="block text-xs uppercase tracking-widest text-zinc-500 mb-3">Start Date</label>
                        <div class="grid grid-cols-3 gap-3">
                            <select id="start-year" class="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:border-emerald-500 text-sm"></select>
                            <select id="start-month" class="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:border-emerald-500 text-sm"></select>
                            <select id="start-day" class="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:border-emerald-500 text-sm"></select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs uppercase tracking-widest text-zinc-500 mb-3">End Date</label>
                        <div class="grid grid-cols-3 gap-3">
                            <select id="end-year" class="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:border-emerald-500 text-sm"></select>
                            <select id="end-month" class="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:border-emerald-500 text-sm"></select>
                            <select id="end-day" class="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:border-emerald-500 text-sm"></select>
                        </div>
                    </div>
                </div>

                <button id="generate-custom" class="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold py-4 rounded-2xl transition text-lg">
                    Generate Report
                </button>
            </div>
        `;

        this.populateDateSelectors();
    }

    populateDateSelectors() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();

        // Start date = today minus 11 months (handles year rollover automatically)
        const startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - 11);
        const startYear = startDate.getFullYear();
        const startMonth = startDate.getMonth() + 1;
        const startDay = startDate.getDate();

        const populate = (selectId, values, defaultVal) => {
            const select = this.modal.querySelector(selectId);
            if (!select) return;
            select.innerHTML = values.map(v => `<option value="${v}" ${v === defaultVal ? 'selected' : ''}>${v}</option>`).join('');
        };

        const years = Array.from({length: 2}, (_, i) => currentYear - i);
        populate('#start-year', years, startYear);
        populate('#end-year', years, currentYear);

        // Months
        const months = Array.from({length: 12}, (_, i) => i + 1);
        populate('#start-month', months, startMonth);
        populate('#end-month', months, currentMonth);

        // Days
        const days = Array.from({length: 31}, (_, i) => i + 1);
        populate('#start-day', days, startDay);
        populate('#end-day', days, currentDay);
    }

    attachListeners() {
        if (!this.controller) {
            console.error('[NovaReportOrderView] Controller missing');
            return;
        }

        const modalEl = this.modal.querySelector('#report-order-modal');
        const closeBtn = this.modal.querySelector('#close-btn');
        const generateBtn = this.modal.querySelector('#generate-custom');

        const close = () => this.hide();

        closeBtn.addEventListener('click', close);
        modalEl.addEventListener('click', e => {
            if (e.target === modalEl) close();
        });

        // Quick presets — send the exact string format controller expects
        this.modal.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days) || 7;
                const timeframe = `${days}_DAYS`;          // ← this is what handleQuickReport wants

                this.controller.handleQuickReport(timeframe);
            });
        });

        // Custom Generate — build proper ISO dates with zero-padding
        generateBtn.addEventListener('click', () => {
            const startYear  = this.modal.querySelector('#start-year').value;
            const startMonth = this.modal.querySelector('#start-month').value.padStart(2, '0');
            const startDay   = this.modal.querySelector('#start-day').value.padStart(2, '0');
            const endYear    = this.modal.querySelector('#end-year').value;
            const endMonth   = this.modal.querySelector('#end-month').value.padStart(2, '0');
            const endDay     = this.modal.querySelector('#end-day').value.padStart(2, '0');

            const startIso = `${startYear}-${startMonth}-${startDay}`;
            const endIso   = `${endYear}-${endMonth}-${endDay}`;

            this.controller.handleCustomReport(startIso, endIso);
        });
    }

    hide() {
        super.hide();
    }

}
