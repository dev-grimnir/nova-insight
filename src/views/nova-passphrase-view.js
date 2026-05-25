class NovaPassphraseView extends NovaBaseModalView {
    constructor(controller) {
        super(controller);
    }

    show() {
        const html = `
            <div id="passphrase-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] opacity-0 transition-opacity duration-300">
              <form autocomplete="off" onsubmit="return false;" class="w-full max-w-md mx-4">
                <div class="bg-zinc-900 rounded-2xl shadow-2xl p-8 transform translate-y-12 transition-transform duration-300 border border-zinc-700">
                  <h2 class="text-2xl font-bold text-emerald-400 mb-2">Encryption Passphrase</h2>
                  <p class="text-zinc-400 text-sm mb-6">This encrypts your customer list on disk.</p>
                  
                  <input type="text" id="passphrase-input" 
                         class="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-5 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 mb-6"
                         placeholder="Enter encryption key..." autocomplete="new-password">
            
                  <label class="flex items-center gap-3 text-zinc-400 text-sm mb-8 cursor-pointer">
                    <input type="checkbox" id="remember-cb" class="w-5 h-5 accent-emerald-500" checked>
                    Remember on this device
                  </label>
            
                  <div class="flex gap-3">
                    <button id="cancel-btn" type="button" class="flex-1 py-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white font-medium transition-colors">
                      Cancel
                    </button>
                    <button id="unlock-btn" type="button" class="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-medium transition-colors">
                      Unlock Dashboard
                    </button>
                  </div>
                </div>
              </form>
            </div>`;

        super.createModal(html);
        this.attachListeners();
    }

    attachListeners() {
        const input = this.modal.querySelector('#passphrase-input');
        const remember = this.modal.querySelector('#remember-cb');
        const overlay = this.modal.querySelector('#passphrase-modal');

        input.addEventListener('input', () => {
            const realValue = input.value;
            input.value = '*'.repeat(realValue.length);
            input.dataset.realValue = realValue;
        });

        const submit = () => {
            const passphrase = input.dataset.realValue || input.value.trim();
            this.controller.handleSubmit(passphrase, remember.checked);
        };

        // Click listeners (exactly as before)
        this.modal.querySelector('#unlock-btn').addEventListener('click', submit);
        this.modal.querySelector('#cancel-btn').addEventListener('click', () => this.controller.handleCancel());
        overlay.addEventListener('click', e => {
            if (e.target.id === 'passphrase-modal') this.controller.handleCancel();
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
    }

    /**
     * Escape now routes through the base (which calls this override).
     * Keeps the exact same behavior as before.
     */
    onEscape() {
        this.controller.handleCancel();
    }

    /**
     * Shows a clean temporary toast (red, top-center, auto-dismisses).
     * Called by controller on cancel/Escape when a key is required.
     */
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-8 py-3.5 rounded-2xl shadow-2xl z-[10000] flex items-center gap-3 text-sm font-medium animate-fade-in';
        toast.innerHTML = `Warning ${message}`;
        document.body.appendChild(toast);

        // Auto-dismiss after 2.8 seconds with smooth fade
        setTimeout(() => {
            toast.style.transition = 'all 0.4s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -10px)';
            setTimeout(() => toast.remove(), 400);
        }, 2800);
    }

    hide() {
        super.hide();
    }
}
