class BaseNovaView extends EventTarget {
    constructor(container = null) {
        super();

        this.theme = {
            accent: 'emerald',
            accentColor: '#34d399',
            primary: 'emerald'
        };
        this.accent = 'emerald';
        this.accentColor = 'emerald-500';

        this.panel = null;

        // Container handling (for views that need a specific DOM element)
        if (container) {
            this.container = container;
        }

        // Load Tailwind if needed, but DO NOT auto-call render()
        this.ensureTailwind();
    }

    ensureTailwind() {
        if (document.getElementById('tailwind-css')) {
            this.onTailwindReady();
            return;
        }
        const s = document.createElement('script');
        s.id = 'tailwind-css';
        s.src = 'https://cdn.tailwindcss.com';
        s.onload = () => this.onTailwindReady();
        document.head.appendChild(s);
    }

    /**
     * NO-OP by default.
     * Child classes should call this.render() themselves when they are ready
     * (usually inside their own show() method).
     */
    onTailwindReady() {
        // Intentionally empty. Parent no longer forces rendering.
    }

    /**
     * Base render is now safe and empty.
     * Child classes must implement their own render() logic.
     */
    render() {
        // Default: do nothing. Subclasses override this.
        console.warn(`[BaseNovaView] render() called on ${this.constructor.name} but not overridden`);
    }

    createPanelContainer() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
            width: 92%; max-width: 1100px; height: calc(100vh - 80px);
            background: #09090b; border: 1px solid #27272a; border-radius: 24px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.8); overflow: hidden;
            font-family: system-ui; z-index: 9999; display: none;
        `;
        document.body.appendChild(panel);
        return panel;
    }

    show() {
        if (this.panel) this.panel.style.display = 'block';
    }

    hide() {
        if (this.panel) this.panel.style.display = 'none';
    }

    $(sel) {
        return this.panel ? this.panel.querySelector(sel) : null;
    }
}
