class NeonovaAdminController {
    #model;

    constructor(name, phoneNumber, dashboardController) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error('Admin name must be a non-empty string');
        }
        this.dashboardController = dashboardController;
        this.#model = new NeonovaAdminModel(name.trim(), phoneNumber);
        this.view = new NeonovaAdminView(this);
    }

    get model() {
        return this.#model;
    }

    get name() {
        return this.#model.name;
    }

    get phoneNumber() {
        return this.#model.phoneNumber;
    }

    toJSON() {
        return this.#model.toJSON();
    }

    static fromJSON(json, dashboardController) {
        return new NeonovaAdminController(
            json.name,
            json.phoneNumber || '',
            dashboardController
        );
    }

  async remove() {
        const mgr = this.dashboardController.getAdminManagerModel();
        if (!mgr) return;

        mgr.removeAdmin(this.name);
        await this.dashboardController.getTabController().save();

        const row = this.view.getElement();
        row?.parentNode?.removeChild(row);
    }

    async updateName(newName) {
        const trimmed = (newName || '').trim();
        if (trimmed === '' || trimmed === this.#model.name) {
            return false;
        }

        if (this.dashboardController.getAdminManagerModel().findAdmin(trimmed)
            && trimmed !== this.#model.name) {
            return false;
        }

        this.#model.update({ name: trimmed });
        await this.dashboardController.getTabController().save();
        this.view.update();
        return true;
    }

    async updatePhoneNumber(newPhoneNumber) {
        const digits = NeonovaAdminManagerView.extractDigits(newPhoneNumber);
        if (digits.length !== 10 || digits === this.#model.phoneNumber) {
            return false;
        }

        this.#model.update({ phoneNumber: digits });
        await this.dashboardController.getTabController().save();
        this.view.update();
        return true;
    }

    getRowElement() {
        return this.view.getElement();
    }
}
