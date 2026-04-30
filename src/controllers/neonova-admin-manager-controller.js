class NeonovaAdminManagerController {
    constructor(dashboardController) {
        this.dashboardController = dashboardController;
        this.model = new NeonovaAdminManagerModel();
        this.view = new NeonovaAdminManagerView(this);

        // Hydrate runtime admin controllers from the canonical plain-data list
        const adminsData = this.dashboardController.model.getAdminsArray();
        for (const data of adminsData) {
            try {
                const ctrl = NeonovaAdminController.fromJSON(data, this.dashboardController);
                this.model.addAdmin(ctrl);
            } catch (e) {
                console.warn('[NeonovaAdminManagerController] failed to hydrate admin:', data, e);
            }
        }
    }

    async show() {
        await this.view.show();
    }

    hide() {
        this.view.hide();
    }

    getAdminControllers() {
        return [...this.model.admins];
    }
    
    async add(name, phoneNumber) {
        const trimmedName = (name || '').trim();
        const digits = (phoneNumber || '').replace(/\D/g, '').slice(0, 10);
        if (!trimmedName || digits.length !== 10) return false;
        if (this.model.findAdmin(trimmedName)) return false;

        const ctrl = new NeonovaAdminController(trimmedName, digits, this.dashboardController);
        this.model.addAdmin(ctrl);

        await this.dashboardController.getTabController().save();
        this.view.renderList();
        return true;
    }

    async remove(name) {
        this.model.removeAdmin(name);
        await this.dashboardController.getTabController().save();
        this.view.renderList();
    }
}
