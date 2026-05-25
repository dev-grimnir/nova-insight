class NovaDailyDisconnectView extends NovaBaseModalView {
    constructor(controller, model) {
        super(controller);
        this.model = model;
        this._hasShown = false;
    }

    show() {
        if (this._hasShown) return;
        this._hasShown = true;

        console.log('DailyDisconnectView.show() called');

        const modalHTML = `
            <div id="daily-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[10001] opacity-0 transition-opacity duration-400">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl w-[1280px] max-w-[96vw] max-h-[96vh] overflow-hidden shadow-2xl flex flex-col transform scale-95 transition-all duration-500">
                    <!-- Header -->
                    <div class="px-8 py-6 border-b border-[#27272a] bg-[#09090b] flex-shrink-0 flex items-center justify-between">
                        <div>
                            <div class="text-emerald-400 text-xs font-mono tracking-widest">${this.model.friendlyName || 'User'}</div>
                            <div class="text-3xl font-semibold text-white mt-1">${this.model.getDateString ? this.model.getDateString() : 'Selected Date'}</div>
                        </div>
                        <button id="close-daily-btn" class="px-6 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            ✕ Close
                        </button>
                    </div>
                    
                    <!-- Content -->
                    <div id="daily-content" class="flex-1 overflow-y-auto p-8 bg-[#18181b]">
                    </div>
                </div>
            </div>
        `;

        super.createModal(modalHTML).then(() => {
            this.render();
            this.attachListeners();
        }).catch(err => console.error('Modal creation failed:', err));
    }

    render() {
        const content = this.modal.querySelector('#daily-content');
        if (!content) return;

        content.innerHTML = this.generateEKGHTML();

        if (!this.model.events || this.model.events.length < 2) {
            content.innerHTML += `<div class="text-center text-zinc-400 py-20 text-lg">No events found.</div>`;
            return;
        }

        requestAnimationFrame(() => this.initEKGChart());
    }

    generateEKGHTML() {
        return `
            <div class="max-w-6xl mx-auto">
                <h1 class="text-5xl font-bold text-white text-center tracking-tight mb-8">Connection Status – ${this.model.getDateString ? this.model.getDateString() : ''}</h1>
                <div class="bg-zinc-900 border border-zinc-700 rounded-3xl p-8" style="height: 620px;">
                    <canvas id="ekgChart" class="w-full h-full"></canvas>
                </div>
            </div>
        `;
    }

    initEKGChart() {
        console.log('initEKGChart called — events count:', this.model.events ? this.model.events.length : 0);
    
        const canvas = document.getElementById('ekgChart');
        if (!canvas) {
            console.error('EKG canvas #ekgChart not found!');
            return;
        }
    
        if (!this.model.events || this.model.events.length < 2) return;
    
        const sortedEvents = [...this.model.events].sort((a, b) => 
            (a.dateObj || new Date(0)) - (b.dateObj || new Date(0))
        );
    
        if (!sortedEvents[0]?.dateObj) return;
    
        const firstDate = sortedEvents[0].dateObj;
        const dayStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate(), 0, 0, 0);
        const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    
        // Step 1: Collapse to real status-change periods
        const rawPeriods = [];
        let i = 0;
        while (i < sortedEvents.length) {
            const startTime = sortedEvents[i].dateObj.getTime();
            const isConnected = (sortedEvents[i].status === 'connected' || sortedEvents[i].status === 'Start');
    
            let j = i + 1;
            while (j < sortedEvents.length && 
                   (sortedEvents[j].status === 'connected' || sortedEvents[j].status === 'Start') === isConnected) {
                j++;
            }
    
            rawPeriods.push({
                x: startTime,
                y: isConnected ? 1 : -1
            });
    
            i = j;
        }
    
        // Extend final bar to midnight
        if (rawPeriods.length > 0) {
            const lastY = rawPeriods[rawPeriods.length - 1].y;
            rawPeriods.push({ x: dayEnd.getTime(), y: lastY });
        }
    
        // Step 2: NO merging — show every status change (even short ones)
        const chartData = [...rawPeriods];   // just copy the periods as-is
    
        // Step 3: Force full-day coverage (no dead zones)
        if (chartData.length > 0) {
            const firstY = chartData[0].y;
            chartData.unshift({ x: dayStart.getTime(), y: firstY });
        }
    
        console.log(`✅ Collapsed ${this.model.events.length} raw events → ${rawPeriods.length} periods → ${chartData.length} final bars (short glitches < 2 min ignored)`);
    
        if (this._ekgChartInstance) this._ekgChartInstance.destroy();
    
        this._ekgChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [
                    // GREEN = Connected (always above centerline)
                    {
                        label: 'Connected',
                        data: chartData.map(pt => ({ x: pt.x, y: pt.y > 0 ? 1 : 0 })),
                        borderColor: '#10b981',
                        backgroundColor: '#10b98188',
                        borderWidth: 0,
                        stepped: 'after',
                        tension: 0,
                        fill: 'origin',
                        pointRadius: 0
                    },
                    // RED = Disconnected (always below centerline)
                    {
                        label: 'Disconnected',
                        data: chartData.map(pt => ({ x: pt.x, y: pt.y < 0 ? -1 : 0 })),
                        borderColor: '#ef4444',
                        backgroundColor: '#ef444488',
                        borderWidth: 0,
                        stepped: 'after',
                        tension: 0,
                        fill: 'origin',
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        intersect: false,        // important: allow tooltip even if not exactly on point
                        mode: 'index',           // use x-axis position instead of nearest point
                        position: 'nearest',
                        callbacks: {
                            label: (context) => {
                                if (context.parsed.y === 0) return '';

                                const isConnected = context.parsed.y > 0;
                                const currentX = context.parsed.x;
                                const datasetData = context.dataset.data;

                                // Find start of this bar
                                let startX = dayStart.getTime();
                                for (let idx = 0; idx < datasetData.length; idx++) {
                                    if (datasetData[idx].x >= currentX) {
                                        if (idx > 0) startX = datasetData[idx - 1].x;
                                        break;
                                    }
                                }

                                const startStr = new Date(startX).toLocaleTimeString([], { 
                                    hour: 'numeric', 
                                    minute: '2-digit' 
                                });
                                const endStr = new Date(currentX).toLocaleTimeString([], { 
                                    hour: 'numeric', 
                                    minute: '2-digit' 
                                });

                                const durMs = currentX - startX;
                                const hours = Math.floor(durMs / 3600000);
                                const mins = Math.floor((durMs % 3600000) / 60000);
                                const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                                const status = isConnected ? 'Connected' : 'Disconnected';

                                return `${status} - ${startStr} - ${endStr} = Duration: ${durationStr}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: dayStart.getTime(),
                        max: dayEnd.getTime(),
                        grid: { color: '#27272a', lineWidth: 1 },
                        ticks: {
                            color: '#64748b',
                            maxTicksLimit: 24,
                            callback: (v) => new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        }
                    },
                    y: {
                        min: -1.2,
                        max: 1.2,
                        ticks: { display: false },
                        grid: {
                            color: (ctx) => ctx.tick.value === 0 ? '#a3a3a3' : '#27272a',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 4 : 1.5
                        }
                    }
                },
                layout: { padding: { right: 40, left: 20, top: 30, bottom: 20 } }
            }
        });
    }
    
    attachListeners() {
        const closeBtn = this.modal.querySelector('#close-daily-btn');
        const modalEl  = this.modal.querySelector('#daily-modal');

        closeBtn?.addEventListener('click', () => this.hide());
        modalEl?.addEventListener('click', e => {
            if (e.target === modalEl) this.hide();
        });
    }
}
