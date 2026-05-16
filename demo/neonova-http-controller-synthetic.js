/**
 * @file demo/neonova-http-controller-synthetic.js
 *
 * NeonovaHTTPController — DEMO SYNTHETIC IMPLEMENTATION
 *
 * Drop-in replacement for src/controllers/neonova-http-controller.js.
 * Same class name. Same public static methods. Same return shapes. Same
 * legacy argument-shifting quirks. The rest of the app (collector, analyzer,
 * dashboard, tab controller, customer model, all views, crypto layer) runs
 * production code unmodified — they just call into this class instead of
 * the real one and never know the difference.
 *
 * ─── Public surface (must match production exactly) ──────────────────────
 *   static getSearchUrl(username) -> string
 *   static paginateReportLogs(username, startDate, endDate, sH, sM, eH, eM,
 *                             onProgress, signal) -> Array | null
 *   static getLatestEntry(username, sinceDate) -> entry | null | undefined
 *
 * ─── Return-shape contract ────────────────────────────────────────────────
 *   paginateReportLogs:
 *     - null      : username not in registry (production's null-on-missing-
 *                   total path; dashboardController maps this to Account
 *                   Not Found and removes the row).
 *     - []        : valid username, no events in the requested window.
 *     - [entry…]  : entries in chronological order.
 *
 *   getLatestEntry:
 *     - null      : username not in registry.
 *     - undefined : valid username but no events in the lookback window
 *                   (matches production behavior of indexing past the end
 *                   of an empty array).
 *     - entry     : the most recent entry in the window.
 *
 *   Each entry has the production shape:
 *     { timestamp: 'YYYY-MM-DD HH:MM:SS',
 *       status:    'Start' | 'Stop',
 *       sessionTime: string (cosmetic; computed for Stop events),
 *       dateObj:   Date }
 *
 * ─── How synthesis works ──────────────────────────────────────────────────
 *
 * On first reference for any given username we generate a deterministic
 * event stream covering [demoEpoch - 30d, demoEpoch + 7d] and cache it.
 * The stream is the customer's complete connection history for this demo
 * session — past events that should be visible at load, plus future events
 * that get revealed as wall-clock time advances.
 *
 * Determinism: each customer's RNG is seeded from a hash of the username.
 * Same username → same stream, every demo load. This preserves the property
 * that the same report params always produce the same report — otherwise a
 * visitor running the same report twice would see different numbers and the
 * illusion would shatter.
 *
 * The demo-epoch is captured once on first reference (lazy init). Wall-clock
 * time advances normally; getLatestEntry filters events to [..., Date.now()],
 * so as the demo session ages, more events from the "future" portion of the
 * stream become visible. That's how polling stays live.
 *
 * ─── How profile fields drive generation ──────────────────────────────────
 *
 * Each event is sampled from a state machine walking forward:
 *   - In the up state, time-to-next-disconnect ~ Exponential(rate),
 *     where rate = (disconnectsPerDay / 24) * timeOfDayWeights[hour].
 *     Hour-weighting means disconnects cluster in peak hours, which is
 *     exactly what produces meaningful peakHour data downstream.
 *   - In the down state, outage duration ~ Lognormal(outageMu, outageSigma),
 *     which gives short blips dominated by a fat tail of rare long outages —
 *     the shape the analyzer's longDisconnects (>30min) bucket needs.
 *
 * ─── Current-state overrides ──────────────────────────────────────────────
 *
 * Profiles can pin the recent past to a specific shape so the dashboard
 * loads with prearranged scenarios. See the registry for the catalog;
 * implementation in #generateStream below.
 *
 * ─── Latency simulation ───────────────────────────────────────────────────
 *
 * paginateReportLogs deliberately introduces ~3 seconds of latency when an
 * onProgress callback is provided (production takes ~30s for a real RADIUS
 * paginate; we trim to keep the demo flow snappy). Calls without onProgress
 * (e.g., the 24h backfill in tabController.add) resolve immediately —
 * those code paths weren't progress-bar-worthy in production either.
 */

class NeonovaHTTPController {

    /**************************************************************************
     * STATIC PRIVATE FIELDS
     **************************************************************************/

    /**
     * The instant at which this demo session "started." Captured lazily on
     * first reference and never moved. All synthetic streams are anchored
     * to this moment. Wall-clock time advances; this does not.
     */
    static #demoEpoch = null;

