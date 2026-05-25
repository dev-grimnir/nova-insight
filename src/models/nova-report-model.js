class NovaReportModel {
    constructor(username, friendlyName, metrics, entryCount, longDisconnects, sanitizedEntries = []) {
        this.username = username;
        this.friendlyName = friendlyName || username;
        this.metrics = metrics;
        this.entryCount = entryCount;
        this.longDisconnects = longDisconnects || [];
    }

    getUsername() {
        return this.username;
    }

    getFriendlyName() {
        return this.friendlyName;
    }

    getMetrics() {
        return this.metrics;
    }

    getLongDisconnects() {
        return this.longDisconnects;
    }

    get totalEntries() {
        return this.entryCount;
    }

    get disconnectCount() {
        return this.longDisconnects.length;
    }
}
