class NeonovaTabModel {
    constructor(label, isActive = false, isNetworkTab = false) {
        this.label = label;
        this.isActive = isActive;
        this.isNetworkTab = isNetworkTab;
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
            customers: this.customers.map(c => c.toJSON())
        };
    }

    static fromJSON(json, dashboardController) {
        const tab = new NeonovaTabModel(json.label, json.isActive, json.isNetworkTab === true);
        tab.customers = json.customers.map(c => NeonovaCustomerController.fromJSON(c, dashboardController));
        return tab;
    }
}
