class NovaSpinnerView extends NovaBaseModalView {
    constructor(friendlyName) {
        super(null);
        this.friendlyName = friendlyName;
    }

    show() {
        const html = `
            <div id="spinner-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[10002] opacity-0 transition-opacity duration-300">
                <div class="bg-[#18181b] border border-[#27272a] rounded-3xl px-12 py-10 flex flex-col items-center gap-6 shadow-2xl transform translate-y-12 transition-all duration-300">
                    <div class="w-12 h-12 rounded-full border-4 border-zinc-700 border-t-emerald-400 animate-spin"></div>
                    <div class="text-emerald-400 text-xs font-mono tracking-widest">LOADING SNAPSHOT</div>
                    <div class="text-white text-lg font-medium">${this.friendlyName}</div>
                </div>
            </div>
        `;
        super.createModal(html);
    }
}
