class NovaPassphraseController {
    constructor(dashboardController) {
        this.dashboardController = dashboardController;
        this.view = new NovaPassphraseView(this);
    }

    show() {
        return new Promise(resolve => {
            this._resolve = resolve;
            this.view.show();
        });
    }

    async handleSubmit(passphrase, rememberDevice) {
        if (!passphrase) {
            this.view.showToast("A key is required to unlock the dashboard");
            return;
        }

        await NovaCryptoController.setPassphrase(passphrase, rememberDevice);
        this.view.hide();
        this._resolve(true);
    }

    handleCancel() {
        this.view.showToast("A key is required to unlock the dashboard");
        this.view.hide();
        this._resolve(false);
    }
}
