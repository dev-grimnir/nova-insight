class NeonovaReportView extends NeonovaBaseModalView {
    constructor(controller, model) {
        super(controller);
        this.controller = controller;
        this.model = model;
        this.username        = this.model.username;
        this.friendlyName    = this.model.friendlyName;
        this.metrics         = this.model.metrics;
        this.longDisconnects = this.model.longDisconnects;
        this.accent          = this.model.accent || 'emerald';

        this.inlineSnapshotView = null;
    }

    show() {
        const modalHTML = `
            <div id="report-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[10000] opacity-0 transition-opacity duration-400">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl w-[1280px] max-w-[96vw] max-h-[96vh] overflow-hidden shadow-2xl flex flex-col transform scale-95 transition-all duration-500">
                    <div class="px-8 py-6 border-b border-[#27272a] bg-[#09090b] flex-shrink-0 flex items-center justify-between">
                        <div>
                            <div class="text-${this.accent}-400 text-xs font-mono tracking-widest">RADIUS CONNECTION REPORT</div>
                            <div class="text-3xl font-semibold text-white mt-1">${this.friendlyName || this.username}</div>
                            <div class="text-sm text-zinc-400 mt-1">${this.metrics.monitoringPeriod || 'N/A'}</div>
                        </div>
                        <button id="close-report-btn" class="px-6 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                    <div id="report-content" class="flex-1 overflow-y-auto p-8 bg-[#18181b]">
                        <div class="flex items-center justify-center h-full text-zinc-400">Loading report...</div>
                    </div>
                </div>
            </div>
        `;

        super.createModal(modalHTML);
        this.renderReport();
        this.attachReportListeners();
    }

    /* ============================================================
     *  RENDER
     * ============================================================ */

    async renderReport() {
        if (!this.modal) return;
        const content = this.modal.querySelector('#report-content');
        if (!content) return;

        content.innerHTML = this.generateReportHTML();

        await this.loadChartJS();

        requestAnimationFrame(() => {
            this.#mountInlineSnapshot();
            this.#initHourlyChart();
        });
    }

    #mountInlineSnapshot() {
        const container = this.modal.querySelector('#inline-snapshot-slot');
        if (!container) return;

        // Controller asks its parent (report controller) for the seeded
        // snapshot controller + model pair. Report controller owns creation
        // per the "controllers create controllers" rule.
        const { snapshotController, snapshotModel } =
            this.controller.createInlineSnapshot();

        if (!snapshotController || !snapshotModel) {
            container.innerHTML = `<p class="text-zinc-400 italic text-center py-12">Connection timeline unavailable.</p>`;
            return;
        }

        this.inlineSnapshotView = new NeonovaReportSnapshotView(
            snapshotController, snapshotModel, container
        );
        this.inlineSnapshotView.show();
    }

    #initHourlyChart() {
        const accentColor = this.accent === 'emerald' ? '#10b981' :
                           this.accent === 'blue'    ? '#3b82f6' :
                           this.accent === 'violet'  ? '#8b5cf6' : '#10b981';

        const canvas = this.modal.querySelector('#hourlyChart');
        if (!canvas) return;

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Disconnects',
                    data: this.metrics.hourlyDisconnects || Array(24).fill(0),
                    backgroundColor: accentColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { left: 12, right: 30, top: 10, bottom: 10 } },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        displayColors: false,
                        backgroundColor: '#27272a',
                        titleColor: '#e5e7eb',
                        bodyColor: '#e5e7eb',
                        borderColor: accentColor,
                        borderWidth: 1,
                        padding: 12
                    },
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#27272a' } },
                    x: { grid: { color: '#27272a' } }
                }
            }
        });
    }

    /* ============================================================
     *  HTML
     * ============================================================ */

    generateReportHTML() {
        const longDisconnSection = this.generateLongDisconnSection();

        return `
            <div class="max-w-6xl mx-auto">
                <!-- Inline snapshot -->
                <div class="mb-12">
                    <div id="inline-snapshot-slot"></div>
                </div>

                <!-- Hourly disconnects -->
                <div class="mb-16">
                    <h2 class="text-3xl font-semibold text-white mb-6">Disconnects by Hour of Day</h2>
                    <div class="bg-zinc-900 border border-zinc-700 rounded-3xl p-8">
                        <canvas id="hourlyChart" class="w-full h-96"></canvas>
                    </div>
                </div>

                <!-- Stats table (below charts now) -->
                <div class="mb-16">
                    <h2 class="text-3xl font-semibold text-white mb-8">Key Statistics</h2>
                    <div class="bg-zinc-900 border border-zinc-700 rounded-3xl overflow-hidden">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-zinc-700 bg-zinc-800">
                                    <th class="p-6 text-left text-zinc-400 font-medium">Metric</th>
                                    <th class="p-6 text-right text-zinc-400 font-medium">Value</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-700 text-sm">
                                <tr><td class="p-6 text-zinc-200">Total Disconnects</td><td class="p-6 text-right font-mono text-white">${this.metrics.disconnects || 0}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Average Session Duration</td><td class="p-6 text-right text-white">${this.metrics.avgSessionMin !== 'N/A' ? formatDuration(this.metrics.avgSessionMin * 60) : 'N/A'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Average Reconnect Time</td><td class="p-6 text-right text-white">${this.metrics.avgReconnectMin !== 'N/A' ? formatDuration(this.metrics.avgReconnectMin * 60) : 'N/A'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Percent Connected</td><td class="p-6 text-right text-white">${Number(this.metrics.percentConnected || 0).toFixed(1)}%</td></tr>
                                <tr><td class="p-6 text-zinc-200">Business Hours Disconnects</td><td class="p-6 text-right text-white">${this.metrics.businessDisconnects || 0}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Off-Hours Disconnects</td><td class="p-6 text-right text-white">${this.metrics.offHoursDisconnects || 0}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Time Since Last Disconnect</td><td class="p-6 text-right text-white">${this.metrics.timeSinceLastStr || 'N/A'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Peak Disconnect Hour</td><td class="p-6 text-right text-white">${this.metrics.peakHourStr || 'None'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Peak Disconnect Day</td><td class="p-6 text-right text-white">${this.metrics.peakDayStr || 'None'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Longest Session</td><td class="p-6 text-right text-white">${this.metrics.longestSessionMin ? formatDuration(this.metrics.longestSessionMin * 60) : 'N/A'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Shortest Session</td><td class="p-6 text-right text-white">${this.metrics.shortestSessionMin !== 'N/A' ? formatDuration(this.metrics.shortestSessionMin * 60) : 'N/A'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Median Reconnect Time</td><td class="p-6 text-right text-white">${this.metrics.medianReconnectMin !== 'N/A' ? formatDuration(this.metrics.medianReconnectMin * 60) : 'N/A'}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                ${longDisconnSection}

                <div class="flex justify-center gap-4 mt-20">
                    <button id="export-html-btn" class="px-10 py-4 bg-${this.accent}-600 hover:bg-${this.accent}-500 text-black font-semibold rounded-2xl transition">Export as HTML</button>
                    <button id="export-csv-btn"  class="px-10 py-4 bg-${this.accent}-600 hover:bg-${this.accent}-500 text-black font-semibold rounded-2xl transition">Export as CSV</button>
                    <button id="export-pdf-btn"  class="px-10 py-4 bg-${this.accent}-600 hover:bg-${this.accent}-500 text-black font-semibold rounded-2xl transition">Export as PDF</button>
                </div>

                <style>
                    #report-content::-webkit-scrollbar { width: 10px; }
                    #report-content::-webkit-scrollbar-track { background: #18181b; }
                    #report-content::-webkit-scrollbar-thumb {
                        background: #10b981;
                        border-radius: 9999px;
                        border: 2px solid #18181b;
                    }
                    #report-content::-webkit-scrollbar-thumb:hover { background: #34d399; }
                </style>
            </div>
        `;
    }

    generateLongDisconnSection() {
        if (this.longDisconnects.length === 0) {
            return `<p class="text-zinc-400 italic text-center py-12">No disconnects longer than 30 minutes.</p>`;
        }

        return `
            <details class="group mt-16 mb-16" open>
                <summary class="bg-zinc-800 hover:bg-zinc-700 transition-colors p-6 rounded-t-3xl cursor-pointer flex justify-between items-center text-${this.accent}-400 font-medium list-none">
                    <span>Long Disconnects (&gt;30 minutes): ${this.longDisconnects.length}</span>
                    <span class="text-xs text-zinc-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div class="bg-zinc-900 border border-zinc-700 border-t-0 rounded-b-3xl overflow-hidden">
                    ${this.generateLongDisconnectsHTML()}
                </div>
            </details>`;
    }

    generateLongDisconnectsHTML() {
        if (this.longDisconnects.length === 0) return '';
        let html = `
            <table class="w-full border-collapse">
                <thead>
                    <tr class="bg-zinc-800 border-b border-zinc-700">
                        <th class="p-6 text-left text-zinc-400 font-medium">Disconnected At</th>
                        <th class="p-6 text-left text-zinc-400 font-medium">Reconnected At</th>
                        <th class="p-6 text-right text-zinc-400 font-medium">Duration</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-zinc-700">`;
        this.longDisconnects.forEach(ld => {
            const durationStr = formatDuration(ld.durationSec);
            html += `
                <tr class="hover:bg-zinc-800/70 transition-colors">
                    <td class="p-6 text-zinc-200">${ld.stopDate.toLocaleString()}</td>
                    <td class="p-6 text-zinc-200">${ld.startDate.toLocaleString()}</td>
                    <td class="p-6 text-right font-semibold text-red-400">${durationStr}</td>
                </tr>`;
        });
        html += `</tbody></table>`;
        return html;
    }

    /* ============================================================
     *  LISTENERS / EXPORT
     * ============================================================ */

    attachReportListeners() {
        const closeBtn = this.modal.querySelector('#close-report-btn');
        const modalEl  = this.modal.querySelector('#report-modal');

        closeBtn?.addEventListener('click', () => this.hide());
        modalEl?.addEventListener('click', e => { if (e.target === modalEl) this.hide(); });

        this.modal.querySelector('#export-csv-btn')?.addEventListener('click',  () => this.exportToCSV());
        this.modal.querySelector('#export-html-btn')?.addEventListener('click', () => this.exportToHTML());
        this.modal.querySelector('#export-pdf-btn')?.addEventListener('click',  () => this.exportToPDF());
    }

    exportToCSV() {
        const csv = this.generateCsvContent();
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.username || 'radius'}_report.csv`;
        a.click();
    }

    exportToHTML() {
        const reportHTML = this.generateReportHTML();
        const fullHTML = `<!DOCTYPE html><html><head><title>RADIUS Report</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-zinc-950 text-white">${reportHTML}</body></html>`;
        const blob = new Blob([fullHTML], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.username || 'radius'}_report.html`;
        a.click();
    }

    async exportToPDF() {
        if (typeof html2canvas === 'undefined' || typeof jsPDF === 'undefined') {
            alert('PDF libraries not loaded – contact dev if this persists');
            return;
        }
        const content = this.modal.querySelector('#report-content');
        const canvas = await html2canvas(content, { scale: 2 });
        const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pdf.internal.pageSize.getWidth();
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save(`${this.username || 'radius'}_report.pdf`);
    }

    generateCsvContent() {
        let csv = 'Metric,Value\n';
        csv += `Total Disconnects,${this.metrics.disconnects || 0}\n`;
        csv += `Average Session Duration,${this.metrics.avgSessionMin !== 'N/A' ? formatDuration(this.metrics.avgSessionMin * 60) : 'N/A'}\n`;
        csv += `Average Reconnect Time,${this.metrics.avgReconnectMin !== 'N/A' ? formatDuration(this.metrics.avgReconnectMin * 60) : 'N/A'}\n`;
        csv += `Percent Connected,${Number(this.metrics.percentConnected || 0).toFixed(1)}%\n`;
        csv += `Business Hours Disconnects,${this.metrics.businessDisconnects || 0}\n`;
        csv += `Off-Hours Disconnects,${this.metrics.offHoursDisconnects || 0}\n`;
        csv += `Time Since Last Disconnect,${this.metrics.timeSinceLastStr || 'N/A'}\n`;
        csv += `Peak Disconnect Hour,${this.metrics.peakHourStr || 'None'}\n`;
        csv += `Peak Disconnect Day,${this.metrics.peakDayStr || 'None'}\n`;
        csv += `Median Reconnect Time,${this.metrics.medianReconnectMin !== 'N/A' ? formatDuration(this.metrics.medianReconnectMin * 60) : 'N/A'}\n`;
        csv += '\nLong Disconnects\nDisconnected At,Reconnected At,Duration\n';
        this.longDisconnects.forEach(ld => {
            csv += `${ld.stopDate.toLocaleString()},${ld.startDate.toLocaleString()},${formatDuration(ld.durationSec)}\n`;
        });
        return csv;
    }

    /* ============================================================
     *  CHART.JS LOADING + CLEANUP
     * ============================================================ */

    loadChartJS() {
        return new Promise((resolve) => {
            if (typeof window.Chart !== 'undefined') { resolve(true); return; }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
            script.async = true;
            script.onload  = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    hide() {
        this.inlineSnapshotView = null;
        super.hide();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeonovaReportView;
}
