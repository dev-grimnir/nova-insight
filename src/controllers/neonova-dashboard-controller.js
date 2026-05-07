class NeonovaDashboardController {
    #modalActive;
    #tabController;
    #adminManagerController;
    
    constructor(model, tabController, view) {
        this.model = model;
        this.#tabController = tabController;
        this.view = view;
        this.masterPassphrase = null;
        this.initialized = false;
        this.passphraseController = null;
        this.#modalActive = false;
        this.#adminManagerController = null;
    }

    showAdminManager() {
        if (this.#adminManagerController?.view?.modal) return;
        this.#adminManagerController = new NeonovaAdminManagerController(this);
        this.#adminManagerController.show();
    }

    showAddCustomer() {
        const addController = new NeonovaAddCustomerController(this.#tabController);
        addController.show();
    }
    
    static async create() {
        const model = new NeonovaDashboardModel();
        const controller = new NeonovaDashboardController(model);
        const tabController = new NeonovaTabController(controller);  
        controller.#tabController = tabController;
        const view = new NeonovaDashboardView(controller);  // createElements calls mountTabView here
        controller.view = view;
        await controller.initAsync();
        return controller;
    }

    mountTabView(containerEl) {
        this.#tabController.view = new NeonovaTabView(this.#tabController);
        this.#tabController.view.mount(containerEl);
    }

    getTabController() {
        return this.#tabController;
    }

    isModalActive() {
        return this.#modalActive;
    }

    #attachModalListeners() {
        // Track modal state so dashboard never minimizes while anything is open
        document.addEventListener('neonova:modal-opened', () => {
            this.#modalActive = true;
        });

        document.addEventListener('neonova:modal-closed', () => {
            this.#modalActive = false;
        });
    }

    startPolling() {
        if (this.pollInterval) return;
        this.poll();
        this.pollInterval = setInterval(() => this.poll(), this.model.pollingIntervalMinutes * 60 * 1000);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async setPollingInterval(minutes) {
        minutes = Math.max(1, Math.min(60, parseInt(minutes) || 5));
        this.model.pollingIntervalMinutes = minutes;
        this.pollIntervalMs = this.model.pollingIntervalMinutes * 60 * 1000;
        await this.model.saveSettings();
        
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = setInterval(() => this.poll(), this.model.pollingIntervalMinutes * 60 * 1000);
        }
    }

    /**
     * Toggles the polling state between paused and active.
     * 
     * Behavior:
     *   - Flips the isPollingPaused flag.
     *   - Always clears any existing poll interval.
     *   - If resuming (not paused): Runs an immediate poll, then restarts the scheduled interval.
     *   - Always saves the new paused state to localStorage for persistence across reloads.
     *   - Refreshes the UI to reflect the new state (e.g., update button icons/text).
     * 
     * This ensures consistent state saving (paused or not) — original only saved on resume.
     */
    async togglePolling() {
        // Flip the paused flag
        this.model.isPollingPaused = !this.model.isPollingPaused;

        // Always clear the existing interval to avoid duplicates
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        // If resuming polling (not paused anymore)
        if (!this.model.isPollingPaused) {
            // Run an immediate poll to get fresh data
            this.poll();

            // Restart the scheduled interval
            this.pollInterval = setInterval(() => this.poll(), this.model.pollingIntervalMinutes * 60 * 1000);
        }

        // Always persist the new paused state to localStorage (fix for original inconsistency)
        await this.model.saveSettings();
        
        // Refresh the view to update UI elements (e.g., pause/resume button icon or text)
        this.view?.render();
    }

    /**
     * Main initialization for the dashboard.
     * 
     * Now completely delegates crypto setup to NeonovaCryptoController.
     * No more global masterKey, no more direct calls to old utils functions.
     * 
     * Flow:
     *   1. Init the crypto controller (loads remembered key or prepares for passphrase)
     *   2. If no key yet → show passphrase modal once
     *   3. Load customers (now using decryptData from crypto controller)
     *   4. Start polling and render
     */
    async initAsync() {
        if (this.initialized) return;
        this.initialized = true;
    
        await NeonovaCryptoController.initMasterKey();
    
        if (!NeonovaCryptoController.hasMasterKey) {
            this.passphraseController = new NeonovaPassphraseController(this);
            await this.passphraseController.show();
        }
    
        await this.#tabController.load(); 
        if (this.view) this.view.renderTabBar();
        await this.model.loadSettings();   
    
        // NO MORE this.settings lines — the model already synced polling values
        if (!this.model.isPollingPaused) this.startPolling();
        if (this.view) this.#tabController.rebuildTable();
        this.#attachModalListeners();
    }

    async poll() {
        this.#tabController.poll();
        this.model.lastUpdatedDisplay = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        this.view?.updateHeader();
    }

    isPollingActive() {
        return !this.model.isPollingPaused && !!this.pollInterval;
    }

    async updateCustomerStatus(customer) {
        try {

            // === Buffer update (independent of status-pill logic below) ===
            // Cold-start pulls the full retention window; subsequent polls
            // only fetch events newer than the buffer's tail. Failures are
            // silent — the status-pill path below runs regardless.
            try {
                if (customer.eventHistory.length > 0) {
                    // Steady state — incremental fetch from buffer's tail with 1-min overlap
                    const lastMs = customer.eventHistory[customer.eventHistory.length - 1].dateObj.getTime();
                    const bufferSince = new Date(lastMs - 60 * 1000);
                    const newEvents = await NeonovaHTTPController.paginateReportLogs(
                        customer.radiusUsername, bufferSince, new Date(), 0, 0, 23, 59
                    );
                    if (Array.isArray(newEvents) && newEvents.length > 0) {
                        customer.ingestEvents(newEvents);
                    }
                } else {
                    // Cold start — progressive lookback, same widths as the status-pill path
                    const lookbackPeriods = [
                        1   * 24 * 60 * 60 * 1000,    // 1 day
                        7   * 24 * 60 * 60 * 1000,    // 7 days
                        30  * 24 * 60 * 60 * 1000,    // 30 days
                        90  * 24 * 60 * 60 * 1000,    // 3 months
                        180 * 24 * 60 * 60 * 1000,    // 6 months
                        335 * 24 * 60 * 60 * 1000     // ~11 months
                    ];
            
                    for (const lookbackMs of lookbackPeriods) {
                        const since = new Date(Date.now() - lookbackMs);
                        const events = await NeonovaHTTPController.paginateReportLogs(
                            customer.radiusUsername, since, new Date(), 0, 0, 23, 59
                        );
                        if (Array.isArray(events) && events.length > 0) {
                            customer.ingestEvents(events);
                            break;   // Found something — stop widening
                        }
                    }
                }
            } catch (bufferErr) {
                console.warn('[updateCustomerStatus] buffer update failed (non-fatal):', bufferErr);
            }
            
            // Compute the "normal" sinceDate (last known event or last poll)
            let sinceDate = null;
            if (customer.lastEventTime !== null) {
                sinceDate = new Date(customer.lastEventTime);
            } else if (customer.lastUpdate) {
                const lastUpdateDate = new Date(customer.lastUpdate);
                if (!isNaN(lastUpdateDate.getTime())) sinceDate = lastUpdateDate;
            }

            // === PROGRESSIVE LOOKBACK FOR NEW CUSTOMERS ===
            const lookbackPeriods = [
                sinceDate,                    // Normal narrow poll
                new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),     // 1 day
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),     // 7 days
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),    // 30 days
                new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),    // 3 months
                new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),   // 6 months
                new Date(Date.now() - 335 * 24 * 60 * 60 * 1000)    // ~11 months max
            ];

            let latest = null;
            for (const trySince of lookbackPeriods) {
                latest = await NeonovaHTTPController.getLatestEntry(customer.radiusUsername, trySince);
                if (latest) break;   // Found something — stop widening
            }

            // No logs found in any lookback window
            if (!latest) {
                if (customer.lastEventTime !== null) {
                    // Known existing customer — preserve status, just increment duration
                    const eventDate = new Date(customer.lastEventTime);
                    if (!isNaN(eventDate.getTime())) {
                        const durationSeconds = Math.floor((Date.now() - eventDate.getTime()) / 1000);
                        if (durationSeconds >= 0) customer.update(customer.status, durationSeconds);
                    }
                } else {
                    // Never-seen customer — appropriate to mark as not found
                    customer.update('Account Not Found', 0);
                }
                return;
            }

            // We have a real event (from any lookback)
            const eventDate = latest.dateObj;
            const eventMs = eventDate.getTime();
            let durationSeconds = Math.floor((Date.now() - eventMs) / 1000);
            if (durationSeconds < 0) durationSeconds = 0;

            const status = latest.status === 'Start' ? 'Connected' : 'Disconnected';

            const isNew = customer.lastEventTime === null || eventMs > customer.lastEventTime;

            if (isNew) {
                customer.update(status, durationSeconds);
                customer.lastEventTime = new Date(eventMs);
            } else {
                // No change — just keep incrementing duration
                if (customer.lastEventTime !== null) {
                    const existingEventDate = new Date(customer.lastEventTime);
                    durationSeconds = Math.floor((Date.now() - existingEventDate.getTime()) / 1000);
                    if (durationSeconds >= 0) customer.update(customer.status, durationSeconds);
                }
                //No new event; incremented duration
            }
        } catch (err) {
            console.error('[updateCustomerStatus] error:', err);
            customer.update('Error', 0);
        }
    }   
}
