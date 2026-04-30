class NeonovaAdminController {
    #model;

    constructor(name, phoneNumber, manager) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error('Admin name must be a non-empty string');
        }
        this.manager = manager;
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

    static fromJSON(json, manager) {
        return new NeonovaAdminController(
            json.name,
            json.phoneNumber || '',
            manager
        );
    }

    async remove() {
        await this.manager.remove(this.name);

        const row = this.view.getElement();
        row?.parentNode?.removeChild(row);
    }

    async updateName(newName) {
        const trimmed = (newName || '').trim();
        if (trimmed === '' || trimmed === this.#model.name) return false;

        if (this.manager.model.findAdmin(trimmed)) return false;

        this.#model.update({ name: trimmed });
        await this.manager.save();
        this.view.update();
        return true;
    }

    async updatePhoneNumber(newPhoneNumber) {
        const digits = NeonovaAdminManagerView.extractDigits(newPhoneNumber);
        if (digits.length !== 10 || digits === this.#model.phoneNumber) return false;

        this.#model.update({ phoneNumber: digits });
        await this.manager.save();
        this.view.update();
        return true;
    }

    getRowElement() {
        return this.view.getElement();
    }
}
