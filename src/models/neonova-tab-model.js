class NeonovaTabModel {
    constructor(label, isActive = false, isNetworkTab = false, manualOrder = false, sortColumn = null, sortDirection = null) {
        this.label = label;
        this.isActive = isActive;
        this.isNetworkTab = isNetworkTab;
        this.manualOrder = manualOrder;
        this.sortColumn = sortColumn;
        this.sortDirection = sortDirection;
        this.customers = [];
    }

    addCustomer(customerController) {
        if (!this.customers.find(c => c.radiusUsername === customerController.radiusUsername)) {
            this.customers.push(customerController);
        }
    }

    removeCustomer(radiusUsername) {
        this.customers = this.customers.filter(c => c.radiusUsername !== radiusUsername);
    }

    setCustomerOrder(orderedCustomers) {
        if (!Array.isArray(orderedCustomers)) return;
        if (orderedCustomers.length !== this.customers.length) return;
        this.customers = orderedCustomers;
    }

    rename(newLabel) {
        this.label = newLabel;
    }

    getConnectionCounts() {
        let connected = 0, disconnected = 0;
        for (const c of this.customers) {
            const s = c.model?.status;
            if (s === 'Connected') connected++;
            else if (s === 'Disconnected') disconnected++;
        }
        return { connected, disconnected };
    }

    toJSON() {
        return {
            label: this.label,
            isActive: this.isActive,
            isNetworkTab: this.isNetworkTab,
            manualOrder: this.manualOrder,
            sortColumn: this.sortColumn,
            sortDirection: this.sortDirection,
            customers: this.customers.map(c => c.model.toJSON())
        };
    }

    static fromJSON(json, dashboardController) {
        const tab = new NeonovaTabModel(
            json.label,
            json.isActive,
            json.isNetworkTab === true,
            json.manualOrder === true,
            json.sortColumn ?? null,
            json.sortDirection ?? null
        );
        tab.customers = json.customers.map(c => {
            const model = NeonovaCustomerModel.fromJSON(c);
            return new NeonovaCustomerController(dashboardController, null, null, model);
        });
        return tab;
    }
}
