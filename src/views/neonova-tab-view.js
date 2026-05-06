class NeonovaTabView extends BaseNeonovaView {
    constructor(tabController) {
        super();
        this.tabController = tabController;
        this.container = null;
        this.dropIndicator = null;
        this.lastDropTargetIdx = null;
    }

    mount(containerEl) {
        this.container = containerEl;
        this.#injectStyles();
        this.#setupDropIndicator();
        this.#attachDragListeners();
    }

    #injectStyles() {
        if (document.getElementById('neonova-row-drag-style')) return;
        const style = document.createElement('style');
        style.id = 'neonova-row-drag-style';
        style.textContent = `
            .neonova-row-drop-indicator {
                position: fixed;
                height: 3px;
                background: #34d399;
                pointer-events: none;
                display: none;
                z-index: 9999;
                border-radius: 2px;
                box-shadow: 0 0 4px rgba(52, 211, 153, 0.8);
            }
            tr.neonova-row-dragging {
                opacity: 0.4;
                transform: scale(1.02);
                transition: transform 100ms;
            }
        `;
        document.head.appendChild(style);
    }

    #setupDropIndicator() {
        this.dropIndicator = document.createElement('div');
        this.dropIndicator.className = 'neonova-row-drop-indicator';
        document.body.appendChild(this.dropIndicator);
    }

    #attachDragListeners() {
        this.container.addEventListener('dragover', (e) => this.#handleDragOver(e));
        this.container.addEventListener('dragleave', (e) => this.#handleDragLeave(e));
        this.container.addEventListener('drop', (e) => this.#handleDrop(e));
        document.addEventListener('dragend', () => {
            this.#hideDropIndicator();
            this.lastDropTargetIdx = null;
        });
    }

    #handleDragOver(e) {
        if (!e.dataTransfer.types.includes('application/x-neonova-customer')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    
        const rows = Array.from(this.container.querySelectorAll('tr'));
        if (rows.length === 0) {
            this.#hideDropIndicator();
            this.lastDropTargetIdx = 0;
            return;
        }
    
        const cursorY = e.clientY;
        let targetRow = null;
        let targetIdx = -1;
        let dropAbove = true;
    
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            if (cursorY < rect.bottom) {
                targetRow = rows[i];
                targetIdx = i;
                const midY = rect.top + rect.height / 2;
                dropAbove = cursorY < midY;
                break;
            }
        }
    
        // Cursor is past the last row — drop at end
        if (!targetRow) {
            targetRow = rows[rows.length - 1];
            targetIdx = rows.length - 1;
            dropAbove = false;
        }
    
        this.lastDropTargetIdx = dropAbove ? targetIdx : targetIdx + 1;
        this.#positionDropIndicator(targetRow, dropAbove);
    }

    #handleDragLeave(e) {
        const related = e.relatedTarget;
        if (related && this.container.contains(related)) return;
        this.#hideDropIndicator();
        this.lastDropTargetIdx = null;
    }

    #handleDrop(e) {
        if (!e.dataTransfer.types.includes('application/x-neonova-customer')) return;
        e.preventDefault();
        e.stopPropagation();
    
        this.#hideDropIndicator();
    
        const username = e.dataTransfer.getData('application/x-neonova-customer');
        const toIdx = this.lastDropTargetIdx;
        this.lastDropTargetIdx = null;
    
        if (!username || toIdx === null) return;
    
        const rows = Array.from(this.container.querySelectorAll('tr'));
        const fromIdx = rows.findIndex(r => r.dataset.username === username);
        if (fromIdx === -1) return; // dragged from a different tab — tab bar handles that
    
        this.tabController.reorderCustomer(fromIdx, toIdx);
    }

    #positionDropIndicator(row, above) {
        if (!this.dropIndicator) return;
        const rect = row.getBoundingClientRect();
        this.dropIndicator.style.display = 'block';
        this.dropIndicator.style.left = `${rect.left}px`;
        this.dropIndicator.style.width = `${rect.width}px`;
        this.dropIndicator.style.top = `${(above ? rect.top : rect.bottom) - 1.5}px`;
    }

    #hideDropIndicator() {
        if (this.dropIndicator) this.dropIndicator.style.display = 'none';
    }
    
    render() {
        if (!this.container) return;
        this.tabController.rebuildTable();
    }

    clearRows() {
        if (this.container) this.container.replaceChildren();
    }

    appendRow(trElement) {
        if (this.container && trElement instanceof HTMLElement) {
            this.container.appendChild(trElement);
        }
    }

    setRows(rowElements) {
        this.clearRows();
        if (!Array.isArray(rowElements)) return;
        const fragment = document.createDocumentFragment();
        rowElements.forEach(tr => {
            if (tr instanceof HTMLElement) fragment.appendChild(tr);
        });
        if (this.container) this.container.appendChild(fragment);
    }

    applyPrivacyBlur(enabled) {
        if (this.container) {
            this.container.classList.toggle('neonova-privacy-mode', enabled);
        }
    }
    
    #buildTable(customers) {
        const wrapper = document.createElement('div');

        if (!customers.length) {
            wrapper.textContent = 'No customers in this tab.';
            return wrapper;
        }

        const table = document.createElement('table');
        table.className = 'neonova-customer-table';

        for (const ctrl of customers) {
            const row = ctrl.getRowElement();
            if (row) table.appendChild(row);
        }

        wrapper.appendChild(table);
        return wrapper;
    }
}
