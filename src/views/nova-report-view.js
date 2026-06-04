class NovaReportView extends NovaBaseModalView {
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

        this.inlineSnapshotView = new NovaReportSnapshotView(
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
                                <tr><td class="p-6 text-zinc-200">Peak Disconnect Hour</td><td class="p-6 text-right text-white">${this.metrics.peakHourStr || 'None'}</td></tr>
                                <tr><td class="p-6 text-zinc-200">Peak Disconnect Day</td><td class="p-6 text-right text-white">${this.metrics.peakDayStr || 'None'}</td></tr>
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
        const m = this.metrics;
        const fmtMin = (v) => v !== 'N/A' && v != null ? formatDuration(Number(v) * 60) : 'N/A';
        let csv = `RADIUS Connection Report — ${this.friendlyName || this.username}\n`;
        csv += `Monitoring Period,${m.monitoringPeriod || 'N/A'}\n\n`;
        csv += `Metric,Value\n`;
        csv += `Uptime,${Number(m.percentConnected || 0).toFixed(1)}%\n`;
        csv += `Total Disconnects,${m.disconnects || 0}\n`;
        csv += `Business Hours Disconnects,${m.businessDisconnects || 0}\n`;
        csv += `Off-Hours Disconnects,${m.offHoursDisconnects || 0}\n`;
        csv += `Time Since Last Disconnect,${m.timeSinceLastStr || 'N/A'}\n`;
        csv += `Average Session Duration,${fmtMin(m.avgSessionMin)}\n`;
        csv += `Longest Session,${fmtMin(m.longestSessionMin)}\n`;
        csv += `Shortest Session,${fmtMin(m.shortestSessionMin)}\n`;
        csv += `Average Reconnect Time,${fmtMin(m.avgReconnectMin)}\n`;
        csv += `Median Reconnect Time,${fmtMin(m.medianReconnectMin)}\n`;
        csv += `Peak Disconnect Hour,${m.peakHourStr || 'None'}\n`;
        csv += `Peak Disconnect Day,${m.peakDayStr || 'None'}\n`;
        if (this.longDisconnects.length > 0) {
            csv += `\nLong Disconnects (>30 min)\nDisconnected At,Reconnected At,Duration\n`;
            this.longDisconnects.forEach(ld => {
                csv += `${ld.stopDate.toLocaleString()},${ld.startDate.toLocaleString()},${formatDuration(ld.durationSec)}\n`;
            });
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.username || 'radius'}_report.csv`;
        a.click();
    }

    #captureChartImages() {
        const snapshotCanvas = this.modal.querySelector('#inline-snapshot-slot canvas');
        const hourlyCanvas   = this.modal.querySelector('#hourlyChart');
        return {
            snapshotImg: snapshotCanvas ? snapshotCanvas.toDataURL('image/png') : null,
            hourlyData:  this.metrics.hourlyDisconnects || Array(24).fill(0)
        };
    }

    exportToHTML() {
        const { snapshotImg, hourlyData } = this.#captureChartImages();
        const html = this.#generateExportDocument(snapshotImg, hourlyData);
        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.username || 'radius'}_report.html`;
        a.click();
    }

    exportToPDF() {
        const { snapshotImg, hourlyData } = this.#captureChartImages();
        const html = this.#generateExportDocument(snapshotImg, hourlyData);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 600);
    }

    #generateExportDocument(snapshotImg, hourlyData) {
        const m = this.metrics;
        const accent = '#10b981';
        const fmtMin = (v) => v !== 'N/A' && v != null ? formatDuration(Number(v) * 60) : 'N/A';

        const snapshotSection = snapshotImg
            ? `<img src="${snapshotImg}" style="width:100%;border-radius:1rem;display:block;">`
            : `<p style="color:#71717a;text-align:center;padding:3rem 0;">Connection timeline unavailable.</p>`;

        const longDisconnRows = this.longDisconnects.length === 0
            ? `<tr><td colspan="3" style="padding:1.5rem;color:#71717a;text-align:center;">None</td></tr>`
            : this.longDisconnects.map(ld => `
                <tr>
                    <td style="padding:1rem 1.5rem;color:#e4e4e7;">${ld.stopDate.toLocaleString()}</td>
                    <td style="padding:1rem 1.5rem;color:#e4e4e7;">${ld.startDate.toLocaleString()}</td>
                    <td style="padding:1rem 1.5rem;text-align:right;color:#f87171;font-weight:600;">${formatDuration(ld.durationSec)}</td>
                </tr>`).join('');

        const statRow = (label, value) =>
            `<tr><td style="padding:1rem 1.5rem;color:#d4d4d8;">${label}</td><td style="padding:1rem 1.5rem;text-align:right;color:#fff;">${value}</td></tr>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>RADIUS Report — ${this.friendlyName || this.username}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #09090b; color: #fff; font-family: system-ui, sans-serif; }
  .page { max-width: 1100px; margin: 0 auto; padding: 3rem 2rem; }
  .section { margin-bottom: 3rem; }
  h1 { font-size: 2rem; font-weight: 600; }
  h2 { font-size: 1.5rem; font-weight: 600; margin-bottom: 1.25rem; }
  .label { font-size: 0.65rem; font-family: monospace; letter-spacing: 0.1em; text-transform: uppercase; color: ${accent}; margin-bottom: 0.25rem; }
  .card { background: #18181b; border: 1px solid #3f3f46; border-radius: 1rem; overflow: hidden; }
  .card-pad { padding: 2rem; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #27272a; border-bottom: 1px solid #3f3f46; }
  th { padding: 1rem 1.5rem; text-align: left; color: #a1a1aa; font-weight: 500; font-size: 0.875rem; }
  tbody tr { border-bottom: 1px solid #3f3f46; }
  tbody tr:last-child { border-bottom: none; }
  .header { background: #09090b; border-bottom: 1px solid #27272a; padding: 2rem; margin-bottom: 3rem; }
</style>
</head>
<body>
<div class="header">
  <div class="label">RADIUS Connection Report</div>
  <h1>${this.friendlyName || this.username}</h1>
  <div style="color:#71717a;margin-top:0.4rem;font-size:0.9rem;">${m.monitoringPeriod || 'N/A'}</div>
</div>
<div class="page">

  <div class="section">
    <h2>Connection Timeline</h2>
    <div class="card card-pad">${snapshotSection}</div>
  </div>

  <div class="section">
    <h2>Disconnects by Hour of Day</h2>
    <div class="card card-pad" style="height:300px;">
      <canvas id="exportHourlyChart"></canvas>
    </div>
  </div>

  <div class="section">
    <h2>Key Statistics</h2>
    <div class="card">
      <table>
        <thead><tr><th>Metric</th><th style="text-align:right;">Value</th></tr></thead>
        <tbody>
          ${statRow('Uptime', `${Number(m.percentConnected || 0).toFixed(1)}%`)}
          ${statRow('Total Disconnects', m.disconnects || 0)}
          ${statRow('Business Hours Disconnects', m.businessDisconnects || 0)}
          ${statRow('Off-Hours Disconnects', m.offHoursDisconnects || 0)}
          ${statRow('Time Since Last Disconnect', m.timeSinceLastStr || 'N/A')}
          ${statRow('Average Session Duration', fmtMin(m.avgSessionMin))}
          ${statRow('Longest Session', fmtMin(m.longestSessionMin))}
          ${statRow('Shortest Session', fmtMin(m.shortestSessionMin))}
          ${statRow('Average Reconnect Time', fmtMin(m.avgReconnectMin))}
          ${statRow('Median Reconnect Time', fmtMin(m.medianReconnectMin))}
          ${statRow('Peak Disconnect Hour', m.peakHourStr || 'None')}
          ${statRow('Peak Disconnect Day', m.peakDayStr || 'None')}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <h2>Long Disconnects (&gt;30 min)</h2>
    <div class="card">
      <table>
        <thead><tr><th>Disconnected At</th><th>Reconnected At</th><th style="text-align:right;">Duration</th></tr></thead>
        <tbody>${longDisconnRows}</tbody>
      </table>
    </div>
  </div>

</div>
<script>
  new Chart(document.getElementById('exportHourlyChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(Array.from({ length: 24 }, (_, i) => `${i}:00`))},
      datasets: [{ label: 'Disconnects', data: ${JSON.stringify(hourlyData)}, backgroundColor: '${accent}' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { displayColors: false, backgroundColor: '#27272a', titleColor: '#e5e7eb', bodyColor: '#e5e7eb', borderColor: '${accent}', borderWidth: 1 }
      },
      scales: { y: { beginAtZero: true, grid: { color: '#27272a' } }, x: { grid: { color: '#27272a' } } }
    }
  });
</script>
</body>
</html>`;
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
    module.exports = NovaReportView;
}
