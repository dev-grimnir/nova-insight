/**
 * @file demo/neonova-demo-seeder.js
 *
 * NeonovaDemoSeeder — pre-populate the dashboard with a curated scenario.
 *
 * The seeder runs ONCE per session, only when the dashboard loads with no
 * pre-existing tab state. Returning visitors who entered a passphrase that
 * decrypts an existing localStorage payload get their previous session
 * back instead — the seeder leaves them alone.
 *
 * ─── Why we go through tabController.add() ──────────────────────────────
 *
 * We could shortcut this by hand-constructing tab models and customer
 * controllers, push them into the tabs array, render. We deliberately
 * don't. Routing through tabController.add() means the demo runs the SAME
 * code path a real user clicking "Add Customer" runs:
 *
 *   - Real 24h backfill via the synthetic HTTPController
 *   - Real ingestEvents() into the customer's eventHistory buffer
 *   - Real updateCustomerStatus() polling the synthetic getLatestEntry
 *   - Real encrypted save through the crypto controller
 *   - Real view re-renders, real table sort, real header update
 *
 * Watching the dashboard populate over a few seconds isn't a bug — it IS
 * the demo. A visitor sees the system working from the very first frame.
 *
 * ─── Scenario shape ──────────────────────────────────────────────────────
 *
 * The seeder is the only place that decides which registry usernames go
 * into which tabs. The HTTP controller and registry are scenario-agnostic;
 * change scenarios here without touching either of them.
 *
 *   "Network"  — backbone-grade business customers + the centerpiece
 *                "currently-down" customer that drives the alert demo.
 *                Active tab on load (most interesting visually).
 *
 *   "Customers" — typical residential mix; mostly stable, a couple flaky,
 *                 plus the just-reconnected and recently-replaced flavors.
 *
 *   "Watchlist" — the troubled customers a tech would actively monitor.
 */

class NeonovaDemoSeeder {

    /**
     * Scenario definition. Order within each tab matters for friendlyName
     * but not much else — tabController.rebuildTable sorts disconnected
     * customers to the top regardless.
     */
    static #SCENARIO = [
        {
            label: 'Network',
            active: true,
            usernames: [
                'chodges.mtwash',          // currently-down — alert centerpiece
                'pacific.st.node.04',
                'bentleyville.tower.7',
                'macgregor.relay',
                'denverton.school.modem'
            ]
        },
        {
            label: 'Customers',
            active: false,
            usernames: [
                'mthompson',
                'akravchenko',
                'dpatel0421',
                'swilliams88',
                'rgarcia2401',
                'dchen.voip',
                'jburke7621',              // flaky
                'pmoreno1167',             // just-reconnected
                'klindstrom.42'            // recently-installed
            ]
        },
        {
            label: 'Watchlist',
            active: false,
            usernames: [
                'twatkins.rural',          // worst-case flaky
                'emcfadden',
                'lhanson.pgh',
                'bnguyen419'
            ]
        }
    ];

    /**
     * Should the seeder run? Returns false if any tab already has
     * customers — implying a returning visitor's saved state was loaded.
     *
     * Has to be called AFTER dashboardController.create() resolves; before
     * that, tabController.tabs hasn't been populated from localStorage yet.
     */
    static shouldSeed(dashboardController) {
        const tabs = dashboardController.getTabController().tabs;
        if (!tabs || tabs.length === 0) return true;
        return tabs.every(tab => !tab.customers || tab.customers.length === 0);
    }

    /**
     * Run the seed. Idempotency check is the caller's responsibility —
     * use shouldSeed() first.
     *
     * Steps:
     *   1. Create non-default tabs in scenario order. (The default "All" tab
     *      created by initDefaultTab gets renamed to the first scenario tab
     *      so we don't end up with an empty leftover.)
     *   2. Switch into each tab in turn and add() its customers.
     *   3. Switch to whichever tab the scenario marked active.
     *
     * Each add() awaits the synthetic 24h backfill + initial poll. We run
     * sequentially rather than in parallel so the dashboard populates in a
     * predictable, watchable order rather than all rows showing up at once.
     */
    static async seed(dashboardController) {
        const tabController = dashboardController.getTabController();

        // Step 1 — set up tabs.
        // initDefaultTab created an "All" tab. Rename it to scenario[0].label,
        // then add the rest as new tabs.
        const firstTab = tabController.tabs[0];
        if (firstTab && firstTab.label !== this.#SCENARIO[0].label) {
            await tabController.renameTab(firstTab.label, this.#SCENARIO[0].label);
        }

        for (let i = 1; i < this.#SCENARIO.length; i++) {
            await tabController.addTab(this.#SCENARIO[i].label);
        }

        // Step 2 — populate each tab.
        // switchTab before adding so add() lands customers in the right tab
        // (tabController.add operates on the active tab).
        for (const tabSpec of this.#SCENARIO) {
            await tabController.switchTab(tabSpec.label);

            for (const username of tabSpec.usernames) {
                const profile = NeonovaProfileRegistry.get(username);
                if (!profile) {
                    console.warn(`[seeder] Unknown username "${username}" in scenario; skipping.`);
                    continue;
                }
                try {
                    await tabController.add(username, profile.friendlyName);
                } catch (err) {
                    // Individual failures are non-fatal — log and continue
                    // so one bad customer doesn't kill the whole seed.
                    console.error(`[seeder] add("${username}") failed:`, err);
                }
            }
        }

        // Step 3 — restore the scenario's active tab.
        const activeTab = this.#SCENARIO.find(t => t.active);
        if (activeTab) {
            await tabController.switchTab(activeTab.label);
        }
    }
}
