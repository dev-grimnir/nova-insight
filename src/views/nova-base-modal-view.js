class NovaBaseModalView extends BaseNovaView {
    constructor(controller) {
        super();                     // Important: no container passed to base
        this.controller = controller;
        this.modal = null;           // The actual modal DOM element
        this._keyListener = null;
        this._originalSlideClass = null;
    }

    /**
     * Creates the modal and returns a Promise that resolves ONLY when
     * the inner content is fully in the DOM and queryable.
     * Child views should do: super.createModal(html).then(() => { this.render(); ... })
     */
    createModal(htmlTemplate) {
        if (this.modal) {
            this.hide();
            return Promise.resolve();
        }

        this.modal = document.createElement('div');
        this.modal.innerHTML = htmlTemplate;
        document.body.appendChild(this.modal);

        // Capture original slide class for clean exit animation
        const box = this.modal.querySelector('.transform');
        if (box) {
            if (box.classList.contains('-translate-y-12')) this._originalSlideClass = '-translate-y-12';
            else if (box.classList.contains('translate-y-12')) this._originalSlideClass = 'translate-y-12';
        }

        return new Promise(resolve => {
            // Immediate check if content is already queryable
            if (this.modal.querySelector('div[id*="content"], #daily-content, #report-content')) {
                resolve();
                return;
            }

            // MutationObserver – waits for the innerHTML to be fully parsed
            const observer = new MutationObserver(() => {
                if (this.modal.querySelector('div[id*="content"], #daily-content, #report-content')) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(this.modal, { childList: true, subtree: true });

            // Safety net (max 100ms)
            setTimeout(() => {
                observer.disconnect();
                resolve();
            }, 100);
        }).then(() => {
            // Entrance animation
            setTimeout(() => {
                const overlay = this.modal.querySelector('div.fixed.inset-0, div[id*="modal"]') || this.modal.firstElementChild;
                if (overlay) overlay.classList.add('opacity-100');

                if (box) box.classList.remove('-translate-y-12', 'translate-y-12');
            }, 10);

            // Global Escape key handler
            this._keyListener = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.onEscape();
                }
            };
            document.addEventListener('keydown', this._keyListener);

            this.dispatchEvent(new CustomEvent('nova:modal-opened', {
                detail: { modalType: this.constructor.name }
            }));
        });
    }

    hide() {
        if (!this.modal) return;

        if (this._keyListener) {
            document.removeEventListener('keydown', this._keyListener);
            this._keyListener = null;
        }

        const overlay = this.modal.querySelector('div.fixed.inset-0, div[id*="modal"]') || this.modal.firstElementChild;
        const box = this.modal.querySelector('.transform');

        if (overlay) overlay.classList.remove('opacity-100');
        if (box && this._originalSlideClass) {
            box.classList.add(this._originalSlideClass);
        }

        setTimeout(() => {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            this.modal = null;
            this._originalSlideClass = null;

            this.dispatchEvent(new CustomEvent('nova:modal-closed', {
                detail: { modalType: this.constructor.name }
            }));
        }, 300);
    }

    onEscape() {
        this.hide();
    }

    close() {
        this.hide();
    }
}
