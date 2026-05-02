class NeonovaAdminModel {
    constructor(name, phoneNumber = '') {
        this.name = (name || '').trim();
        this.phoneNumber = NeonovaAdminModel.#normalizeDigits(phoneNumber);
    }

    static #normalizeDigits(input) {
        const digits = (input || '').toString().replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
            return digits.slice(1);
        }
        return digits.slice(0, 10);
    }

    isValid() {
        return this.name.length > 0 && this.phoneNumber.length === 10;
    }

    update({ name, phoneNumber }) {
        if (typeof name === 'string') this.name = name.trim();
        if (typeof phoneNumber === 'string') {
            this.phoneNumber = NeonovaAdminModel.#normalizeDigits(phoneNumber);
        }
    }

    toJSON() {
        return {
            name: this.name,
            phoneNumber: this.phoneNumber
        };
    }

    static fromJSON(json) {
        return new NeonovaAdminModel(
            json.name,
            json.phoneNumber || ''
        );
    }
}
