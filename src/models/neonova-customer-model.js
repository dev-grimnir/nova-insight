class NeonovaCustomerModel {
    static RETENTION_MS = 24 * 60 * 60 * 1000;

    constructor(radiusUsername, friendlyName = '', initialState = null) {
        const state = initialState || {};
        this.radiusUsername = radiusUsername.trim();
        this.friendlyName = (friendlyName.trim() || radiusUsername.trim());
        this.status = state.status || 'Connecting...';
        this.durationSec = state.durationSec ?? 0;
        this.lastUpdate = state.lastUpdate || new Date().toLocaleString();
        this.lastEventTime = state.lastEventTime ? new Date(state.lastEventTime) : null;
        this.disconnectedSince = (typeof state.disconnectedSince === 'number') ? state.disconnectedSince : null;
        this.lastAlertSent     = (typeof state.lastAlertSent === 'number')     ? state.lastAlertSent     : null;
        this.alertsSuppressed = state.alertsSuppressed === true;
        this.disconnectedSince = (typeof state.disconnectedSince === 'number') ? state.disconnectedSince : null;
        this.lastAlertSent     = (typeof state.lastAlertSent === 'number')     ? state.lastAlertSent     : null;
        
        this.eventHistory = [];
        if (Array.isArray(state.eventHistory)) {
            for (const e of state.eventHistory) {
                const d = new Date(e.dateObj);
                if (!isNaN(d.getTime())) {
                    this.eventHistory.push({ dateObj: d, status: e.status });
                }
            }
        }
    }

    getDurationStr() {
        const seconds = this.durationSec || 0;
        let durationStr = '';

        if (seconds < 60) {
            durationStr = '<1min';
        } else {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (days > 0)  durationStr += `${days}d `;
            if (hours > 0) durationStr += `${hours}h `;
            durationStr += `${minutes}m`;
        }

        let timeStr = '';
        if (this.lastEventTime) {
            const eventDate = new Date(this.lastEventTime);
            if (!isNaN(eventDate.getTime())) {
                timeStr = ` (${eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })})`;
            }
        }

        return `${durationStr}${timeStr}`;
    }

    update(status, durationSec) {
        this.status = status;
        this.durationSec = durationSec;
        this.lastUpdate = new Date().toLocaleString();
    }

    ingestEvents(events) {
        if (!Array.isArray(events) || events.length === 0) return;

        const normalized = [];
        for (const e of events) {
            const d = e.dateObj instanceof Date ? e.dateObj : new Date(e.dateObj);
            if (!isNaN(d.getTime())) {
                normalized.push({ dateObj: d, status: e.status });
            }
        }

        const merged = this.eventHistory.concat(normalized);
        merged.sort(function(a, b) { return a.dateObj.getTime() - b.dateObj.getTime(); });

        const deduped = [];
        let lastKey = null;
        for (const e of merged) {
            const key = e.dateObj.getTime() + '|' + e.status;
            if (key !== lastKey) {
                deduped.push(e);
                lastKey = key;
            }
        }

        const cutoff = Date.now() - NeonovaCustomerModel.RETENTION_MS;
        const trimmed = [];
        for (const e of deduped) {
            if (e.dateObj.getTime() >= cutoff) trimmed.push(e);
        }

        // Preserve the most recent event even if older than retention.
        // The renderer needs at least one event to infer pre-window state.
        if (trimmed.length === 0 && deduped.length > 0) {
            trimmed.push(deduped[deduped.length - 1]);
        }

        this.eventHistory = trimmed;
    }

    static fromJSON(json) {
        return new NeonovaCustomerModel(
            json.radiusUsername,
            json.friendlyName,
            {
                status: json.status || 'Connecting...',
                durationSec: json.durationSec ?? 0,
                lastUpdate: json.lastUpdate,
                lastEventTime: json.lastEventTime,
                alertsSuppressed: json.alertsSuppressed,
                disconnectedSince: json.disconnectedSince,
                lastAlertSent: json.lastAlertSent,
                eventHistory: json.eventHistory
            }
        );
    }

    toJSON() {
        const historyOut = [];
        for (const e of this.eventHistory) {
            historyOut.push({
                dateObj: e.dateObj.toISOString(),
                status: e.status
            });
        }

        return {
            alertsSuppressed: this.alertsSuppressed,
            radiusUsername: this.radiusUsername,
            friendlyName: this.friendlyName,
            status: this.status,
            durationSec: this.durationSec,
            lastUpdate: this.lastUpdate,
            lastEventTime: this.lastEventTime instanceof Date 
                ? this.lastEventTime.toISOString() 
                : (this.lastEventTime || null),
            disconnectedSince: this.disconnectedSince,
            lastAlertSent: this.lastAlertSent,
            disconnectedSince: this.disconnectedSince,
            lastAlertSent: this.lastAlertSent,
            eventHistory: historyOut
        };
    }

    markDisconnected(now = Date.now()) {
        this.disconnectedSince = now;
        this.lastAlertSent = null;
    }

    markAlerted(now = Date.now()) {
        this.lastAlertSent = now;
    }

    markReconnected() {
        this.disconnectedSince = null;
        this.lastAlertSent = null;
    }

    toggleAlertsSuppressed() {
        this.alertsSuppressed = !this.alertsSuppressed;
        return this.alertsSuppressed;
    }
}
