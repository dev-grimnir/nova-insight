class NeonovaDashboardView extends BaseNeonovaView {
    static COLUMNS = [
        { key: 'friendlyName', label: 'Friendly Name',   width: 18, align: 'left'  },
        { key: 'radiusUser',   label: 'RADIUS UN', width: 18, align: 'left'  },
        { key: 'status',       label: 'Status',          width: 10, align: 'left'  },
        { key: 'duration',     label: 'Duration',        width: 14, align: 'left'  },
        { key: 'snapshot',     label: '24 Hr Snapshot',        width: 28, align: 'left'  },
        { key: 'action',       label: 'Action',          width: 12, align: 'right' }
        ];
    
    constructor(controller) {
        super();
        this.controller = controller;
        this.isMinimized = true;
        this.createElements();
    }

    #attachSortGlyphListener() {
        if (!this.contentArea) return;
        this.contentArea.addEventListener('click', (e) => {
            const glyph = e.target.closest('.sort-glyph');
            if (!glyph) return;
            e.stopPropagation();
            const columnKey = glyph.dataset.column;
            if (!columnKey) return;
            const tabCtrl = this.controller.getTabController();
            const activeTab = tabCtrl?.getActiveTab();
            if (!activeTab) return;
            tabCtrl.sortByColumn(activeTab.label, columnKey);
        });
    }

    static buildColGroupHTML() {
        return '<colgroup>' +
            NeonovaDashboardView.COLUMNS.map(c => `<col style="width: ${c.width}%;">`).join('') +
            '</colgroup>';
    }

    static buildTheadHTML(activeTab = null) {
        const SORTABLE = new Set(['friendlyName', 'radiusUser', 'status', 'duration']);
    
        const ths = NeonovaDashboardView.COLUMNS.map(c => {
            if (!SORTABLE.has(c.key)) {
                return `<th class="px-2 py-2 text-${c.align}">${c.label}</th>`;
            }
    
            let glyph = '⇅';
            if (activeTab && activeTab.sortColumn === c.key) {
                glyph = activeTab.sortDirection === 'desc' ? '↓' : '↑';
            }
    
            const glyphClasses = (activeTab && activeTab.sortColumn === c.key)
                ? 'sort-glyph sort-glyph-active'
                : 'sort-glyph';
    
            return `<th class="px-2 py-2 text-${c.align}">
                <span class="th-content">
                    <span class="${glyphClasses}" data-column="${c.key}" title="Sort by ${c.label}">${glyph}</span>
                    <span class="column-label">${c.label}</span>
                </span>
            </th>`;
        }).join('');
    
        return `<thead><tr class="text-xs uppercase tracking-widest text-zinc-500">${ths}</tr></thead>`;
    }

    getHeaderHTML() {
        const pollIcon = this.controller.model.isPollingPaused ? 'fa-play' : 'fa-pause';
        const pollText = this.controller.model.isPollingPaused ? 'Resume' : 'Pause';
        const interval = this.controller.model.pollingIntervalMinutes;
    
        return `
            <div class="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900 shrink-0 relative z-10 dashboard-header">
                <div class="flex items-center gap-4">
                    <img src="https://raw.githubusercontent.com/dev-grimnir/neonova-post-processor/main/src/assets/nova-subscriber-logo.png" 
                         alt="Nova Subscriber" class="h-10 w-auto">
                    <button id="privacy-toggle-btn" 
                            class="px-6 py-2.5 font-medium rounded-2xl flex items-center justify-center transition-all border shadow-sm"
                            title="Toggle Privacy Mode">
                        Privacy Off
                    </button>
                    <button id="admins-btn"
                            class="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-2xl flex items-center justify-center transition-all border border-zinc-600 shadow-sm"
                            title="Manage Admins">
                        Admins
                    </button>
                </div>
    
                <div class="flex items-center gap-4">
                    <!-- Polling control -->
                    <div class="relative group/polling">
                        <button id="poll-toggle-btn" 
                                class="min-w-[180px] px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-2xl flex items-center justify-center gap-2.5 transition-all border border-zinc-700">
                            <i class="fas ${pollIcon} text-emerald-400"></i>
                            <span>${pollText} Polling</span>
                            <span class="text-emerald-400/80 text-sm font-mono">· ${interval} min</span>
                        </button>
    
                        <!-- Slider tooltip: visibility/fade controlled by inline CSS in createElements(). -->
                        <div class="poll-slider-tooltip absolute left-1/2 -translate-x-1/2 top-full z-20">
                            <div class="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl w-80">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-xs uppercase tracking-widest text-zinc-400">Polling Interval</span>
                                    <span id="interval-value-tooltip" class="font-mono text-emerald-400">${interval} min</span>
                                </div>
                                <input type="range" id="polling-interval-slider-tooltip" 
                                       min="1" max="60" value="${interval}" 
                                       class="w-full accent-emerald-500 cursor-pointer">
                            </div>
                            <!-- Arrow -->
                            <div class="absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 bg-zinc-900 border-l border-t border-zinc-700 rotate-45"></div>
                        </div>
                    </div>
    
                    <!-- Last Updated – pure data from model (no calculation here) -->
                    <span id="last-updated" 
                          class="text-xs text-zinc-400 font-mono whitespace-nowrap">
                        Last Updated: <span class="text-emerald-400" id="last-updated-value">--</span>
                    </span>
    
                    <button class="refresh-btn px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl flex items-center gap-2 transition shadow-sm">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
    
                    <button id="add-customer-btn" 
                            class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl flex items-center gap-2 transition shadow-sm">
                        Add Customer
                    </button>
                </div>
            </div>
        `;
    }

    renderTableHeader() {
        if (!this.panel) return;
        const tabCtrl = this.controller.getTabController();
        const activeTab = tabCtrl?.getActiveTab() || null;
    
        const oldThead = this.panel.querySelector('#content-area thead');
        if (!oldThead) return;
    
        const temp = document.createElement('table');
        temp.innerHTML = NeonovaDashboardView.buildTheadHTML(activeTab);
        const newThead = temp.querySelector('thead');
        if (!newThead) return;
    
        oldThead.replaceWith(newThead);
    }

    createElements() {
        this.panel = document.createElement('div');
        this.panel.classList.add('neonova-dashboard');
        this.panel.style.cssText = `
            position: fixed;
            left: 50%;
            transform: translateX(-50%);
            width: 92%;
            max-width: 1100px;
            background: #09090b;
            color: white;
            font-family: system-ui;
            box-shadow: 0 8px 40px rgba(0,0,0,0.8);
            z-index: 9999;
            overflow: hidden;
            border: 1px solid #27272a;
            border-radius: 24px;
            transition: 
                top 500ms cubic-bezier(0.32, 0.72, 0, 1),
                height 500ms cubic-bezier(0.32, 0.72, 0, 1),
                border 500ms cubic-bezier(0.32, 0.72, 0, 1),
                border-radius 500ms cubic-bezier(0.32, 0.72, 0, 1),
                box-shadow 500ms cubic-bezier(0.32, 0.72, 0, 1);
        `;
        document.body.appendChild(this.panel);
    
        this.panel.innerHTML = `
            <div class="flex flex-col h-full">
                <div id="header-container"></div>
                <div id="content-area" class="flex-1 overflow-hidden flex flex-col">
    
                    <!-- Tab bar -->
                    <div id="tab-bar" class="flex items-center gap-2 px-6 pt-3 pb-0 bg-zinc-900 shrink-0" style="border-bottom: 1px solid #34d399;"></div>
    
                    <!-- Card -->
                    <div class="flex-1 bg-zinc-900 border border-zinc-700 rounded-3xl overflow-hidden flex flex-col">
                            <!-- Static column header -->
                        <div class="px-6 py-1 bg-zinc-900 border-b border-zinc-800">
                            <table class="w-full table-fixed">
                                ${NeonovaDashboardView.buildColGroupHTML()}
                                ${NeonovaDashboardView.buildTheadHTML(this.controller.getTabController().getActiveTab())}
                            </table>
                        </div>
                        
                        <!-- Scrollable body — owned by NeonovaTabView -->
                        <div class="flex-1 overflow-y-auto px-6 neonova-scroll">
                            <table class="w-full table-fixed">
                                ${NeonovaDashboardView.buildColGroupHTML()}
                                <tbody id="customer-table-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    
        this.headerContainer = this.panel.querySelector('#header-container');
        this.contentArea = this.panel.querySelector('#content-area');
        this.tabBar = this.panel.querySelector('#tab-bar');
        this.tabBar.addEventListener('click', (e) => e.stopPropagation());
    
        const temp = document.createElement('div');
        temp.innerHTML = this.getHeaderHTML();
        this.header = temp.firstElementChild;
        this.headerContainer.appendChild(this.header);
    
        // Mount the tab view into the customer table body
        const tableBody = this.panel.querySelector('#customer-table-body');
        this.controller.mountTabView(tableBody);
    
        // Initial state
        // Hide content immediately so nothing flashes
        this.contentArea.style.display = 'none';
        this.isMinimized = true;
        
        // Kill transitions for the first layout pass
        const savedTransition = this.panel.style.transition;
        this.panel.style.transition = 'none';
        
        // Apply minimized sizing after the browser has laid out the header,
        // and again once fonts/images load so we can't get stuck on a stale measurement.
        const applyWhenReady = () => {
            if (this.isMinimized) this.applyMinimizedStyles();
        };
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                applyWhenReady();
                // Restore transitions for future user-driven toggles
                this.panel.style.transition = savedTransition;
            });
        });
        
        // Re-measure when the header's real size changes (fonts, icons, logo)
        const ro = new ResizeObserver(() => applyWhenReady());
        ro.observe(this.header);
        this.headerResizeObserver = ro;
        
        // Also re-run after the logo finishes loading
        const logoImg = this.header.querySelector('img');
        if (logoImg && !logoImg.complete) {
            logoImg.addEventListener('load', applyWhenReady, { once: true });
            logoImg.addEventListener('error', applyWhenReady, { once: true });
        }
        
        // And after fonts load (Font Awesome shifts button heights)
        if (document.fonts?.ready) {
            document.fonts.ready.then(applyWhenReady);
        }
    
        if (!document.getElementById('neonova-scroll-style')) {
            const style = document.createElement('style');
            style.id = 'neonova-scroll-style';
            style.innerHTML = `
                /* Polling tooltip — visibility, fade, and minimized-state position-flip
                   all owned here. Does not depend on Tailwind utility classes. */
                .poll-slider-tooltip {
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 250ms ease;
                }

                .neonova-dashboard thead th {
                    vertical-align: bottom;
                }

                .th-content {
                   display: inline-flex;
                   align-items: baseline;
                   gap: 6px;
               }

                .dashboard-header {
                    border-top-left-radius: 24px;
                    border-top-right-radius: 24px;
                }
                
                .group\\/polling:hover .poll-slider-tooltip,
                .poll-slider-tooltip:hover {
                    opacity: 1;
                    pointer-events: auto;
                }
                .neonova-dashboard.minimized .poll-slider-tooltip {
                    top: auto !important;
                    bottom: 100% !important;
                    margin-top: 0 !important;
                    margin-bottom: 12px !important;
                }
                .neonova-dashboard.minimized .poll-slider-tooltip > div:last-child {
                    top: auto !important;
                    bottom: -8px !important;
                    transform: rotate(225deg) !important;
                }
                .neonova-dashboard.minimized .poll-slider-tooltip {
                    padding-top: 0 !important;
                    padding-bottom: 12px !important;
                    margin-bottom: 0 !important;
                }
    
                /* Privacy mode blur */
                .neonova-privacy-mode td:nth-child(1),
                .neonova-privacy-mode td:nth-child(2) {
                    filter: blur(5px);
                    transition: filter 300ms ease;
                }
                .neonova-privacy-mode tr:hover td:nth-child(1),
                .neonova-privacy-mode tr:hover td:nth-child(2) {
                    filter: blur(0);
                }
    
                /* Scrollbar */
                .neonova-scroll::-webkit-scrollbar { width: 7px; }
                .neonova-scroll::-webkit-scrollbar-track { background: #18181b; border-radius: 9999px; }
                .neonova-scroll::-webkit-scrollbar-thumb { background: #34d399; border-radius: 9999px; border: 2px solid #18181b; }
                .neonova-scroll::-webkit-scrollbar-thumb:hover { background: #10b981; }
                .neonova-scroll { scrollbar-width: thin; scrollbar-color: #34d399 #18181b; }
    
                /* Tabs */
                .sort-glyph {
                    display: inline-block;
                    color: #52525b;
                    cursor: pointer;
                    user-select: none;
                    transition: color 150ms;
                    font-size: 12px;
                    line-height: 1;
                    flex-shrink: 0;
                }
                .neonova-tab-btn {
                    padding: 6px 18px;
                    border-radius: 12px 12px 0 0;
                    font-size: 13px;
                    font-weight: 500;
                    border: 1px solid #34d399;
                    border-bottom: none;
                    cursor: pointer;
                    transition: background 200ms, color 200ms;
                    color: #a1a1aa;
                    background: transparent;
                    position: relative;
                }
                .neonova-tab-btn:hover {
                    background: #27272a;
                    color: #e4e4e7;
                }
                .neonova-tab-btn.active {
                    background: #047857;
                    color: #ffffff;
                    border-color: #34d399;
                }
                .neonova-tab-btn .tab-close {
                    margin-left: 8px;
                    font-size: 14px;
                    color: #ffffff;
                    transition: color 150ms;
                }
                .neonova-tab-btn .tab-close:hover {
                    color: #ef4444;
                }
                .neonova-tab-add {
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 16px;
                    color: #52525b;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    transition: color 200ms;
                    line-height: 1;
                }
                .neonova-tab-add:hover { color: #34d399; }

                .sort-glyph:hover {
                    color: #34d399;
                }
                .sort-glyph-active {
                    color: #34d399;
                }
                .column-label {
                    user-select: none;
                }
    
                /* Drag-and-drop reorder */
                .neonova-tab-btn[draggable="true"] {
                    cursor: grab;
                }
                .neonova-tab-btn.dragging {
                    opacity: 0.4;
                    transform: scale(1.02);
                }
                .neonova-tab-btn.drop-before::before,
                .neonova-tab-btn.drop-after::after {
                    content: '';
                    position: absolute;
                    top: 4px;
                    bottom: 0;
                    width: 3px;
                    background: #34d399;
                    border-radius: 2px;
                    pointer-events: none;
                }
                .neonova-tab-btn.drop-before::before { left: -2px; }
                .neonova-tab-btn.drop-after::after { right: -2px; }

                /* Drag-and-drop reorder */
                .neonova-tab-btn[draggable="true"] {
                    cursor: grab;
                }

                /* Mode toggle icon (sort vs manual) */
                .neonova-tab-btn .tab-mode-toggle {
                    margin-right: 6px;
                    cursor: pointer;
                    color: #a1a1aa;
                    display: inline-flex;
                    align-items: center;
                    vertical-align: middle;
                    font-size: 13px;
                    line-height: 1;
                    transition: color 150ms;
                    user-select: none;
                }
                .neonova-tab-btn .tab-mode-toggle:hover {
                    color: #34d399;
                }

                /* Customer-drop target (whole tab highlights, not just a side bar) */
                .neonova-tab-btn.customer-drop-target {
                    background: #134e4a !important;
                    border-color: #34d399 !important;
                    color: #e4e4e7 !important;
                }
                
            `;
            document.head.appendChild(style);
        }
    
        this.attachHeaderListeners();
        this.#attachSortGlyphListener();
        this.renderTabBar();
    
        this.panel.addEventListener('click', (e) => {
            if (this.isMinimized && !e.target.closest('button')) {
                this.toggleMinimize();
            }
        });
    
        this.escListener = (e) => {
            if (e.key !== 'Escape') return;
            if (this.isMinimized) return;
            if (document.querySelector('.neonova-modal, #add-customer-modal, #passphrase-modal, [id*="modal"]')) return;
            e.preventDefault();
            this.toggleMinimize();
        };
        document.addEventListener('keydown', this.escListener, { capture: true });
    
        this.outsideListener = (e) => {
            if (document.querySelector('.neonova-modal, #add-customer-modal, #passphrase-modal, [id*="modal"]')) return;
            if (this.controller.isModalActive() || this.isMinimized) return;
            if (this.panel.contains(e.target)) return;
            this.toggleMinimize();
        };
        document.addEventListener('click', this.outsideListener);

        // Clear any stuck customer-drop-target highlights when a drag ends
        // anywhere — covers aborts (Esc, drop on nothing, drag out of window).
        document.addEventListener('dragend', () => {
            this.tabBar?.querySelectorAll('.customer-drop-target').forEach(b => {
                b.classList.remove('customer-drop-target');
            });
        });
        
        window.addEventListener('resize', () => {
            if (this.isMinimized) this.applyMinimizedStyles();
        });
    
        this.render();
    }

    renderTabBar() {
        if (!this.tabBar) return;
        this.tabBar.innerHTML = '';
    
        const tabs = this.controller.getTabController().tabs;
    
        tabs.forEach((tab, idx) => {
            const btn = document.createElement('button');
            btn.className = `neonova-tab-btn${tab.isActive ? ' active' : ''}`;
            btn.dataset.label = tab.label;
            btn.dataset.index = String(idx);
            btn.draggable = true;
            const { connected, disconnected } = tab.getConnectionCounts();

            const bellColor = tab.isNetworkTab ? '#34d399' : '#52525b';
            const bellTitle = tab.isNetworkTab
                ? 'Notifications ON for this tab (click to disable)'
                : 'Notifications OFF for this tab (click to enable)';

            const modeGlyph = tab.manualOrder ? '☰' : '⇅';
            const modeTitle = tab.manualOrder
                ? 'Manual order (click to switch to auto-sort by status)'
                : 'Auto-sort by status (click to switch to manual order)';

            btn.innerHTML = `
                <span class="tab-mode-toggle" title="${modeTitle}">${modeGlyph}</span>
                <span class="tab-bell"
                      title="${bellTitle}"
                      style="margin-right:6px; cursor:pointer; color:${bellColor}; display:inline-flex; align-items:center; vertical-align:middle;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                         fill="currentColor" style="display:block;">
                        <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/>
                    </svg>
                </span>
                <span class="tab-label">${tab.label}</span>
                <span style="margin-left: 6px; font-size: 12px; font-weight: 600; font-family: ui-monospace, monospace;">
                    ${connected > 0 ? `<span style="color: #34d399;">${connected}</span>` : ''}${connected > 0 && disconnected > 0 ? `<span style="color: #71717a;">/</span>` : ''}${disconnected > 0 ? `<span style="color: #ef4444;">${disconnected}</span>` : ''}
                </span>
                <span class="tab-close" title="Close tab">&times;</span>
            `;

            btn.querySelector('.tab-mode-toggle').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.controller.getTabController().toggleTabMode(tab.label);
                this.renderTabBar();
            });

            btn.querySelector('.tab-bell').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.controller.getTabController().toggleNetworkTab(tab.label);
                this.renderTabBar();
                for (const ctrl of tab.customers) {
                    ctrl.view.update();
                }
                this.controller.getTabController().rebuildTable();
            });

            btn.addEventListener('click', () => {
                this.controller.getTabController().switchTab(tab.label);
                this.renderTabBar();
            });

            btn.querySelector('.tab-close').addEventListener('click', (e) => {
                e.stopPropagation();
                const confirmed = confirm(`Close tab "${tab.label}"?`);
                if (confirmed) {
                    this.controller.getTabController().removeTab(tab.label);
                    this.renderTabBar();
                }
            });

            btn.querySelector('.tab-label').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const newLabel = prompt('Rename tab:', tab.label);
                if (newLabel?.trim() && newLabel.trim() !== tab.label) {
                    this.controller.getTabController().renameTab(tab.label, newLabel.trim());
                    this.renderTabBar();
                }
            });

            // ─── Tab reorder (drag a tab to reposition it) ──────────
            btn.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
                btn.classList.add('dragging');
            });

            btn.addEventListener('dragend', () => {
                btn.classList.remove('dragging');
                this.tabBar.querySelectorAll('.neonova-tab-btn').forEach(b => {
                    b.classList.remove('drop-before', 'drop-after');
                });
            });

            btn.addEventListener('dragover', (e) => {
                // Customer drag: handled by the customer-drop block below
                if (e.dataTransfer.types.includes('application/x-neonova-customer')) return;
                // Tab reorder: only react to our own MIME type
                if (!e.dataTransfer.types.includes('text/plain')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = btn.getBoundingClientRect();
                const isLeftHalf = e.clientX < rect.left + rect.width / 2;
                btn.classList.toggle('drop-before', isLeftHalf);
                btn.classList.toggle('drop-after', !isLeftHalf);
            });

            btn.addEventListener('dragleave', () => {
                btn.classList.remove('drop-before', 'drop-after');
            });

            btn.addEventListener('drop', (e) => {
                // Customer drag: handled by the customer-drop block below
                if (e.dataTransfer.types.includes('application/x-neonova-customer')) return;
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (Number.isNaN(fromIdx)) return;

                const rect = btn.getBoundingClientRect();
                const isLeftHalf = e.clientX < rect.left + rect.width / 2;
                let toIdx = idx + (isLeftHalf ? 0 : 1);
                if (fromIdx < toIdx) toIdx--;

                btn.classList.remove('drop-before', 'drop-after');
                this.controller.getTabController().reorderTab(fromIdx, toIdx);
            });

            // ─── Customer-drop target (cross-tab move) ──────────────
            btn.addEventListener('dragover', (e) => {
                if (!e.dataTransfer.types.includes('application/x-neonova-customer')) return;
                // Active tab is handled by the tbody's drop zone
                if (tab.isActive) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                btn.classList.add('customer-drop-target');
            });

            btn.addEventListener('dragleave', (e) => {
                if (!e.dataTransfer.types.includes('application/x-neonova-customer')) return;
                btn.classList.remove('customer-drop-target');
            });

            btn.addEventListener('drop', (e) => {
                if (!e.dataTransfer.types.includes('application/x-neonova-customer')) return;
                if (tab.isActive) return;
                e.preventDefault();
                e.stopPropagation();
                btn.classList.remove('customer-drop-target');
                const username = e.dataTransfer.getData('application/x-neonova-customer');
                if (!username) return;
                this.controller.getTabController().moveCustomerToTab(username, tab.label);
            });

            this.tabBar.appendChild(btn);
        });
    
        const addBtn = document.createElement('button');
        addBtn.className = 'neonova-tab-add';
        addBtn.title = 'Add tab';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => {
            const label = prompt('New tab name:');
            if (label?.trim()) {
                this.controller.getTabController().addTab(label.trim());
                this.renderTabBar();
            }
        });
        this.tabBar.appendChild(addBtn);
    }
    
    attachHeaderListeners() {
        const privacyBtn = this.header.querySelector('#privacy-toggle-btn');
        if (privacyBtn) {
            privacyBtn.addEventListener('click', () => this.togglePrivacy());
            this.updatePrivacyButton(privacyBtn);  // set correct eye / eye-slash on load
        }
        
        // Polling toggle
        const pollBtn = this.header.querySelector('#poll-toggle-btn');
        pollBtn?.addEventListener('click', () => {
            this.controller.togglePolling();
            this.updatePollingButton(pollBtn);
        });

        // Slider
        const slider = this.header.querySelector('#polling-interval-slider-tooltip');
        const intervalDisplay = this.header.querySelector('#interval-value-tooltip');
        slider?.addEventListener('input', () => {
            const minutes = parseInt(slider.value);
            intervalDisplay.textContent = `${minutes} min`;
            this.controller.setPollingInterval(minutes);

            const mainSpan = pollBtn?.querySelector('span.text-emerald-400\\/80');
            if (mainSpan) mainSpan.textContent = `· ${minutes} min`;
        });

        // Refresh
        this.header.querySelector('.refresh-btn')?.addEventListener('click', () => this.controller.poll());

        // Add customer
        this.header.querySelector('#add-customer-btn')?.addEventListener('click', () => {
            this.controller.showAddCustomer();
        });

        // Admins
        this.header.querySelector('#admins-btn')?.addEventListener('click', () => {
            this.controller.showAdminManager();
        });
    }

    updatePollingButton(btn) {
        if (!btn) return;
        const icon = btn.querySelector('i');
        const textSpan = btn.querySelector('span:not(.text-emerald-400\\/80)');
        const intervalSpan = btn.querySelector('span.text-emerald-400\\/80');

        if (this.controller.model.isPollingPaused) {
            icon.className = 'fas fa-play text-emerald-400';
            textSpan.textContent = 'Resume Polling';
        } else {
            icon.className = 'fas fa-pause text-emerald-400';
            textSpan.textContent = 'Pause Polling';
        }
        if (intervalSpan) intervalSpan.textContent = `· ${this.controller.model.pollingIntervalMinutes} min`;
    }

    updateHeader() {
        const pollBtn = this.header.querySelector('#poll-toggle-btn');
        if (pollBtn) this.updatePollingButton(pollBtn);

        const slider = this.header.querySelector('#polling-interval-slider-tooltip');
        if (slider) slider.value = this.controller.model.pollingIntervalMinutes;

        // Last Updated now comes straight from the model (view does zero work)
        this.updateLastUpdated();
    }

    updateLastUpdated() {
        const valueSpan = this.header.querySelector('#last-updated-value');
        if (!valueSpan) return;

        // This is the ONLY place the view touches the timestamp
        // → Your MODEL/CONTROLLER is now responsible for the string
        valueSpan.textContent = this.controller.model.lastUpdatedDisplay || 'Never';
    }

    // ====================== STYLE MORPH ======================
    applyMinimizedStyles() {
        const headerHeight = this.header.offsetHeight || 72;
        this.panel.style.height = `${headerHeight}px`;
        this.panel.style.top = `${window.innerHeight - headerHeight}px`;
        this.panel.style.bottom = 'auto';
        this.panel.style.border = '1px solid #22ff88';
        this.panel.style.borderBottom = 'none';
        this.panel.style.borderRadius = '24px 24px 0 0';
        this.panel.style.boxShadow = '0 -12px 40px rgba(0,0,0,0.8)';
        this.panel.style.cursor = 'pointer';
        this.panel.style.overflow = 'visible';
        this.panel.classList.add('minimized');
    }

    applyMaximizedStyles() {
        this.panel.style.height = 'calc(100vh - 100px)';
        this.panel.style.top = '60px';
        this.panel.style.bottom = 'auto';
        this.panel.style.border = '1px solid #27272a';
        this.panel.style.borderBottom = '1px solid #27272a';
        this.panel.style.borderRadius = '24px';
        this.panel.style.boxShadow = '0 8px 40px rgba(0,0,0,0.8)';
        this.panel.style.cursor = 'default';
        this.panel.style.overflow = 'hidden';
        this.panel.classList.remove('minimized');
    }

    // ====================== RENDER ===================
    render() {
        // No more row generation here
        this.updateHeader();          // keep — updates polling button, last-updated, etc.
        this.updateLastUpdated();     // if separate; or fold into updateHeader()
    }

    // ====================== TOGGLE (now pure morph – no duplicate DOM, no black box) ======================
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;

        if (this.isMinimized) {
            this.applyMinimizedStyles();
            this.contentArea.style.display = 'none';
        } else {
            this.contentArea.style.display = 'flex';
            this.applyMaximizedStyles();
        }
    }

    update() { this.render(); }

    async togglePrivacy() {
        this.controller.model.settings.privacyEnabled = !this.controller.model.settings.privacyEnabled;
        await this.controller.model.saveSettings();
    
        this.applyPrivacyBlur();
        
        const btn = this.header.querySelector('#privacy-toggle-btn');
        this.updatePrivacyButton(btn);
    }
    
    updatePrivacyButton(btn) {
        if (!btn) return;
        const enabled = this.controller.model.settings.privacyEnabled;
        
        if (enabled) {
            btn.textContent = 'Privacy On';
            btn.className = 'px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-2xl flex items-center justify-center transition-all border border-zinc-700 shadow-sm';
            btn.title = 'Privacy ON — names blurred';
        } else {
            btn.textContent = 'Privacy Off';
            btn.className = 'px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-2xl flex items-center justify-center transition-all border border-zinc-600 shadow-sm';
            btn.title = 'Privacy OFF — names visible';
        }
    }
    
    applyPrivacyBlur() {
        const tbody = this.panel.querySelector('#customer-table-body');
        if (tbody) {
            tbody.classList.toggle('neonova-privacy-mode', this.controller.model.settings.privacyEnabled);
        }
    }

}
