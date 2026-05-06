class NeonovaTabController {
    static DOWN_THRESHOLD_MS = 5 * 60 * 1000;
    constructor(dashboardController) {
        this.dashboardController = dashboardController;
        this.tabs = [];
    }

    async reorderTab(fromIdx, toIdx) {
        if (fromIdx < 0 || toIdx < 0) return;
        if (fromIdx >= this.tabs.length || toIdx >= this.tabs.length) return;
        if (fromIdx === toIdx) return;
        const [moved] = this.tabs.splice(fromIdx, 1);
        this.tabs.splice(toIdx, 0, moved);
        await this.save();
        this.dashboardController.view.renderTabBar();
    }

    //methods from dashboard controller
    createCustomerController(customer) {
        const ctrl = new NeonovaCustomerController(this.dashboardController, trimmed, friendlyName);
        this.addCustomerToActiveTab(ctrl);
        return ctrl;
    }
    
    getCustomerController(username) {
        return this.getActiveTab().customers.find(c => c.radiusUsername === username) || null;
    }
    
    rebuildTable() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        
        const rows = [];
        for (const ctrl of this.getActiveTab().customers) {
            ctrl.view.update();
            const row = ctrl.getRowElement();
            if (row) rows.push(row);
        }
    
        rows.sort((a, b) => {
            const aStatus = a.querySelector('td:nth-child(3)')?.textContent.trim() || '';
            const bStatus = b.querySelector('td:nth-child(3)')?.textContent.trim() || '';
    
            const aDisconnected = aStatus !== 'Connected' && aStatus !== 'Connecting...';
            const bDisconnected = bStatus !== 'Connected' && bStatus !== 'Connecting...';
    
            if (aDisconnected !== bDisconnected) {
                return aDisconnected ? -1 : 1;
            }
    
            if (!aDisconnected) {
                const aDurationCell = a.querySelector('td:nth-child(4)')?.textContent.trim() || '';
                const bDurationCell = b.querySelector('td:nth-child(4)')?.textContent.trim() || '';
                const aSeconds = this.#parseDurationToSeconds(aDurationCell) || 0;
                const bSeconds = this.#parseDurationToSeconds(bDurationCell) || 0;
                return aSeconds - bSeconds;
            }
    
            return 0;
        });
    
        this.view.setRows(rows);
        this.dashboardController.view.renderTabBar();
    }
    
    async add(radiusUsername, friendlyName) {
        if (!radiusUsername?.trim()) return;
        const trimmed = radiusUsername.trim();
    
        const activeTab = this.getActiveTab();
        if (activeTab.customers.find(c => c.radiusUsername === trimmed)) {
            NeonovaToast.error("This customer has already beeen added to this tab.");
            return;
        }
    
        const ctrl = new NeonovaCustomerController(this.dashboardController, trimmed, friendlyName);
        this.addCustomerToActiveTab(ctrl);
    
        this.rebuildTable();
        this.dashboardController.view.updateHeader();

        // Best-effort 24h backfill for the event buffer. Failures are silent —
        // the poll will build up history from here regardless.
        try {
            const since = new Date(Date.now() - NeonovaCustomerModel.RETENTION_MS);
            const events = await NeonovaHTTPController.paginateReportLogs(
                trimmed, since, new Date(), 0, 0, 23, 59
            );
            if (Array.isArray(events)) ctrl.model.ingestEvents(events);
        } catch (err) {
            console.warn('[tabController.add] backfill failed (non-fatal):', err);
        }
        
        try {
            await this.dashboardController.updateCustomerStatus(ctrl.model);

            if (ctrl.model.status === 'Account Not Found') {
                this.remove(trimmed);
                NeonovaToast.error('Customer not found in RADIUS');
                return;
            }
            
            ctrl.view.update();
            await this.save();
            this.rebuildTable();
        } catch (err) {
            console.error('Initial poll failed:', err);
            ctrl.model.status = 'Error';
            ctrl.view.update();
        }
    }
    
    async remove(radiusUsername) {
        const activeTab = this.getActiveTab();
        this.removeCustomerFromTab(radiusUsername, activeTab.label);
        await this.save();
        this.rebuildTable();
        this.dashboardController.view.updateHeader();
    }

    #parseDurationToSeconds(durationStr) {
        if (!durationStr || durationStr === '—' || durationStr.includes('<1min')) {
            return 30;  // treat <1min as ~30s so very new sessions sort near top
        }
    
        let totalSeconds = 0;
        const parts = durationStr.match(/(\d+)([dhms])/g) || [];
    
        for (const part of parts) {
            const num = parseInt(part, 10);
            const unit = part.slice(-1);
    
            if (unit === 'd') totalSeconds += num * 86400;
            else if (unit === 'h') totalSeconds += num * 3600;
            else if (unit === 'm') totalSeconds += num * 60;
            else if (unit === 's') totalSeconds += num;
        }
    
        return totalSeconds || 0;
    }
        
    //methods for tab controller
    initDefaultTab() {
        const defaultTab = new NeonovaTabModel('All', true);
        this.tabs.push(defaultTab);
        this.view.render();
    }

    getActiveTab() {
        return this.tabs.find(t => t.isActive) || this.tabs[0];
    }

    

    addCustomerToActiveTab(customerController) {
        this.getActiveTab().addCustomer(customerController);
        this.view.render();
    }

    removeCustomerFromTab(radiusUsername, label) {
        const tab = this.tabs.find(t => t.label === label);
        if (tab) tab.removeCustomer(radiusUsername);
        this.view.render();
    }
    
    async addTab(label) {
        const tab = new NeonovaTabModel(label);
        this.tabs.push(tab);
        await this.save();
        this.view.render();
        this.dashboardController.view.renderTabBar();
        return tab;
    }

    async removeTab(label) {
        if (this.tabs.length === 1) return;
        const idx = this.tabs.findIndex(t => t.label === label);
        if (idx === -1) return;
        const wasActive = this.tabs[idx].isActive;
        this.tabs.splice(idx, 1);
        if (wasActive) this.tabs[0].isActive = true;
        await this.save();
        this.view.render();
        this.dashboardController.view.renderTabBar();
    }
    
    async renameTab(oldLabel, newLabel) {
        const tab = this.tabs.find(t => t.label === oldLabel);
        if (tab) tab.rename(newLabel);
        await this.save();
        this.dashboardController.view.renderTabBar();
    }

    async toggleNetworkTab(label) {
        const tab = this.tabs.find(t => t.label === label);
        if (!tab) return;
        tab.isNetworkTab = !tab.isNetworkTab;
        await this.save();
    }
    
    async switchTab(label) {
        this.tabs.forEach(t => t.isActive = t.label === label);
        await this.save();
        this.view.render();
        this.dashboardController.view.renderTabBar();
    }

    async poll() {
        for (const tab of this.tabs) {
            for (const ctrl of tab.customers) {
                try {
                    const prevStatus = ctrl.model.status;
                    await this.dashboardController.updateCustomerStatus(ctrl.model);
                    this.#evaluateAlerting(ctrl.model, tab, prevStatus);
                    ctrl.view.update();
                } catch (err) {
                    console.error(`Poll error for ${ctrl.radiusUsername}:`, err);
                    ctrl.model.update('Error', 0);
                    ctrl.view.update();
                }
            }
        }
        this.view.render();
    }

    /**
     * Decides whether a state change warrants firing the notifier. The notifier
     * itself knows nothing about thresholds, suppression, or tabs — that all
     * lives here.
     *
     *   Connected → Disconnected: stamp disconnectedSince (start the clock)
     *   Disconnected → Connected: if an alert was fired during this down event,
     *                              send a recovery alert; either way, clear timers
     *   Still Disconnected:        if disconnectedSince exists, no alert sent yet,
     *                              and elapsed >= threshold, fire and stamp lastAlertSent
     */
    #evaluateAlerting(customer, tab, prevStatus) {
        if (!tab.isNetworkTab) return;
        if (customer.alertsSuppressed) return;

        // Backfill: a modem already disconnected when the dashboard started
        // (or before this customer was added) has no anchor timestamp. Use
        // the actual disconnect event time so threshold elapsed time is real.
        if (customer.status === 'Disconnected'
            && customer.disconnectedSince === null
            && customer.lastEventTime instanceof Date
            && !isNaN(customer.lastEventTime.getTime())) {
            customer.markDisconnected(customer.lastEventTime.getTime());
        }
        
        const newStatus = customer.status;
        const now = Date.now();
        const nodeName = customer.friendlyName || customer.radiusUsername;

        if (prevStatus === 'Connected' && newStatus === 'Disconnected') {
            if (customer.disconnectedSince === null) {
                customer.markDisconnected(now);
            }
            return;
        }

        if (prevStatus === 'Disconnected' && newStatus === 'Connected') {
            if (customer.lastAlertSent !== null) {
                const reconnectedAt = customer.lastEventTime instanceof Date
                    ? customer.lastEventTime.getTime()
                    : Date.now();
                NeonovaNotifierController.alert('Connected', nodeName, tab.label, reconnectedAt);
            }
            customer.markReconnected();
            return;
        }

        if (newStatus === 'Disconnected'
            && customer.disconnectedSince !== null
            && customer.lastAlertSent === null) {
            if ((now - customer.disconnectedSince) >= NeonovaTabController.DOWN_THRESHOLD_MS) {
                NeonovaNotifierController.alert('Disconnected', nodeName, tab.label, customer.disconnectedSince);
                customer.markAlerted(now);
            }
        }
    }

    async save() {
        try {
            const json = JSON.stringify({
                tabs: this.tabs.map(t => t.toJSON())
            });
            const encrypted = await NeonovaCryptoController.encryptData(json);
            localStorage.setItem('novaDashboardTabs', encrypted);
        } catch (e) {
            console.error('[NeonovaTabController.save]', e);
        }
    }

    async load() {
        const data = localStorage.getItem('novaDashboardTabs');
        if (!data) {
            await this.#migrateFromLegacy();
            return;
        }
        try {
            const json = JSON.parse(await NeonovaCryptoController.decryptData(data));
            this.tabs = json.tabs.map(t => NeonovaTabModel.fromJSON(t, this.dashboardController));
            this.view.render();
        } catch (e) {
            console.error('[NeonovaTabController.load]', e);
            this.initDefaultTab();
        }
    }

    async #migrateFromLegacy() {
        const legacy = localStorage.getItem('novaDashboardCustomers');
        if (!legacy) {
            this.initDefaultTab();
            return;
        }
        try {
            const jsonStr = await NeonovaCryptoController.decryptData(legacy);
            const parsed = JSON.parse(jsonStr);
            const defaultTab = new NeonovaTabModel('Customers', true);
            for (const json of parsed.customers || []) {
                const ctrl = NeonovaCustomerController.fromJSON(json, this.dashboardController);
                defaultTab.addCustomer(ctrl);
            }
            this.tabs.push(defaultTab);
            await this.save();
            this.view.render();
        } catch (e) {
            console.error('[NeonovaTabController.migrateFromLegacy]', e);
            this.initDefaultTab();
        }
    }
}
