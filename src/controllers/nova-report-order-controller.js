class NovaReportOrderController {
    constructor(username, friendlyName) {
        this.username = username;
        this.friendlyName = friendlyName || username;
        this.view = null;  // Created in start()
        this.start();
    }

    start() {
        // Controller creates its own view
        this.view = new NovaReportOrderView(this, this.username, this.friendlyName);

        // Now show the view (controller manages view lifecycle)
        this.view.show();
    }

    handleQuickReport(timeframe) {
        const DAYS = { '1_DAYS': 1, '2_DAYS': 2, '3_DAYS': 3, '7_DAYS': 7, '30_DAYS': 30, '90_DAYS': 90 };
        const days = DAYS[timeframe];
        if (!days) {
            console.error("NovaReportOrderController.handleQuickReport() -> Invalid Timeframe.");
            return;
        }
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        this.startProgressController(startDate, endDate);
    }

    handleCustomReport(startIso, endIso) {
        const startDate = new Date(startIso);
        const endDate = new Date(endIso);
        this.startProgressController(startDate, endDate);
    }

    startProgressController(startDate, endDate) {
        // Reports run from midnight on the requested start day through the
        // exact requested end time. Normalize the start here so every entry
        // path (quick, custom, future) gets the same treatment.
        const normalizedStart = new Date(startDate);
        normalizedStart.setHours(0, 0, 0, 0);

        const progressCtrl = new NovaProgressController();
        progressCtrl.start(
            this.username,
            this.friendlyName,
            normalizedStart,
            endDate
        );
        this.view.close();
    }
}
