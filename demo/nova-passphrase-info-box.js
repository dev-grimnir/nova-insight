/**
 * @file demo/nova-passphrase-info-box.js
 *
 * NovaPassphraseInfoBox — sidekick panel that appears next to the
 * passphrase modal in the demo. Briefly explains what the passphrase
 * is for, that the user can pick anything, and that it cannot be left
 * blank.
 *
 * Lives entirely in demo/. Hooks into the production modal from the
 * outside via a MutationObserver on document.body — no production code
 * changes needed. The box appends itself as a flex sibling of the
 * modal content; when the modal is removed from the DOM the box goes
 * with it, since it's a descendant of the overlay.
 *
 * Self-initializes at the bottom of this file. Just include via
 * <script> tag in index.html.
 */

class NovaPassphraseInfoBox {

    static init() {
        const observer = new MutationObserver(() => {
            const overlay = document.getElementById('passphrase-modal');
            if (overlay && !overlay.querySelector('#demo-passphrase-info-box')) {
                this.#inject(overlay);
            }
        });
        observer.observe(document.body, { childList: true });
    }

    static #inject(overlay) {
        const box = document.createElement('div');
        box.id = 'demo-passphrase-info-box';
        box.className = [
            'bg-zinc-900',
            'border',
            'border-zinc-700',
            'rounded-3xl',
            'shadow-2xl',
            'overflow-hidden',
            'w-72',
            'mr-6',
            'opacity-0',
            'transition-opacity',
            'duration-300'
        ].join(' ');

        box.innerHTML = `
            <div class="px-5 py-4 space-y-3 text-sm text-zinc-300 leading-relaxed">
                <p>
                    Your passphrase is what enables encryption — it's
                    the key that locks and unlocks your customer list
                    on disk.
                </p>
                <p>
                    Pick anything you like: a word, a phrase, a
                    sequence of characters. Whatever you'll remember.
                </p>
                <p class="text-emerald-400 font-medium">
                    It cannot be left blank.
                </p>
            </div>
        `;

        // Insert before the modal content so flex-row order puts the
        // box on the left and the modal on the right.
        const modalContent = overlay.firstElementChild;
        overlay.insertBefore(box, modalContent);

        // Trigger fade-in next frame so the transition actually fires.
        requestAnimationFrame(() => {
            box.classList.remove('opacity-0');
        });
    }
}

NovaPassphraseInfoBox.init();
