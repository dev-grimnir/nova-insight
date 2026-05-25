class NeonovaAdminManagerController {
    constructor() {
        this.model = new NeonovaAdminManagerModel();
        this.view = new NeonovaAdminManagerView(this);
    }

    getAdminControllers() {
        return [...this.model.admins];
    }

    async load() {
        const blob = localStorage.getItem('novaDashboardAdmins');
        if (!blob) return;
        try {
            const json = JSON.parse(await NeonovaCryptoController.decryptData(blob));
            if (Array.isArray(json.admins)) {
                this.model.admins = json.admins.map(a => {
                    const model = NeonovaAdminModel.fromJSON(a);
                    return new NeonovaAdminController(this, null, null, model);
                });
            }
        } catch (e) {
            console.error('[NeonovaAdminManagerController.load]', e);
        }
    }

    async save() {
        try {
            const json = JSON.stringify({
                admins: this.model.admins.map(a => a.model.toJSON())
            });
            const encrypted = await NeonovaCryptoController.encryptData(json);
            localStorage.setItem('novaDashboardAdmins', encrypted);
        } catch (e) {
            console.error('[NeonovaAdminManagerController.save]', e);
        }
    }

    async add(name, phoneNumber) {
        const trimmedName = (name || '').trim();
        const digits = (phoneNumber || '').replace(/\D/g, '').slice(0, 10);
        if (!trimmedName || digits.length !== 10) return false;
        if (this.model.findAdmin(trimmedName)) return false;
        const ctrl = new NeonovaAdminController(this, trimmedName, digits);
        this.model.addAdmin(ctrl);
        await this.save();
        this.view.renderList();
        return true;
    }

    async remove(name) {
        this.model.removeAdmin(name);
        await this.save();
    }

    async show() {
        await this.load();
        await this.view.show();
    }
}
