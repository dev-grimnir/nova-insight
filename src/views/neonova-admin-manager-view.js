class NeonovaAdminManagerView extends NeonovaBaseModalView {
    constructor(controller) {
        super(controller);
    }

    show() {
        const html = `
            <div id="admin-manager-overlay" class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 opacity-0 transition-opacity duration-300">
                <div class="transform -translate-y-12 transition-all duration-300 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-2xl mx-4">
                    <div class="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                        <h2 class="text-lg font-semibold text-zinc-100">Admins</h2>
                        <button id="admin-manager-close" class="text-zinc-400 hover:text-zinc-100 text-2xl leading-none px-2">&times;</button>
                    </div>

                    <!-- Inline add form -->
                    <div class="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                        <div class="flex items-end gap-3">
                            <div class="flex-1">
                                <label class="block text-xs uppercase tracking-widest text-zinc-500 mb-1">Name</label>
                                <input id="admin-add-name" type="text" placeholder="Jane Doe"
                                    class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500" />
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs uppercase tracking-widest text-zinc-500 mb-1">Phone</label>
                                <input id="admin-add-phone" type="text" inputmode="numeric" placeholder="412-555-1234"
                                    class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-emerald-500" />
                            </div>
                            <button id="admin-add-btn" disabled
                                class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition">
                                Add
                            </button>
                        </div>
                    </div>

                    <!-- List of admins -->
                    <div class="max-h-[60vh] overflow-y-auto neonova-scroll">
                        <table class="w-full">
                            <thead>
                                <tr class="text-xs uppercase tracking-widest text-zinc-500 bg-zinc-900 sticky top-0">
                                    <th class="px-4 py-2 text-left">Name</th>
                                    <th class="px-4 py-2 text-left">Phone</th>
                                    <th class="px-4 py-2 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody id="admin-list-body"></tbody>
                        </table>
                        <div id="admin-list-empty" class="px-4 py-8 text-center text-zinc-500 text-sm hidden">
                            No admins yet — add one above.
                        </div>
                    </div>
                </div>
            </div>
        `;

        return this.createModal(html).then(() => {
            this.#wireListeners();
            this.renderList();
            this.modal.querySelector('#admin-add-name')?.focus();
        });
    }

    #wireListeners() {
        const nameInput = this.modal.querySelector('#admin-add-name');
        const phoneInput = this.modal.querySelector('#admin-add-phone');
        const addBtn = this.modal.querySelector('#admin-add-btn');
        const closeBtn = this.modal.querySelector('#admin-manager-close');

        const updateAddState = () => {
            const name = nameInput.value.trim();
            const digits = NeonovaAdminView.extractDigits(phoneInput.value);
            addBtn.disabled = !(name.length > 0 && digits.length === 10);
        };

        nameInput?.addEventListener('input', updateAddState);

        phoneInput?.addEventListener('input', () => {
            const digits = NeonovaAdminView.extractDigits(phoneInput.value);
            phoneInput.value = NeonovaAdminView.formatForDisplay(digits);
            phoneInput.selectionStart = phoneInput.selectionEnd = phoneInput.value.length;
            updateAddState();
        });

        const handleAdd = async () => {
            if (addBtn.disabled) return;
            const name = nameInput.value.trim();
            const digits = NeonovaAdminView.extractDigits(phoneInput.value);
            const success = await this.controller.add(name, digits);
            if (success) {
                nameInput.value = '';
                phoneInput.value = '';
                updateAddState();
                nameInput.focus();
            }
        };

        addBtn?.addEventListener('click', handleAdd);

        const enterHandler = (e) => {
            if (e.key === 'Enter' && !addBtn.disabled) {
                e.preventDefault();
                handleAdd();
            }
        };
        nameInput?.addEventListener('keydown', enterHandler);
        phoneInput?.addEventListener('keydown', enterHandler);

        closeBtn?.addEventListener('click', () => this.hide());

        const overlay = this.modal.querySelector('#admin-manager-overlay');
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) this.hide();
        });
    }

    renderList() {
        if (!this.modal) return;
        const tbody = this.modal.querySelector('#admin-list-body');
        const empty = this.modal.querySelector('#admin-list-empty');
        if (!tbody) return;

        tbody.replaceChildren();
        const admins = this.controller.getAdminControllers();

        if (admins.length === 0) {
            empty?.classList.remove('hidden');
            return;
        }
        empty?.classList.add('hidden');

        const fragment = document.createDocumentFragment();
        for (const ctrl of admins) {
            const row = ctrl.getRowElement();
            if (row) fragment.appendChild(row);
        }
        tbody.appendChild(fragment);
    }
}
