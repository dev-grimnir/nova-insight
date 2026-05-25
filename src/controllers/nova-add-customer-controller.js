class NovaAddCustomerController {
    #tabController
    constructor(tabController) {
        this.#tabController = tabController;
        this.view = new NovaAddCustomerView(this);
    }

    show() {
        this.view.show();
    }

    async handleSubmit(radiusUsername, friendlyName) {
        this.view.hideError();  // ← clear any old error
    
        const un = this.#sanitizeAndValidateRadiusUsername(radiusUsername);
        if (!un) return;
        this.view.hide();
        try {
            await this.#tabController.add(un, friendlyName);
        } catch (err) {
            this.view.showError("Failed to add customer: " + err.message);
            return;
        }
    }

    #sanitizeAndValidateRadiusUsername(raw) {
        if (!raw || typeof raw !== 'string') return null;

        let cleaned = raw.trim().replace(/\s+/g, '');

        cleaned = cleaned.replace(/[^a-zA-Z0-9.]/g, '');

        if (cleaned.length < 3 || cleaned.length > 64) {
            this.view.showError("Username must be 3–64 characters.");
            return null;
        }

        if (cleaned.startsWith('.') || cleaned.endsWith('.') || cleaned.includes('..')) {
            this.view.showError("Username cannot start/end with a period or contain consecutive periods.");
            return null;
        }

        if (!/[a-zA-Z]/.test(cleaned)) {
            this.view.showError("Username must contain at least one letter.");
            return null;
        }

        return cleaned.toLowerCase(); // normalize case
    }
}
