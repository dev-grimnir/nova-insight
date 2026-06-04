class NovaSnapshotModel {
    constructor(username, friendlyName, startDate, endDate, metrics, events = []) {
        this.username     = username;
        this.friendlyName = friendlyName || username;
        this.startDate    = startDate;
        this.endDate      = endDate;
        this.metrics      = metrics || {};
        this.events       = events || [];
    }

    getUsername()     { return this.username; }
    getFriendlyName() { return this.friendlyName; }
    getStartDate()    { return this.startDate; }
    getEndDate()      { return this.endDate; }
    getMetrics()      { return this.metrics; }
    getEvents()       { return this.events; }

    getLongDisconnects() {
        return this.metrics.longDisconnects || [];
    }

    getDateRangeString() {
        const fmt = (d) => d.toLocaleString([], {
            year: '2-digit', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: '2-digit'
        });
        return `${fmt(this.startDate)} — ${fmt(this.endDate)}`;
    }

    isLiveWindow() {
        return (Date.now() - this.endDate.getTime()) < 10 * 60 * 1000;
    }

    getUptimePercent() {
        const v = this.metrics.percentConnected;
        if (v == null || v === '' || isNaN(Number(v))) return '0.0';
        return Number(v).toFixed(1);
    }

    getCurrentStatus() {
        const state   = this.metrics.finalState;
        const transMs = this.metrics.lastTransitionMs;
        if (!state || transMs == null) return { label: 'Unknown', duration: 'N/A', isUp: null };
        const durationSec = (this.endDate.getTime() - transMs) / 1000;
        return {
            label:    state === 'up' ? 'Connected' : 'Disconnected',
            duration: durationSec > 0 ? formatDuration(durationSec) : '< 1m',
            isUp:     state === 'up'
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaSnapshotModel;
}
