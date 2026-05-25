class NovaInlineSnapshotView {
    static WINDOW_MS = 24 * 60 * 60 * 1000;   // 24h window rendered
    static SVG_NS    = 'http://www.w3.org/2000/svg';

    constructor(customerModel) {
        this.model = customerModel;
    }

    /**
     * Returns an <svg> element ready to be dropped into the snapshot <td>.
     * Re-callable — cheap to regenerate on every poll tick.
     */
    render() {
        const svg = document.createElementNS(NovaInlineSnapshotView.SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 10');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.display = 'block';
        svg.style.minHeight = '18px';

        const events = this.#clipToWindow(this.model.eventHistory || []);
        if (events.length < 1) {
            // No data — render a flat neutral stripe so the cell isn't empty
            this.#appendRect(svg, 0, 100, '#27272a');
            return svg;
        }

        const now      = Date.now();
        const windowMs = NovaInlineSnapshotView.WINDOW_MS;
        const startMs  = now - windowMs;

        // Walk events into contiguous periods, same logic as the modal snapshot view
        const periods = [];
        let i = 0;
        while (i < events.length) {
            const isConnected = (events[i].status === 'Start');
            const periodStart = Math.max(events[i].dateObj.getTime(), startMs);

            let j = i + 1;
            while (j < events.length && (events[j].status === 'Start') === isConnected) j++;

            const periodEnd = j < events.length ? events[j].dateObj.getTime() : now;
            periods.push({ startMs: periodStart, endMs: periodEnd, isConnected });
            i = j;
        }

        // The first event's state tells us what the window looked like *before* it.
        // Prepend a leading region from startMs → first event with the opposite state.
        const firstEventMs = events[0].dateObj.getTime();
        if (firstEventMs > startMs) {
            const leadingConnected = (events[0].status !== 'Start');  // opposite
            periods.unshift({
                startMs: startMs,
                endMs: firstEventMs,
                isConnected: leadingConnected
            });
        }

        // Project each period onto the 0-100 viewBox width
        for (const p of periods) {
            const xStart = ((p.startMs - startMs) / windowMs) * 100;
            const xEnd   = ((p.endMs   - startMs) / windowMs) * 100;
            const width  = Math.max(0.1, xEnd - xStart);   // never zero-width
            const color  = p.isConnected ? '#10b981' : '#ef4444';
            this.#appendRect(svg, xStart, width, color);
        }

        return svg;
    }

    #clipToWindow(events) {
        if (!events || events.length === 0) return [];
    
        const sorted = events.slice().sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
        const cutoff = Date.now() - NovaInlineSnapshotView.WINDOW_MS;
    
        const inWindow = sorted.filter(e => e.dateObj.getTime() >= cutoff);
    
        // If nothing falls inside the window, fall back to the single most recent
        // pre-window event — it tells us the modem's state for the whole 24h.
        if (inWindow.length === 0) {
            return [sorted[sorted.length - 1]];
        }
    
        // If the oldest in-window event isn't at the very start of the window,
        // prepend the most recent pre-window event so the leading region is correct.
        const firstInWindowMs = inWindow[0].dateObj.getTime();
        if (firstInWindowMs > cutoff) {
            const preWindow = sorted.filter(e => e.dateObj.getTime() < cutoff);
            if (preWindow.length > 0) {
                inWindow.unshift(preWindow[preWindow.length - 1]);
            }
        }
    
        return inWindow;
    }

    #appendRect(svg, x, width, color) {
        const rect = document.createElementNS(NovaInlineSnapshotView.SVG_NS, 'rect');
        rect.setAttribute('x', x.toString());
        rect.setAttribute('y', '0');
        rect.setAttribute('width', width.toString());
        rect.setAttribute('height', '10');
        rect.setAttribute('fill', color);
        svg.appendChild(rect);
    }
}
