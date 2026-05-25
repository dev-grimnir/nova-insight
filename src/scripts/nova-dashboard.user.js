// ==UserScript==
// @name         NovaSubscriber - Dashboard
// @namespace    http://tampermonkey.net/
// @version      46.4
// @description  Real-time customer modem connection dashboard (separate script)
// @author       dev-grimnir
// @match        https://admin.neonova.net/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/dev-grimnir/nova-insight/demo/src/scripts/nova-dashboard.user.js
// @downloadURL  https://raw.githubusercontent.com/dev-grimnir/nova-insight/demo/src/scripts/nova-dashboard.user.js
// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/core/utils.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/core/nova-toast.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-admin-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/log-entry.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-customer-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-admin-manager-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-dashboard-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-tab-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-report-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/models/nova-snapshot-model.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-admin-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-admin-manager-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-crypto-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-http-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-progress-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-collector.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-analyzer.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-passphrase-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-customer-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-report-order-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-report-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-snapshot-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-tab-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-add-customer-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-dashboard-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/controllers/nova-notifier-controller.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/base-nova-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-base-modal-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-admin-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-admin-manager-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-inline-snapshot-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-spinner-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-passphrase-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-customer-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-tab-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-snapshot-chart.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-snapshot-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-report-snapshot-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-report-order-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-progress-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-report-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-add-customer-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-dashboard-view.js
// @require      https://raw.githubusercontent.com/dev-grimnir/nova-insight/dev/src/views/nova-snapshot-panel-view.js
// ==/UserScript==

(function() {
    'use strict';

    
    // Only run in the MAIN content frame
    if (window.name !== 'MAIN') {
        return;
    }

    (async () => {
        const dashboardController = await NovaDashboardController.create();
    })();
})();

