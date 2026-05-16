/**
 * @file demo/neonova-demo-bootstrap.js
 *
 * Demo entry point. Mirrors the production userscript bootstrap exactly:
 *
 *     await NeonovaDashboardController.create();
 *
 * That single line drives passphrase entry, settings load, tab restore,
 * and the first poll. After it resolves, we run the seeder if there's
 * no existing scenario state.
 *
 * Loaded LAST in index.html — every class it references (production and
 * demo) must already be defined by the time this file executes.
 */

(async () => {
    let dashboardController;
    try {
        dashboardController = await NeonovaDashboardController.create();
    } catch (err) {
        console.error('[demo-bootstrap] Dashboard creation failed:', err);
        return;
    }

    // Returning visitors with valid saved state get their session back —
    // shouldSeed() returns false when any tab already has customers.
    if (NeonovaDemoSeeder.shouldSeed(dashboardController)) {
        try {
            await NeonovaDemoSeeder.seed(dashboardController);
        } catch (err) {
            console.error('[demo-bootstrap] Seeding failed:', err);
        }
    }
})();
