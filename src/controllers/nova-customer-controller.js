class NovaCustomerController {
    constructor(dashboardController, radiusUsername = null, friendlyName = null, model = null) {
        this.dashboardController = dashboardController;
        this.model = model || new NovaCustomerModel(
            (radiusUsername || '').trim(),
            friendlyName
        );
        this.view = new NovaCustomerView(this);
    }

    get radiusUsername() {
        return this.model.radiusUsername;
    }

    get friendlyName() {
        return this.model.friendlyName;
    }

    updateFromPoll() { /* no-op */ }

    async remove() {
        await this.dashboardController.getTabController().remove(this.radiusUsername);
    }

    launchReport() {
        const username = this.model.radiusUsername;
        const friendlyName = this.model.friendlyName || username;
        new NovaReportOrderController(username, friendlyName);
    }

    open24HourSnapshot() {
        const username = this.model.radiusUsername;
        const friendlyName = this.model.friendlyName || username;
    
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
        new NovaSnapshotController(username, friendlyName, startDate, endDate);
    }

    open3DaySnapshot() {
        const username = this.model.radiusUsername;
        const friendlyName = this.model.friendlyName || username;

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 3);
        startDate.setHours(0, 0, 0, 0);

        new NovaSnapshotController(username, friendlyName, startDate, endDate);
    }

    async updateFriendlyName(newName) {
        const trimmed = newName.trim();
        if (trimmed === '') return false;
        this.model.friendlyName = trimmed;

        this.dashboardController.model.addOrUpdateCustomer({
            radiusUsername: this.radiusUsername,
            friendlyName: trimmed
        });

        await this.dashboardController.getTabController().save();
        this.view.update();
        return true;
    }

    async toggleAlertsSuppressed() {
        this.model.toggleAlertsSuppressed();
        await this.dashboardController.getTabController().save();
        this.view.update();
    }

    getRowElement() {
        return this.view.getElement();
    }
}
