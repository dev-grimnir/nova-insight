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
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit'
        });
        return `${fmt(this.startDate)} — ${fmt(this.endDate)}`;
    }

    getUptimePercent() {
        const v = this.metrics.percentConnected;
        if (v == null || v === '' || isNaN(Number(v))) return '0.0';
        return Number(v).toFixed(1);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NovaSnapshotModel;
}
