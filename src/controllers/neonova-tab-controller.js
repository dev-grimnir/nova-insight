class NeonovaTabController {
    static DOWN_THRESHOLD_MS = 5 * 60 * 1000;
    constructor(dashboardController) {
        this.dashboardController = dashboardController;
        this.tabs = [];
        this.dragInProgress = false;
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
        if (this.dragInProgress) return;
    
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
    
        const ordered = this.#getDisplayOrder(activeTab);
        const rows = [];
        for (const ctrl of ordered) {
            ctrl.view.update();
            const row = ctrl.getRowElement();
            if (row instanceof HTMLElement) rows.push(row);
        }
    
        this.view.setRows(rows);
        this.dashboardController.view.renderTabBar();
        this.dashboardController.view.renderTableHeader();
    }

    #getDisplayOrder(tab) {
        if (tab.manualOrder) {
            return [...tab.customers];
        }
    
        return [...tab.customers].sort((a, b) => {
            const aStatus = a.model?.status || '';
            const bStatus = b.model?.status || '';
    
            const aDisconnected = aStatus !== 'Connected' && aStatus !== 'Connecting...';
            const bDisconnected = bStatus !== 'Connected' && bStatus !== 'Connecting...';
    
            if (aDisconnected !== bDisconnected) {
                return aDisconnected ? -1 : 1;
            }
    
            if (!aDisconnected) {
                return (a.model?.durationSec || 0) - (b.model?.durationSec || 0);
            }
    
            return 0;
        });
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
                NeonovaToast.error('Customer not found in RADIUS ' + trimmed);
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
    /*
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
    */    
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

    // ====================== DRAG-AND-DROP ======================
    beginDrag() {
        this.dragInProgress = true;
    }

    // Called from the view's dragend. Drop handlers (reorderCustomer,
    // moveCustomerToTab) clear the flag themselves, so this mostly handles
    // the abort case (drag started but no drop fired).
    endDrag() {
        if (!this.dragInProgress) return;
        this.dragInProgress = false;
        this.dashboardController.view.renderTabBar();
    }

    // Within-tab reorder. Indices are in display space (what the user sees).
    async reorderCustomer(fromDisplayIdx, toDisplayIdx) {
        this.dragInProgress = false;
    
        const tab = this.getActiveTab();
        if (!tab) return;
        if (fromDisplayIdx === toDisplayIdx) return;
    
        const order = this.#getDisplayOrder(tab);
        if (fromDisplayIdx < 0 || fromDisplayIdx >= order.length) return;
        if (toDisplayIdx < 0 || toDisplayIdx > order.length) return;
    
        const [moved] = order.splice(fromDisplayIdx, 1);
        const insertAt = toDisplayIdx > fromDisplayIdx ? toDisplayIdx - 1 : toDisplayIdx;
        order.splice(insertAt, 0, moved);
    
        tab.setCustomerOrder(order);
        tab.manualOrder = true;
        tab.sortColumn = null;
        tab.sortDirection = null;
    
        await this.save();
        this.rebuildTable();
    }

    // Cross-tab move. Customer goes to the END of the destination tab's
    // customers array. Mode on either tab is unchanged.
    async moveCustomerToTab(radiusUsername, targetLabel) {
        this.dragInProgress = false;
    
        const sourceTab = this.getActiveTab();
        if (!sourceTab) return;
    
        const targetTab = this.tabs.find(t => t.label === targetLabel);
        if (!targetTab) return;
        if (sourceTab === targetTab) return;
    
        const ctrl = sourceTab.customers.find(c => c.radiusUsername === radiusUsername);
        if (!ctrl) return;
    
        // Duplicate check — target tab can't already have this customer
        if (targetTab.customers.some(c => c.radiusUsername === radiusUsername)) {
            const label = ctrl.friendlyName || ctrl.radiusUsername;
            NeonovaToast.error(`"${label}" is already in "${targetLabel}"`);
            return;
        }
    
        sourceTab.removeCustomer(radiusUsername);
        targetTab.addCustomer(ctrl);
    
        await this.save();
        this.rebuildTable();
    }

    // Toggle a tab's sort mode. Freezes current display order on auto→manual
    // so rows don't snap on the transition.
    async toggleTabMode(label) {
        const tab = this.tabs.find(t => t.label === label);
        if (!tab) return;
    
        if (tab.manualOrder) {
            tab.manualOrder = false;
        } else {
            const sortedOrder = this.#getDisplayOrder(tab);
            tab.setCustomerOrder(sortedOrder);
            tab.manualOrder = true;
        }
    
        tab.sortColumn = null;
        tab.sortDirection = null;
    
        await this.save();
        this.rebuildTable();
    
    }

    // Sort the tab's customers by a column, toggling direction if same column,
    // or starting at ascending if a new column. Writes through to manual mode.
    async sortByColumn(label, columnKey) {
        const tab = this.tabs.find(t => t.label === label);
        if (!tab) return;

        const direction = (tab.sortColumn === columnKey && tab.sortDirection === 'asc')
            ? 'desc'
            : 'asc';

        const sorted = [...tab.customers].sort(this.#getColumnComparator(columnKey, direction));

        tab.setCustomerOrder(sorted);
        tab.manualOrder = true;
        tab.sortColumn = columnKey;
        tab.sortDirection = direction;

        await this.save();
        this.rebuildTable();
    }

    #getColumnComparator(columnKey, direction) {
        const flip = direction === 'desc' ? -1 : 1;

        switch (columnKey) {
            case 'friendlyName':
                return (a, b) => {
                    const aName = a.model?.friendlyName || a.model?.radiusUsername || '';
                    const bName = b.model?.friendlyName || b.model?.radiusUsername || '';
                    return aName.localeCompare(bName) * flip;
                };

            case 'radiusUser':
                return (a, b) => {
                    const aName = a.model?.radiusUsername || '';
                    const bName = b.model?.radiusUsername || '';
                    return aName.localeCompare(bName) * flip;
                };

            case 'status':
                return (a, b) => {
                    const aStatus = a.model?.status || '';
                    const bStatus = b.model?.status || '';
                    const aDisconnected = aStatus !== 'Connected' && aStatus !== 'Connecting...';
                    const bDisconnected = bStatus !== 'Connected' && bStatus !== 'Connecting...';

                    if (aDisconnected !== bDisconnected) {
                        return (aDisconnected ? 1 : -1) * flip;
                    }
                    return (a.model?.durationSec || 0) - (b.model?.durationSec || 0);
                };

            case 'duration':
                return (a, b) => {
                    const aDur = a.model?.durationSec || 0;
                    const bDur = b.model?.durationSec || 0;
                    return (aDur - bDur) * flip;
                };

            default:
                return () => 0;
        }
    }
}