    /**
     * Cache of generated event streams: username -> entry array | null.
     * Negative cache: null entries record "not found" answers so we don't
     * re-check the registry on every poll.
     */
    static #streams = new Map();

    /** Window the synthetic stream covers, in days, relative to demoEpoch. */
    static #PAST_WINDOW_DAYS = 30;
    static #FUTURE_WINDOW_DAYS = 7;

    /**
     * Simulated end-to-end latency for a paginated report fetch when
     * onProgress is provided. Trimmed from production's ~30s.
     */
    static #SIM_LATENCY_MS = 3000;

    /** Page size for simulated pagination. Matches production's hits-per-page. */
    static #HITS_PER_PAGE = 100;

    /**************************************************************************
     * STATIC PRIVATE HELPERS — RNG and sampling
     **************************************************************************/

    /**
     * Lazy demo-epoch init. First reference captures the moment; from then on
     * every call returns the same Date. Subsequent generations all anchor here.
     */
    static #getDemoEpoch() {
        if (!this.#demoEpoch) this.#demoEpoch = new Date();
        return this.#demoEpoch;
    }

    /**
     * Deterministic 32-bit string hash (FNV-1a variant). Fast, no deps,
     * good enough for our purposes — we just need decorrelated seeds across
     * different usernames.
     */
    static #hashString(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /**
     * Mulberry32 — small, fast, decent-quality seeded PRNG. Returns a
     * function yielding uniform values in [0, 1). Each call advances the
     * internal state, so callers get a deterministic stream per seed.
     */
    static #mulberry32(seed) {
        let state = seed >>> 0;
        return function () {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * Sample time-to-next-disconnect from an Exponential distribution, with
     * rate scaled by the time-of-day weight at the cursor's current hour.
     * Returns hours (a Number; not necessarily integer).
     *
     * Math: for Exp(rate), inverse-transform sampling is -ln(1-u) / rate.
     * disconnectsPerDay / 24 → disconnects per hour at baseline. Multiplying
     * by todMult skews disconnects toward peak hours.
     */
    static #sampleHoursToDisconnect(profile, cursorDate, rng) {
        const baseRate = profile.disconnectsPerDay / 24;
        const hour = cursorDate.getHours();
        const todMult = profile.timeOfDayWeights[hour] || 1.0;
        const effectiveRate = Math.max(baseRate * todMult, 1e-6);   // avoid /0
        return -Math.log(1 - rng()) / effectiveRate;
    }

