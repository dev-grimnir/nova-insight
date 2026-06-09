class NovaNotifierController {
    /**
     * Dispatch a notification for a single node state change.
     *
     * @param {('Disconnected'|'Connected')} status
     * @param {string} nodeName
     * @param {string} tabLabel
     */
    static async alert(status, nodeName, tabLabel, sinceTimestamp = null) {
        const message = this.#buildMessage(status, nodeName, tabLabel, sinceTimestamp);
        const admins = await this.#readAdmins();

        if (!admins.length) {
            await this.#dispatch(null, message);
            return;
        }

        for (const admin of admins) {
            try {
                await this.#dispatch(admin.phoneNumber, message);
            } catch (err) {
                console.error(`[NovaNotifierController.alert] failed for ${admin.name}:`, err);
            }
        }
    }

    static #buildMessage(status, nodeName, tabLabel, sinceTimestamp) {
        const stamp = sinceTimestamp
            ? new Date(sinceTimestamp).toLocaleString()
            : new Date().toLocaleString();

        if (status === 'Connected') {
            return `ALERT - Network Node ${nodeName} is back online as of ${stamp}.`;
        }
        return `ALERT - Network Node ${nodeName} is down as of ${stamp}.`;
    }

    static async #readAdmins() {
        try {
            const blob = localStorage.getItem('novaDashboardAdmins');
            if (!blob) return [];
            const jsonStr = await NovaCryptoController.decryptData(blob);
            const parsed = JSON.parse(jsonStr);
            return Array.isArray(parsed.admins) ? parsed.admins : [];
        } catch (err) {
            console.error('[NovaNotifierController.#readAdmins] failed:', err);
            return [];
        }
    }

    /**
     * Stub transport. Swap this body when wiring up the real SMS path.
     * Phone number is in the signature even though the stub ignores it,
     * so the signature stays stable when the real transport goes in.
     */
    static async #dispatch(phoneNumber, message) {
        NovaToast.error(message, { duration: 10000 });
        const klaxon = this.#startKlaxon();
        window.alert(message);
        klaxon.stop();
    }

    static #startKlaxon() {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.value = 0.4;
        gain.connect(ctx.destination);

        let running = true;
        let osc = null;
        const freqs = [880, 660];
        let phase = 0;

        const cycle = () => {
            if (!running) return;
            osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = freqs[phase % 2];
            osc.connect(gain);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
            osc.onended = () => {
                phase++;
                cycle();
            };
        };

        cycle();
        return { stop: () => { running = false; osc?.stop(); ctx.close(); } };
    }
}
