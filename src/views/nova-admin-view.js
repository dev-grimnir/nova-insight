class NovaAdminView extends BaseNovaView {
    #controller;
    #tr;
    #editingField = null; // 'name' | 'phone' | null

    constructor(controller) {
        super();
        this.#controller = controller;

        this.#tr = document.createElement('tr');
        this.#tr.className = 'hover:bg-gray-800/50 transition-colors duration-100';

        this.#renderContent();
        this.#attachListeners();
    }

    getElement() {
        return this.#tr;
    }

    update() {
        this.#renderContent();
    }

    #renderContent() {
        const admin = this.#controller.model;
        const formatted = NovaAdminManagerView.formatForDisplay(admin.phoneNumber);

        this.#tr.innerHTML = `
            <td class="px-4 py-2 text-sm text-gray-200 whitespace-nowrap">
                <span class="admin-name cursor-pointer select-none" title="Click to edit name">
                    ${this.#escape(admin.name) || '<span class="text-zinc-500 italic">unnamed</span>'}
                </span>
            </td>
            <td class="px-4 py-2 text-sm text-gray-300 font-mono whitespace-nowrap">
                <span class="admin-phone cursor-pointer select-none" title="Click to edit phone">
                    ${formatted || '<span class="text-zinc-500 italic">no number</span>'}
                </span>
            </td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
                <button class="remove-btn text-red-400 hover:text-red-300 text-lg font-bold px-1.5" title="Remove Admin">
                    &times;
                </button>
            </td>
        `;

        if (this.#editingField) this.#enterEditMode(this.#editingField);
    }

    #escape(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    #attachListeners() {
        this.#tr.addEventListener('click', (e) => {
            const nameSpan = e.target.closest('.admin-name');
            if (nameSpan && this.#editingField !== 'name') {
                e.preventDefault();
                this.#enterEditMode('name');
                return;
            }
            const phoneSpan = e.target.closest('.admin-phone');
            if (phoneSpan && this.#editingField !== 'phone') {
                e.preventDefault();
                this.#enterEditMode('phone');
                return;
            }
            if (e.target.closest('.remove-btn')) {
                e.preventDefault();
                e.stopPropagation();
                this.#controller.remove();
                return;
            }
        });

        const handleOutside = (e) => {
            if (this.#editingField && !this.#tr.contains(e.target)) {
                this.#commitEdit();
            }
        };
        document.addEventListener('click', handleOutside);

        this.#tr.addEventListener('keydown', (e) => {
            if (!this.#editingField) return;
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

    #enterEditMode(field) {
        this.#editingField = field;

        if (field === 'name') {
            const cell = this.#tr.querySelector('.admin-name');
            const current = this.#controller.model.name || '';
            cell.outerHTML = `
                <input type="text"
                       class="admin-name-input bg-gray-700 text-gray-100 text-sm px-1.5 py-0.5 rounded border border-blue-500/60 w-full focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                       value="${current.replace(/"/g, '&quot;')}"
                       autofocus spellcheck="false">
            `;
            const input = this.#tr.querySelector('.admin-name-input');
            input?.select();
            input?.focus();
        } else if (field === 'phone') {
            const cell = this.#tr.querySelector('.admin-phone');
            const current = NovaAdminManagerView.formatForDisplay(this.#controller.model.phoneNumber);
            cell.outerHTML = `
                <input type="text"
                       class="admin-phone-input bg-gray-700 text-gray-100 text-sm px-1.5 py-0.5 rounded border border-blue-500/60 w-full focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-mono"
                       value="${current}"
                       autofocus spellcheck="false" inputmode="numeric">
            `;
            const input = this.#tr.querySelector('.admin-phone-input');
            input?.addEventListener('input', () => {
                const digits = NovaAdminManagerView.extractDigits(input.value);
                input.value = NovaAdminManagerView.formatForDisplay(digits);
                input.selectionStart = input.selectionEnd = input.value.length;
            });
            input?.focus();
        }
    }

    #commitEdit() {
        if (!this.#editingField) return;
        const field = this.#editingField;
        this.#editingField = null;

        const input = this.#tr.querySelector(field === 'name' ? '.admin-name-input' : '.admin-phone-input');
        if (!input) {
            this.#renderContent();
            return;
        }

        const value = input.value;
        if (field === 'name') {
            this.#controller.updateName(value).finally(() => this.#renderContent());
        } else {
            this.#controller.updatePhoneNumber(value).finally(() => this.#renderContent());
        }
    }

    #cancelEdit() {
        if (!this.#editingField) return;
        this.#editingField = null;
        this.#renderContent();
    }
}
