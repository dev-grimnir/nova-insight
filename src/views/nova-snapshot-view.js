/**
 * Modal wrapper for the snapshot paradigm. Owns modal chrome (overlay,
 * Close button, scale animation, click-outside dismiss). Composes a
 * NovaSnapshotPanelView into the modal's content area; all paradigm
 * logic lives there.
 */
class NovaSnapshotView extends NovaBaseModalView {
    #hasShown = false;
    #panel = null;

    constructor(controller, model) {
        super(controller);
        this.controller = controller;
        this.model = model;
    }

    show() {
        if (this.#hasShown) return;
        this.#hasShown = true;

        const modalHTML = `
            <div id="snapshot-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[10001] opacity-0 transition-opacity duration-400">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl w-[1280px] max-w-[96vw] max-h-[96vh] overflow-hidden shadow-2xl flex flex-col transform scale-95 transition-all duration-500">
                    <div class="px-8 py-4 border-b border-[#27272a] bg-[#09090b] flex-shrink-0 flex items-center justify-end">
                        <button id="close-snapshot-btn" class="px-6 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl flex items-center gap-2 transition">
                            ✕ Close
                        </button>
                    </div>
                    <div id="snapshot-content" class="flex-1 overflow-y-auto p-8 bg-[#18181b]"></div>
                </div>
            </div>
        `;

        super.createModal(modalHTML).then(() => {
            const content = this.modal.querySelector('#snapshot-content');
            this.#panel = new NovaSnapshotPanelView(this.controller, this.model, content);
            this.#panel.show();

            this.#attachListeners();

            const modalOverlay = this.modal.querySelector('#snapshot-modal');
            if (modalOverlay) {
                modalOverlay.style.opacity = '1';
                modalOverlay.style.transform = 'scale(1)';
            }
        }).catch(err => {
            console.error('Snapshot modal creation failed:', err);
        });
    }

    #attachListeners() {
        const closeBtn = this.modal.querySelector('#close-snapshot-btn');
        const modalEl  = this.modal.querySelector('#snapshot-modal');

        closeBtn?.addEventListener('click', () => this.hide());
        modalEl?.addEventListener('click', e => { if (e.target === modalEl) this.hide(); });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaSnapshotView;
}
