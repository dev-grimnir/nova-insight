class NovaDashboardModel {
    constructor() {
        this.customers = [];  // Array of plain objects: { radiusUsername, friendlyName?, status, durationSec, lastEventTime?, ... }
        this.pollingIntervalMinutes = 1;
        this.isPollingPaused = false;
        this.lastUpdate = null;
        this.lastUpdatedDisplay = '--';
        // Single encrypted settings blob (privacy + polling + future settings)
        this.settings = {
            privacyEnabled: false,
            pollingIntervalMinutes: 1,
            pollingPaused: false
        };
    }

    // ─── Basic accessors ─────────────────────────────────────────────

    getCustomer(username) {
        return this.customers.find(c => c.radiusUsername === username);
    }

    addOrUpdateCustomer(customerData) {
        const idx = this.customers.findIndex(c => c.radiusUsername === customerData.radiusUsername);
        if (idx >= 0) {
            this.customers[idx] = { ...this.customers[idx], ...customerData };
        } else {
            this.customers.push(customerData);
        }
    }

    removeCustomer(username) {
        this.customers = this.customers.filter(c => c.radiusUsername !== username);
    }

    getCustomersArray() {
        return [...this.customers];
    }

    // Polling settings
    async setPollingInterval(minutes) {
        const safe = Math.max(1, Math.min(60, Number(minutes)));
        this.pollingIntervalMinutes = safe;
        this.settings.pollingIntervalMinutes = safe;
        await this.saveSettings();
    }

    async togglePolling() {
        this.isPollingPaused = !this.isPollingPaused;
        this.settings.pollingPaused = this.isPollingPaused;
        await this.saveSettings(); 
    }

    // Optional: simple computed / status
    get isPollingActive() {
        return !this.isPollingPaused;
    }

    get lastUpdateFormatted() {
        return this.lastUpdate ? this.lastUpdate.toLocaleTimeString() : 'Never';
    }

    toJSON() {
        return {
            customers: this.customers,
            pollingIntervalMinutes: this.pollingIntervalMinutes,
            isPollingPaused: this.isPollingPaused,
            lastUpdate: this.lastUpdate?.toISOString(),
            lastUpdatedDisplay: this.lastUpdatedDisplay
        };
    }

    // ====================== ENCRYPTED SETTINGS BLOB ======================
    async loadSettings() {
        const encrypted = localStorage.getItem('novaDashboardSettings');
        
        if (!encrypted) {
            // === ONE-TIME MIGRATION FROM OLD KEYS ===
            const oldPrivacy = localStorage.getItem('nova-privacy-enabled');
            const oldInterval = localStorage.getItem('novaPollingIntervalMinutes');
            const oldPaused = localStorage.getItem('novaPollingPaused');

            if (oldPrivacy !== null) this.settings.privacyEnabled = oldPrivacy === 'true';
            if (oldInterval !== null) this.settings.pollingIntervalMinutes = parseInt(oldInterval, 10) || 1;
            if (oldPaused !== null) this.settings.pollingPaused = oldPaused === 'true';

            // Clean up every leftover raw key
            localStorage.removeItem('nova-privacy-enabled');
            localStorage.removeItem('novaPollingIntervalMinutes');
            localStorage.removeItem('novaPollingPaused');
            localStorage.removeItem('novaPrivacyMode');
            localStorage.removeItem('isDisplayFormSubmitted');

            await this.saveSettings();
            return;
        }

        try {
            const jsonStr = await NovaCryptoController.decryptData(encrypted);
            const parsed = JSON.parse(jsonStr);
            this.settings = { ...this.settings, ...parsed };
        } catch (e) {
            console.warn("[Settings] Decryption failed — using defaults");
            await this.saveSettings();
        }

        // Keep the existing top-level properties in sync
        this.pollingIntervalMinutes = this.settings.pollingIntervalMinutes;
        this.isPollingPaused = this.settings.pollingPaused;
        
    }

    async saveSettings() {
        try {
            const jsonStr = JSON.stringify(this.settings);
            const encrypted = await NovaCryptoController.encryptData(jsonStr);
            localStorage.setItem('novaDashboardSettings', encrypted);
        } catch (e) {
            console.error("[Settings] Encryption failed", e);
        }
    }
}
