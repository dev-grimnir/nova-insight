class NeonovaCustomerView extends BaseNeonovaView {
    #controller;
    #tr;
    #isEditing = false;

    constructor(controller) {
        super();
        this.#controller = controller;
    
        this.#tr = document.createElement('tr');
        this.#tr.className = 'hover:bg-gray-800/50 transition-colors duration-100';
        this.#tr.draggable = true;
        this.#tr.dataset.username = controller.radiusUsername;
    
        this.#renderContent();
        this.#attachListeners();
        this.#attachDragListeners();

        if (!document.getElementById('neonova-drag-handle-style')) {
            const style = document.createElement('style');
            style.id = 'neonova-drag-handle-style';
            style.textContent = `
                .drag-handle {
                    display: inline-block;
                    color: #52525b;
                    cursor: grab;
                    user-select: none;
                    margin-right: 8px;
                    font-size: 14px;
                    line-height: 1;
                    transition: color 150ms;
                }
                .drag-handle:hover {
                    color: #34d399;
                }
                .drag-handle:active {
                    cursor: grabbing;
                }
            `;
            document.head.appendChild(style);
        }
    }

    #attachDragListeners() {
        this.#tr.addEventListener('dragstart', (e) => {
            if (this.#isEditing) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-neonova-customer', this.#controller.radiusUsername);
            this.#tr.classList.add('neonova-row-dragging');
            const tabCtrl = this.#controller.dashboardController?.getTabController?.();
            tabCtrl?.beginDrag();
        });
    
        this.#tr.addEventListener('dragend', () => {
            this.#tr.classList.remove('neonova-row-dragging');
            const tabCtrl = this.#controller.dashboardController?.getTabController?.();
            tabCtrl?.endDrag();
        });
    }

    getElement() {
        return this.#tr;
    }

    update() {
        this.#renderContent();
    }

    /**
     * Walk all tabs to find the one containing this customer controller.
     * Used to know whether the parent tab has notifications enabled, which
     * determines whether the per-modem bell is shown in the Actions column.
     */
    #findParentTab() {
        const tabCtrl = this.#controller.dashboardController?.getTabController?.();
        if (!tabCtrl) return null;
        for (const tab of tabCtrl.tabs) {
            if (tab.customers.includes(this.#controller)) return tab;
        }
        return null;
    }

    #renderContent() {
        const cust = this.#controller.model;
        const status = cust.status ?? 'Connecting...';
        const durationStr = cust.getDurationStr?.() ?? '—';
        const inlineSnapshot = new NeonovaInlineSnapshotView(cust).render();

        const statusStyles = {
            'Connected':     { bg: 'bg-emerald-900/40', text: 'text-emerald-300', border: 'border-emerald-700/50', dot: 'bg-emerald-400' },
            'Disconnected':  { bg: 'bg-red-900/40',     text: 'text-red-300',     border: 'border-red-700/50',     dot: 'bg-red-400' },
            'Connecting...': { bg: 'bg-amber-900/40',   text: 'text-amber-300',   border: 'border-amber-700/50',   dot: 'bg-amber-400 animate-pulse' },
            'Unknown':       { bg: 'bg-zinc-800/40',    text: 'text-zinc-400',    border: 'border-zinc-700/50',    dot: 'bg-zinc-500' },
            'Error':         { bg: 'bg-purple-900/40',  text: 'text-purple-300',  border: 'border-purple-700/50',  dot: 'bg-purple-400' },
        };
        const style = statusStyles[status] || statusStyles['Unknown'];

        const parentTab = this.#findParentTab();
        const showBell = parentTab?.isNetworkTab === true;

        let bellHtml = '';
        if (showBell) {
            const bellColor = cust.alertsSuppressed ? '#ef4444' : '#34d399';
            const bellTitle = cust.alertsSuppressed
                ? 'Alerts SUPPRESSED for this modem (click to enable)'
                : 'Alerts ACTIVE for this modem (click to suppress)';
            bellHtml = `
                <span class="alert-bell-toggle"
                      title="${bellTitle}"
                      style="cursor:pointer; color:${bellColor}; display:inline-flex; align-items:center; vertical-align:middle; padding:0 4px; margin-right:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                         fill="currentColor" style="display:block;">
                        <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/>
                    </svg>
                </span>
            `;
        }

        this.#tr.innerHTML = `
            <td class="px-2 py-1 text-sm text-gray-200 whitespace-nowrap">
                <span class="drag-handle" title="Drag to reorder or move to another tab">⋮⋮</span>
                <span class="friendly-name cursor-pointer select-none" title="Click to edit name">
                    ${cust.friendlyName || cust.radiusUsername}
                </span>
            </td>
            <td class="px-2 py-1 text-sm text-gray-400 font-mono">${cust.radiusUsername}</td>
            <td class="px-2 py-1">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:brightness-125 hover:scale-105 transition-all ${style.bg} ${style.text} ${style.border}" title="Click to view 72 hour connection timeline">
                    <span class="flex h-2 w-2 rounded-full ${style.dot} ring-1 ring-offset-1 ring-offset-gray-900"></span>
                    ${status}
                </span>
            </td>
            <td class="px-2 py-1 text-sm text-gray-300">${durationStr}</td>
            <td class="px-2 py-1 snapshot-cell" style="vertical-align: middle;">
                <div class="snapshot-host" style="width: 100%; height: 20px;"></div>
            </td>
            <td class="px-2 py-1 text-right whitespace-nowrap">
                ${bellHtml}
                <button class="remove-btn text-red-400 hover:text-red-300 text-lg font-bold px-1.5" title="Remove Customer">×</button>
                <button class="report-btn text-emerald-400 hover:text-emerald-300 text-xl px-1.5 ml-2" title="Generate Report">📊</button>
            </td>
        `;

        const host = this.#tr.querySelector('.snapshot-host');
        if (host) host.appendChild(inlineSnapshot);

        if (this.#isEditing) this.#enterEditMode();
    }

    #attachListeners() {
        this.#tr.addEventListener('click', (e) => {
            if (e.target.closest('.alert-bell-toggle')) {
                e.preventDefault();
                e.stopPropagation();
                this.#controller.toggleAlertsSuppressed();
                return;
            }

            const nameSpan = e.target.closest('.friendly-name');
            if (nameSpan && !this.#isEditing) {
                e.preventDefault();
                this.#enterEditMode();
                return;
            }

            if (e.target.closest('.remove-btn')) {
                e.preventDefault();
                e.stopPropagation();
                this.#controller.remove();
            }

            if (e.target.closest('.report-btn')) {
                e.preventDefault();
                this.#controller.launchReport();
            }

            if (e.target.closest('span.inline-flex.items-center')) {
                e.preventDefault();
                e.stopPropagation();
                this.#controller.open3DaySnapshot();
                return;
            }
        });

        const handleOutside = (e) => {
            if (this.#isEditing && !this.#tr.contains(e.target)) {
                this.#commitEdit();
            }
        };
        document.addEventListener('click', handleOutside);

        this.#tr.addEventListener('keydown', (e) => {
            if (!this.#isEditing) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                this.#commitEdit();
            } else if (e.key === 'Escape') {
                this.#cancelEdit();
            }
        });

        this.#tr.addEventListener('remove', () => {
            document.removeEventListener('click', handleOutside);
        }, { once: true });
    }

    #enterEditMode() {
        this.#isEditing = true;
        const nameCell = this.#tr.querySelector('.friendly-name');
        const current = this.#controller.model.friendlyName || this.#controller.model.radiusUsername;

        nameCell.innerHTML = `
            <input type="text" class="bg-gray-700 text-gray-100 text-sm px-1.5 py-0.5 rounded border border-blue-500/60 w-full focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                   value="${current.replace(/"/g, '&quot;')}"
                   autofocus spellcheck="false">
        `;

        const input = nameCell.querySelector('input');
        if (input) {
            input.select();
            input.focus();
        }
    }

    #commitEdit() {
        if (!this.#isEditing) return;
        this.#isEditing = false;

        const input = this.#tr.querySelector('input');
        if (input) {
            const newName = input.value;
            this.#controller.updateFriendlyName(newName);
        }

        this.#renderContent();
    }

    #cancelEdit() {
        if (!this.#isEditing) return;
        this.#isEditing = false;
        this.#renderContent();
    }
}
