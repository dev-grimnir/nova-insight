/**
 * @file demo/neonova-account-list-box.js
 *
 * NeonovaAccountListBox — sidekick panel that appears next to the Add
 * Customer modal in the demo. Shows the full set of registry usernames.
 * Names already pre-seeded into a tab render muted grey; un-seeded names
 * render in emerald to suggest "try me."
 *
 * Lives entirely in demo/. Hooks into the production modal from the
 * outside via a MutationObserver on document.body — no production code
 * changes needed. The box appends itself as a flex sibling of the modal
 * content; when the modal is removed from the DOM the box goes with it,
 * since it's a descendant of the overlay.
 *
 * Self-initializes at the bottom of this file. Just include via <script>
 * tag in index.html after the registry and before/after bootstrap is fine
 * — this file has no runtime dependencies on either.
 */

class NeonovaAccountListBox {

    // ────────────────────────────────────────────────────────────────────
    // VERIFY THIS LIST against the registry on the demo branch.
    //
    // Source: enumeration in the project memory file. The memory says
    // "17 customers" but enumerates 20 across flavor groups. The seeder
    // uses 18 of them. The two un-seeded entries (wparker0815, sgreenwood)
    // are the green pool.
    //
    // If the registry's actual contents differ from this list, fix here.
    // ────────────────────────────────────────────────────────────────────
    static #ALL = [
        // Stable residential
        'mthompson',
        'akravchenko',
        'dpatel0421',
        'swilliams88',
        'rgarcia2401',
        'wparker0815',
        'sgreenwood',
        'dchen.voip',
        // Flaky residential
        'jburke7621',
        'lhanson.pgh',
        'bnguyen419',
        'emcfadden',
        'twatkins.rural',
        // Stable business
        'pacific.st.node.04',
        'bentleyville.tower.7',
        'macgregor.relay',
        'denverton.school.modem',
        // Special-case
        'chodges.mtwash',
        'pmoreno1167',
        'klindstrom.42'
    ];

    // Names the seeder pre-populates across the three tabs.
    // Source of truth: demo/neonova-demo-seeder.js #SCENARIO.
    static #SEEDED = new Set([
        // Network tab
        'chodges.mtwash',
        'pacific.st.node.04',
        'bentleyville.tower.7',
        'macgregor.relay',
        'denverton.school.modem',
        // Customers tab
        'mthompson',
        'akravchenko',
        'dpatel0421',
        'swilliams88',
        'rgarcia2401',
        'dchen.voip',
        'jburke7621',
        'pmoreno1167',
        'klindstrom.42',
        // Watchlist tab
        'twatkins.rural',
        'emcfadden',
        'lhanson.pgh',
        'bnguyen419'
    ]);

    static init() {
        const observer = new MutationObserver(() => {
            const overlay = document.getElementById('add-customer-modal');
            if (overlay && !overlay.querySelector('#demo-account-list-box')) {
                this.#inject(overlay);
            }
        });
        observer.observe(document.body, { childList: true });
    }

    static #inject(overlay) {
        const box = document.createElement('div');
        box.id = 'demo-account-list-box';
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

        const items = this.#ALL.map(username => {
            const isSeeded = this.#SEEDED.has(username);
            const colorClass = isSeeded ? 'text-zinc-500' : 'text-emerald-400';
            return `<li class="${colorClass}">${username}</li>`;
        }).join('');

        box.innerHTML = `
            <div class="px-5 py-3 border-b border-zinc-700 bg-zinc-950">
                <p class="text-xs text-zinc-400">
                    Names can be used on multiple tabs. Grey names are already in use.
                </p>
            </div>
            <ul class="px-5 py-4 space-y-1 font-mono text-sm">
                ${items}
            </ul>
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

NeonovaAccountListBox.init();
