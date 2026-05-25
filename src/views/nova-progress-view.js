class NovaProgressView extends NovaBaseModalView {
    constructor(controller, username, friendlyName) {
        super(controller);
        this.username = username;
        this.friendlyName = friendlyName || username;
        this.abortController = null;
    }

    get signal() {
        return this.abortController?.signal ?? null;
    }

    show() {
        const html = `
            <div id="progress-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[10001] opacity-0 transition-opacity duration-400">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl w-[460px] p-8 shadow-2xl text-center transform translate-x-12 transition-all duration-500">
                    <div class="text-emerald-400 text-xs font-mono tracking-widest mb-2">GENERATING REPORT</div>
                    <div class="text-2xl font-semibold text-white mb-8">${this.friendlyName}</div>
                    
                    <div id="progress-container" class="mb-6">
                        <div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div id="progress-bar" class="h-full bg-emerald-500 transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>
                    
                    <div id="status" class="font-mono text-emerald-400 text-sm mb-8">Starting fetch...</div>
                    
                    <button id="cancel-btn" class="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-sm font-medium transition">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        super.createModal(html);

        requestAnimationFrame(() => {
            this.#attachListeners();
        });
    }

    /**
     * New signature matches the updated callback from paginateReportLogs:
     * onProgress(totalRows, currentEntries, currentPage)
     */
    updateProgress(fetchedCount, page, total = null) {
        const bar = this.modal.querySelector('#progress-bar');
        const status = this.modal.querySelector('#status');
    
        let percent = 0;
        let statusText = 'Starting fetch...';
    
        if (total !== null && total > 0) {
            // Main case: we have total from first page
            percent = Math.min(99, Math.round((fetchedCount / total) * 100));
            const totalPages = Math.ceil(total / 100);  // assuming 100 hits/page
    
            statusText = `Page ${page} of ${totalPages} — ` +
                         `${fetchedCount.toLocaleString()} of ${total.toLocaleString()} entries ` +
                         `(${percent}%)`;
        } else {
            // Fallback: before total known — show page and entries only
            percent = Math.min(99, page * 3);  // rough ramp-up
            statusText = `Fetching page ${page}... (${fetchedCount.toLocaleString()} entries so far)`;
        }
    
        if (bar) bar.style.width = `${percent}%`;
        if (status) status.textContent = statusText;
    }

    markComplete() {
        const bar = this.modal.querySelector('#progress-bar');
        if (bar) bar.style.width = '100%';

        const status = this.modal.querySelector('#status');
        if (status) status.textContent = 'Report complete — opening in new tab...';

        this.hide();
    }

    showError(message) {
        const status = this.modal.querySelector('#status');
        if (status) status.textContent = 'Error: ' + message;
    }

    #attachListeners() {
        const cancelBtn = this.modal.querySelector('#cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (this.abortController) this.abortController.abort();
                this.hide();
            });
        }
    }
    
}
