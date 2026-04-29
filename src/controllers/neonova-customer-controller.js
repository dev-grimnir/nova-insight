// src/controllers/neonova-customer-controller.js

class NeonovaCustomerController {
    #model;  
    constructor(radiusUsername, friendlyName = null, dashboardController, initialState = null) {
        if (typeof radiusUsername !== 'string' || !radiusUsername.trim()) {
            throw new Error('radiusUsername must be a non-empty string');
        }
        this.dashboardController = dashboardController;
        this.#model = new NeonovaCustomerModel(radiusUsername.trim(), friendlyName, initialState);
        this.view = new NeonovaCustomerView(this);
    }

    // Main getter for the customer model (use this everywhere)
    get model() {
        return this.#model;
    }

    // Convenience getters (optional but useful)
    get radiusUsername() {
        return this.#model.radiusUsername;
    }

    get friendlyName() {
        return this.#model.friendlyName;
    }

    async toggleAlertsSuppressed() {
        this.#model.alertsSuppressed = !this.#model.alertsSuppressed;
        await this.dashboardController.getTabController().save();
        this.view.update();
    }

    toJSON() {
        // Delegate to the model so buffer + any future fields come along automatically
        return this.#model.toJSON();
    }
    
    static fromJSON(json, dashboardController) {
        return new NeonovaCustomerController(
            json.radiusUsername,
            json.friendlyName,
            dashboardController,
            {
                alertsSuppressed: json.alertsSuppressed,
                status: json.status || 'Connecting...',
                durationSec: json.durationSec ?? 0,
                lastUpdate: json.lastUpdate,
                lastEventTime: json.lastEventTime,
                eventHistory: json.eventHistory
            }
        );
    }

    // Called by dashboard controller during polling
    updateFromPoll() {
        // Model was already updated externally (in updateCustomerStatus)
        // If you ever want to trigger view update here, do it:
        // this.view.update();
    }

    async remove() {
        await this.dashboardController.getTabController().remove(this.radiusUsername);
    }

    launchReport() {
        const username = this.#model.radiusUsername;
        const friendlyName = this.#model.friendlyName || username; 
        console.log('[launchReport] Starting for:', username, friendlyName);
        new NeonovaReportOrderController(username, friendlyName);
    }

    open3DaySnapshot() {
        const username = this.#model.radiusUsername;
        const friendlyName = this.#model.friendlyName || username;

        const endDate = new Date();                    // today
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 3);    // 3 days ago
        startDate.setHours(0, 0, 0, 0);

        console.log(`[Snapshot] Opening 3-day view for ${username}`);

        new NeonovaSnapshotController(username, friendlyName, startDate, endDate);
    }

    async updateFriendlyName(newName) {
        const trimmed = newName.trim();
        if (trimmed === '') {
            return false;
        }
        this.#model.friendlyName = trimmed;

        this.dashboardController.model.addOrUpdateCustomer({
            radiusUsername: this.radiusUsername,
            friendlyName: trimmed
        });
        
        await this.dashboardController.getTabController().save();
        this.view.update();  // refresh row to show new name
        return true;
    }

    // Expose the row for dashboard controller to collect
    getRowElement() {
        return this.view.getElement();
    }
}