    /**
     * Sample an outage duration in seconds from a Lognormal distribution.
     *
     * Math: turn two uniforms into a standard normal via Box-Muller, then
     * exp(mu + sigma * z). Result is clamped to [1s, 24h] so a once-in-a-
     * blue-moon tail sample doesn't produce a 30-day outage that swallows
     * the entire window.
     */
    static #sampleOutageSeconds(profile, rng) {
        const u1 = Math.max(rng(), 1e-12);    // guard ln(0)
        const u2 = rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const seconds = Math.exp(profile.outageMu + profile.outageSigma * z);
        return Math.max(1, Math.min(seconds, 24 * 3600));
    }

    /**
     * Walk the up/down state machine forward through [fromMs, toMs], pushing
     * raw events ({dateObj, status}) into the supplied array. Mutates events.
     *
     * Each iteration samples either the next disconnect (if currently up) or
     * the next reconnect (if currently down), advances the cursor, and emits
     * the corresponding entry. A hard iteration cap defends against malformed
     * profiles that would otherwise loop indefinitely.
     */
    static #walkStream(events, profile, rng, fromMs, toMs, initialState) {
        let cursor = fromMs;
        let state = initialState;

        let iter = 0;
        const MAX_ITER = 50000;

        while (cursor < toMs && iter++ < MAX_ITER) {
            if (state === 'up') {
                const hours = this.#sampleHoursToDisconnect(profile, new Date(cursor), rng);
                cursor += hours * 3600 * 1000;
                if (cursor >= toMs) break;
                events.push({ dateObj: new Date(cursor), status: 'Stop' });
                state = 'down';
            } else {
                const seconds = this.#sampleOutageSeconds(profile, rng);
                cursor += seconds * 1000;
                if (cursor >= toMs) break;
                events.push({ dateObj: new Date(cursor), status: 'Start' });
                state = 'up';
            }
        }
    }

    /**************************************************************************
     * STATIC PRIVATE HELPERS — Stream generation
     **************************************************************************/

    /**
     * Generate the full event stream for a customer, applying any
     * current-state override the profile specifies.
     *
     * Stream covers [demoEpoch - PAST, demoEpoch + FUTURE]. For override
     * profiles, the cutoff-to-future portion is hand-shaped so the dashboard
     * loads with the desired scenario.
     */
    static #generateStream(username, profile) {
        const epoch = this.#getDemoEpoch();
        const seed = this.#hashString(username);
        const rng = this.#mulberry32(seed);

        const windowStart = epoch.getTime() - this.#PAST_WINDOW_DAYS * 24 * 3600 * 1000;
        const windowEnd   = epoch.getTime() + this.#FUTURE_WINDOW_DAYS * 24 * 3600 * 1000;

        const events = [];

        switch (profile.currentState) {

            case 'down-hours': {
                // Generate naturally up to 8h before demo-load. Then inject a
                // Stop 3-7h ago and a Start 1-5h into the future. The customer
                // is down across demo-load and recovers live mid-session if
                // the visitor sticks around.
                const cutoffMs = epoch.getTime() - 8 * 3600 * 1000;
                this.#walkStream(events, profile, rng, windowStart, cutoffMs, 'up');

                const stopMs = epoch.getTime() - (3 + rng() * 4) * 3600 * 1000;
                events.push({ dateObj: new Date(stopMs), status: 'Stop' });

                const startMs = epoch.getTime() + (1 + rng() * 4) * 3600 * 1000;
                events.push({ dateObj: new Date(startMs), status: 'Start' });

                this.#walkStream(events, profile, rng, startMs, windowEnd, 'up');
                break;
            }

            case 'just-reconnected': {
                // Generate naturally up to ~1h before demo-load, then inject
                // a brief outage that ends just before demo-load. Visitor sees
                // a customer who was very recently down but is up now.
                const cutoffMs = epoch.getTime() - 60 * 60 * 1000;
                this.#walkStream(events, profile, rng, windowStart, cutoffMs, 'up');

                const stopMs = epoch.getTime() - (15 + rng() * 30) * 60 * 1000;
                events.push({ dateObj: new Date(stopMs), status: 'Stop' });

                const startMs = stopMs + (2 + rng() * 8) * 60 * 1000;
                events.push({ dateObj: new Date(startMs), status: 'Start' });

                this.#walkStream(events, profile, rng, startMs, windowEnd, 'up');
                break;
            }

            case 'recently-installed': {
                // Stream begins 3-7 days ago with a single Start event.
                // No further activity. Analyzer infers perfect uptime since.
                const installAgeMs = (3 + rng() * 4) * 24 * 3600 * 1000;
                const installMs = epoch.getTime() - installAgeMs;
                events.push({ dateObj: new Date(installMs), status: 'Start' });
                // No walk — we want this customer pristine.
                break;
            }

            case 'normal':
            default: {
                // Walk the full window naturally end-to-end.
                this.#walkStream(events, profile, rng, windowStart, windowEnd, 'up');
                break;
            }
        }

        // Dashboard invariant: every valid customer must have at least one event
        // in the visible past so status can be determined on first poll. RNG can
        // legitimately produce empty streams (very low disconnect rates) or
        // future-only streams (all sampled events landed after demoEpoch). Floor
        // the result so seeded customers always render a real status.
        const nowMs = Date.now();
        const hasPastEvent = events.some(e => e.dateObj.getTime() <= nowMs);
        if (!hasPastEvent) {
            // Anchor a Start event 7-14 days before demoEpoch. Deterministic via
            // the same rng, so the same username always gets the same anchor.
            const anchorAgeMs = (7 + rng() * 7) * 24 * 3600 * 1000;
            const anchorMs = epoch.getTime() - anchorAgeMs;
            events.push({ dateObj: new Date(anchorMs), status: 'Start' });
        }
        
        // Sort chronologically and decorate each event with the production
        // shape (timestamp string + sessionTime placeholder).
        events.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
        return events.map((e, i, arr) => this.#decorateEvent(e, arr, i));
    }

    /**
     * Lazy fetch of a customer's stream. Caches both hits and misses.
     * Returns the stream array, or null if the username isn't in the registry.
     */
    static #ensureStream(username) {
        if (this.#streams.has(username)) {
            const cached = this.#streams.get(username);
            console.log('[#ensureStream cache hit]', {
                username,
                cachedValue: cached === null ? 'null' : `array(${cached.length})`
            });
            return cached;
        }
    
        const profile = NeonovaProfileRegistry.get(username);
        console.log('[#ensureStream cache miss]', {
            username,
            hasProfile: !!profile
        });
    
        if (!profile) {
            this.#streams.set(username, null);
            return null;
        }
    
        const stream = this.#generateStream(username, profile);
        this.#streams.set(username, stream);
        return stream;
    }

    /**************************************************************************
     * STATIC PRIVATE HELPERS — Formatting and shaping
     **************************************************************************/

    /**
     * Format a Date as 'YYYY-MM-DD HH:MM:SS'. Matches the production
     * timestamp format that gets stored in entry.timestamp. Local time,
     * because the production code parses it as local time.
     */
    static #formatTimestamp(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    /**
     * Format a duration in seconds as a human-readable string like "1h 23m 45s".
     * Cosmetic — sessionTime is not consumed by the analyzer or any model
     * we depend on. We compute it for visual fidelity in case any view
     * surfaces raw entries.
     */
    static #formatSessionTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const parts = [];
        if (h > 0) parts.push(`${h}h`);
        if (m > 0 || h > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        return parts.join(' ');
    }

    /**
     * Wrap a raw {dateObj, status} event in the full production shape:
     *   { timestamp, status, sessionTime, dateObj }
     *
     * sessionTime is computed for Stop events as the duration since the
     * preceding Start event, mirroring how production's HTML scrape would
     * present it. Empty string otherwise.
     */
    static #decorateEvent(rawEvent, allEvents, index) {
        const timestamp = this.#formatTimestamp(rawEvent.dateObj);
        let sessionTime = '';

        if (rawEvent.status === 'Stop' && index > 0) {
            const prev = allEvents[index - 1];
            if (prev.status === 'Start') {
                const seconds = (rawEvent.dateObj.getTime() - prev.dateObj.getTime()) / 1000;
                sessionTime = this.#formatSessionTime(seconds);
            }
        }

        return {
            timestamp,
            status: rawEvent.status,
            sessionTime,
            dateObj: rawEvent.dateObj
        };
    }

    /**
     * Resolve the (start, end) date range from the assorted args
     * paginateReportLogs accepts. Mirrors production's logic: explicit dates
     * if provided, else default to start-of-current-month → now. Hour/minute
     * overrides apply if given.
     */
    static #resolveDateRange(startDate, endDate, sH, sM, eH, eM) {
        const now = new Date();

        let rangeStart;
        if (startDate instanceof Date) {
            rangeStart = new Date(startDate);
        } else {
            rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        if (sH !== null && sH !== undefined) {
            rangeStart.setHours(Number(sH), Number(sM ?? 0), 0, 0);
        } else if (!(startDate instanceof Date)) {
            rangeStart.setHours(0, 0, 0, 0);
        }

        let rangeEnd;
        if (endDate instanceof Date) {
            rangeEnd = new Date(endDate);
        } else {
            rangeEnd = new Date(now);
        }
        if (eH !== null && eH !== undefined) {
            rangeEnd.setHours(Number(eH), Number(eM ?? 59), 59, 999);
        }

        return { rangeStart, rangeEnd };
    }

    /**
     * setTimeout-as-Promise that resolves either after ms elapses OR when
     * the AbortSignal fires (whichever comes first). Used to space out
     * simulated pagination so the progress modal animates believably while
     * still honoring cancellation requests immediately.
     */
    static #sleep(ms, signal) {
        return new Promise(resolve => {
            if (signal?.aborted) { resolve(); return; }
            const t = setTimeout(resolve, ms);
            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(t);
                    resolve();
                }, { once: true });
            }
        });
    }

    /**************************************************************************
     * STATIC PUBLIC METHODS — Drop-in API
     **************************************************************************/

    /**
     * Production parity. Builds the URL the user would click to view the
     * customer on the real RADIUS admin site. We preserve the same shape
     * so any UI affordance that links to it doesn't break, even though
     * in the demo nothing actually navigates there.
     */
    static getSearchUrl(username) {
        const now = new Date();
        const params = new URLSearchParams({
            acctsearch: '2',
            sd: 'fairpoint.net',
            iuserid: username,
            syear: now.getFullYear().toString(),
            smonth: String(now.getMonth() + 1).padStart(2, '0'),
            sday: '01',
            order: 'date',
            hits: '50'
        });
        return `https://admin.neonova.net/rat/index.php?${params.toString()}`;
    }

    /**
     * DROP-IN REPLACEMENT for production paginateReportLogs.
     *
     * The legacy argument-shifting at the top is preserved bit-for-bit —
     * any caller that relied on passing onProgress in a non-standard
     * position keeps working.
     */
    static async paginateReportLogs(
        username,
        startDate = null,
        endDate = null,
        startHour = null,
        startMinute = null,
        endHour = null,
        endMinute = null,
        onProgress = null,
        signal = null
    ) {
        // ── Legacy argument handling (verbatim from production) ──
        if (typeof startDate === 'function') {
            onProgress = startDate;
            startDate = endDate = null;
            startHour = startMinute = endHour = endMinute = null;
            signal = null;
        } else if (typeof endDate === 'function') {
            onProgress = endDate;
            endDate = null;
            startHour = startMinute = endHour = endMinute = null;
            signal = null;
        } else if (typeof startHour === 'function') {
            onProgress = startHour;
            startHour = startMinute = endHour = endMinute = null;
            signal = null;
        }

        const stream = this.#ensureStream(username);
        if (stream === null) {
            // Username not in registry → null → Account Not Found downstream.
            return null;
        }

        const { rangeStart, rangeEnd } = this.#resolveDateRange(
            startDate, endDate, startHour, startMinute, endHour, endMinute
        );

        // Slice the cached stream to the requested range. Using getTime()
        // throughout to keep comparisons fast and timezone-agnostic.
        const startMs = rangeStart.getTime();
        const endMs = rangeEnd.getTime();
        const filtered = stream.filter(e => {
            const t = e.dateObj.getTime();
            return t >= startMs && t <= endMs;
        });

        // No onProgress = caller doesn't expect progress UX (e.g., the 24h
        // backfill from tabController.add). Resolve immediately.
        if (typeof onProgress !== 'function') {
            return filtered;
        }

        // Otherwise simulate paginated fetching to drive the progress modal.
        const totalPages = Math.max(1, Math.ceil(filtered.length / this.#HITS_PER_PAGE));
        const perPageMs = this.#SIM_LATENCY_MS / totalPages;
        const total = filtered.length;
        const result = [];

        for (let page = 1; page <= totalPages; page++) {
            // Honor abort: production returns whatever's been collected so far.
            if (signal?.aborted) return result;

            await this.#sleep(perPageMs, signal);

            // Bail post-sleep if abort fired during the wait.
            if (signal?.aborted) return result;

            const sliceStart = (page - 1) * this.#HITS_PER_PAGE;
            const sliceEnd = Math.min(sliceStart + this.#HITS_PER_PAGE, filtered.length);
            result.push(...filtered.slice(sliceStart, sliceEnd));

            try {
                onProgress(result.length, page, total);
            } catch (e) {
                console.warn('[paginateReportLogs] onProgress threw:', e);
            }
        }

        return result;
    }

    /**
     * DROP-IN REPLACEMENT for production getLatestEntry.
     *
     * Note: "now" is wall-clock Date.now(), not demoEpoch. As real time
     * advances during a demo session, more events from the future portion
     * of the cached stream become visible — that's how polling stays live.
     */
    static async getLatestEntry(username, sinceDate = null) {
        const stream = this.#ensureStream(username);
        if (stream === null) return null;

        const now = Date.now();
        const cutoff = (sinceDate instanceof Date && !isNaN(sinceDate.getTime()))
            ? sinceDate.getTime()
            : now - 30 * 24 * 3600 * 1000;

        // Walk backward — the latest entry is typically near the end of
        // the array, since events are sorted ascending.
        for (let i = stream.length - 1; i >= 0; i--) {
            const t = stream[i].dateObj.getTime();
            if (t > now) continue;       // future event, not yet "happened"
            if (t < cutoff) break;       // walked past the lookback window
            return stream[i];
        }

        // Valid customer, no events in window → undefined (matches production
        // behavior of indexing past the end of an empty array).
        return undefined;
    }
}
