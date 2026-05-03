/**
 * Static toast utility. Renders error toasts at the bottom-center of the
 * viewport with slide-and-fade enter/exit animations.
 *
 * Usage:
 *   NeonovaToast.error('Something went wrong.');
 *   NeonovaToast.error('With a longer duration.', { duration: 8000 });
 *
 * Future variants (success, info, warning) can be added when needed; the
 * internal #render method is shaped to accept a type already.
 */
class NeonovaToast {
    static #ENTER_MS = 200;
    static #EXIT_MS = 700;
    static #DEFAULT_DURATION_MS = 3000;

    static error(message, options = {}) {
        return this.#render(message, { ...options, type: 'error' });
    }

    static #render(message, { type, duration = this.#DEFAULT_DURATION_MS } = {}) {
        const toast = document.createElement('div');
        toast.setAttribute('role', 'alert');
        toast.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: 40px;
            transform: translate(-50%, 40px);
            min-width: 360px;
            max-width: 560px;
            padding: 18px 28px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 15px;
            line-height: 1.4;
            color: #fff;
            border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
            z-index: 10010;
            opacity: 0;
            pointer-events: auto;
            transition:
                opacity ${this.#ENTER_MS}ms ease-out,
                transform ${this.#ENTER_MS}ms ease-out;
        `;

        if (type === 'error') {
            toast.style.background = 'rgba(153, 27, 27, 0.95)';
            toast.style.border = '1px solid rgba(239, 68, 68, 0.6)';
        } else {
            toast.style.background = 'rgba(39, 39, 42, 0.95)';
            toast.style.border = '1px solid rgba(82, 82, 91, 1)';
        }

        toast.textContent = message;
        document.body.appendChild(toast);

        // Force layout, then trigger the enter transition. Two rAFs ensure the
        // initial styles paint before the transition kicks in — without this,
        // the browser may collapse both states into a single paint and skip
        // the animation entirely.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translate(-50%, 0)';
            });
        });

        // After the visible duration, run the slower exit transition, then remove.
        setTimeout(() => {
            toast.style.transition =
                `opacity ${this.#EXIT_MS}ms ease-in, ` +
                `transform ${this.#EXIT_MS}ms ease-in`;
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 40px)';
            setTimeout(() => toast.remove(), this.#EXIT_MS);
        }, duration);
    }
}
