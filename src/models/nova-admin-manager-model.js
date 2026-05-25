class NovaAdminManagerModel {
    constructor() {
        this.admins = []; // array of NovaAdminController
    }

    addAdmin(adminController) {
        if (!this.admins.find(a => a.name === adminController.name)) {
            this.admins.push(adminController);
        }
    }

    removeAdmin(name) {
        this.admins = this.admins.filter(a => a.name !== name);
    }

    findAdmin(name) {
        return this.admins.find(a => a.name === name);
    }

    toJSON() {
        return this.admins.map(a => a.toJSON());
    }
}
