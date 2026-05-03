class NeonovaAddCustomerView extends NeonovaBaseModalView {
    constructor(controller) {
        super(controller);
        this._enterListener = null;
    }

    /**
     * Shows the modal — exactly the same HTML and entrance animation as before.
     * All heavy lifting (overlay, append, fade + slide, Esc listener, opened event) is now in the base.
     */
    show() {
        const html = `
            <div id="add-customer-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] opacity-0 transition-all duration-300">
                <div class="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-md mx-4 overflow-hidden shadow-2xl transform -translate-y-12 transition-all duration-300">
                    <!-- Header -->
                    <div class="px-6 py-4 border-b border-zinc-700 flex items-center justify-between bg-zinc-950">
                        <h2 class="text-xl font-semibold text-white">Add New Customer</h2>
                        <button id="close-modal-btn" class="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
                    </div>

                    <!-- Form -->
                    <div class="p-6 space-y-6">
                        <div>
                            <label class="block text-sm font-medium text-zinc-400 mb-1.5">RADIUS Username <span class="text-red-400">*</span></label>
                            <input id="radius-username" type="text" 
                                   class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 placeholder-zinc-500"
                                   placeholder="Valid Radius username" autocomplete="off">
                               <div id="username-error" class="hidden mt-2 text-sm text-red-400"></div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-zinc-400 mb-1.5">Friendly Name (optional)</label>
                            <input id="friendly-name" type="text" 
                                   class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 placeholder-zinc-500"
                                   placeholder="John Doe - Home Office">
                        </div>
                    </div>

                    <!-- Footer buttons -->
                    <div class="px-6 py-4 border-t border-zinc-700 bg-zinc-950 flex gap-3">
                        <button id="cancel-btn"
                                class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-2xl transition-colors">
                            Cancel
                        </button>
                        <button id="add-btn"
                                class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-2xl transition-colors">
                            Add Customer
                        </button>
                    </div>
                </div>
            </div>
        `;

        super.createModal(html);
        this.attachListeners();
        this.modal.querySelector('#radius-username')?.focus();

        // Preserve original Enter key behavior (base only handles Escape)
        this._enterListener = (e) => {
            if (e.key === 'Enter' && this.modal && this.modal.contains(document.activeElement)) {
                e.preventDefault();
                const addBtn = this.modal.querySelector('#add-btn');
                if (addBtn) addBtn.click();
            }
        };
        document.addEventListener('keydown', this._enterListener);
    }

    attachListeners() {
        const modalEl = this.modal.querySelector('#add-customer-modal');
        const closeBtn = this.modal.querySelector('#close-modal-btn');
        const cancelBtn = this.modal.querySelector('#cancel-btn');
        const addBtn = this.modal.querySelector('#add-btn');

        const close = () => this.hide();

        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        modalEl.addEventListener('click', e => {
            if (e.target === modalEl) close();
        });

        addBtn.addEventListener('click', () => {
            const usernameInput = this.modal.querySelector('#radius-username');
            const nameInput = this.modal.querySelector('#friendly-name');

            const radiusUsername = usernameInput.value.trim().replace(/\s+/g, '');
            const friendlyName = nameInput.value.trim();

            if (!radiusUsername) {
                usernameInput.classList.add('!border-red-500');
                usernameInput.focus();
                setTimeout(() => usernameInput.classList.remove('!border-red-500'), 2000);
                return;
            }

            this.controller.handleSubmit(radiusUsername, friendlyName);
        });
    }

    hide() {
        if (this._enterListener) {
            document.removeEventListener('keydown', this._enterListener);
            this._enterListener = null;
        }
        super.hide();
    }

    showError(msg) {
        const errorEl = document.getElementById('username-error');
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
            
            const input = document.getElementById('radius-username');
            if (input) input.classList.add('border-red-500');
        } else {
            console.warn("Username error element not found");
            alert(msg);
        }   
    }

    hideError() {
        const errorEl = document.getElementById('username-error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
            
            const input = document.getElementById('radius-username');
            if (input) input.classList.remove('border-red-500');
        }
    }
}
