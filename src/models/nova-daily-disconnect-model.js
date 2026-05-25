class NovaDailyDisconnectModel {
    constructor(username, friendlyName, date, events) {
        this.username      = username;
        this.friendlyName  = friendlyName;
        this.date          = date;
        this.events        = events || [];
    }

    getDateRangeString() {
        const options = {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        };
        const startDate = new Date(this.date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(this.date);
        endDate.setHours(23, 59, 59, 999);
        const startStr = startDate.toLocaleString('en-US', options);
        const endStr   = endDate.toLocaleString('en-US', options);
        return `${startStr} – ${endStr}`;
    }
}
