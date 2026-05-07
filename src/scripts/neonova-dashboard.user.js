// ==UserScript==
// @name         NovaSubscriber - Dashboard
// @namespace    http://tampermonkey.net/
// @version      44.27
// @description  Real-time customer modem connection dashboard (separate script)
// @author       dev-grimnir
// @match        https://admin.neonova.net/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/scripts/neonova-dashboard.user.js
// @downloadURL  https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/scripts/neonova-dashboard.user.js
// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/core/utils.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/core/neonova-toast.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-admin-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/log-entry.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-customer-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-admin-manager-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-dashboard-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-tab-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-report-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/models/neonova-snapshot-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-admin-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-admin-manager-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-crypto-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-http-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-progress-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-collector.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-analyzer.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-passphrase-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-customer-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-report-order-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-report-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-snapshot-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-tab-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-add-customer-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-dashboard-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/controllers/neonova-notifier-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/base-neonova-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-base-modal-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-admin-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-admin-manager-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-inline-snapshot-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-spinner-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-passphrase-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-customer-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-tab-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-snapshot-chart.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-snapshot-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-report-snapshot-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-report-order-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-progress-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-report-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-add-customer-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/neonova-insight/dev/src/views/neonova-dashboard-view.js
// ==/UserScript==

(function() {
    'use strict';

    
    // Only run in the MAIN content frame
    if (window.name !== 'MAIN') {
        return;
    }

    (async () => {
        const dashboardController = await NeonovaDashboardController.create();
    })();
})();

