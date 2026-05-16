/**
 * @file demo/neonova-profile-registry.js
 *
 * NeonovaProfileRegistry — Demo customer profile catalog.
 *
 * Every "valid" demo username lives here. Anything not in this map is
 * treated as a RADIUS miss (the synthetic HTTP controller returns null for
 * paginateReportLogs, which the production dashboard controller already
 * interprets as "Account Not Found"). That's how the curated allowlist +
 * deliberate-failure-affordance flow works: the registry IS the allowlist,
 * and the failure path comes for free from production logic.
 *
 * Profile fields:
 *   friendlyName        Display name shown in rows. Optional; the seeder
 *                       picks this up when calling tabController.add.
 *   flavor              Human-readable archetype tag. Informational only —
 *                       the numeric fields below are what actually drive
 *                       the synthetic event stream.
 *   disconnectsPerDay   Average disconnects across 24h. Range ~0.05 to ~25.
 *                       Used as the rate parameter for an exponential
 *                       time-to-event distribution, scaled by time-of-day
 *                       weights below.
 *   outageMu, outageSigma
 *                       Lognormal parameters for outage duration in seconds.
 *                       outageMu = ln(median_seconds). Sigma controls spread.
 *                       Lognormal because real-world outages cluster around
 *                       short blips with a long fat tail of rare big ones —
 *                       which is exactly the shape the analyzer's
 *                       longDisconnects (>30min) bucket was designed around.
 *   timeOfDayWeights    24-element array of multipliers per hour (0..23).
 *                       1.0 = baseline. Higher = more disconnects clustered
 *                       in that hour, which is what produces meaningful
 *                       peakHour data in the analyzer's hourlyDisconnects.
 *   currentState        Shapes the recent-past portion of the stream so the
 *                       dashboard loads with a known scenario:
 *                         'normal'              — natural sampling, no override
 *                         'down-hours'          — Stop ~3-7h ago, no Start until
 *                                                 well after demo-load. The
 *                                                 centerpiece for the alert demo.
 *                         'just-reconnected'    — Stop minutes ago, Start more
 *                                                 recent. Visitor sees a freshly
 *                                                 recovered customer.
 *                         'recently-installed'  — Single Start days ago, no
 *                                                 further activity. New install
 *                                                 with pristine uptime.
 */


/**
 * Time-of-day weights for residential customers.
 * Disconnects cluster heavily in the evening (6pm-11pm) when streaming,
 * gaming, and video-call load peak the network. Lowest overnight (people
 * are asleep, devices idle).
 */
const RESIDENTIAL_WEIGHTS = [
    // 0-5 (overnight) — quiet
    0.4, 0.3, 0.3, 0.3, 0.3, 0.4,
    // 6-11 (morning) — waking, light usage
    0.6, 0.8, 0.7, 0.5, 0.5, 0.6,
    // 12-17 (afternoon) — kids home, partial WFH load
    0.7, 0.8, 0.9, 1.0, 1.1, 1.3,
    // 18-23 (evening) — peak streaming/gaming/video
    1.6, 1.8, 1.9, 1.7, 1.4, 0.9
];

/**
 * Time-of-day weights for business customers.
 * Inverted from residential — peaks during business hours (8am-5pm),
 * very quiet otherwise. Slight bumps for early-morning cleaners and
 * evening backups/maintenance windows.
 */
const BUSINESS_WEIGHTS = [
    // 0-5 (overnight) — infrastructure quiet
    0.2, 0.2, 0.2, 0.2, 0.2, 0.2,
    // 6-7 (early) — minor activity
    0.4, 0.6,
    // 8-17 (business hours) — peak load
    1.5, 1.7, 1.8, 1.7, 1.5, 1.6, 1.7, 1.6, 1.4, 1.2,
    // 18-23 (evening) — winding down + maintenance
    0.8, 0.5, 0.4, 0.3, 0.3, 0.3
];


class NeonovaProfileRegistry {
    /**
     * The full catalog of demo customers. Adding/removing entries here is the
     * single source of truth for the demo's allowlist. The synthetic HTTP
     * controller, the seeder, and the Add Customer modal all read from this.
     *
     * Static private field so external code can't mutate it without going
     * through the public methods below.
     */
    static #profiles = new Map([

        // ============================================================
        // STABLE RESIDENTIAL — most common archetype
        // Disconnects rare, outages short, peaks in evening
        // ============================================================
        ['mthompson', {
            friendlyName: 'Marie Thompson',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.12,
            outageMu: Math.log(60),     // ~1min median outage
            outageSigma: 1.0,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['akravchenko', {
            friendlyName: 'Andriy Kravchenko',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.18,
            outageMu: Math.log(90),
            outageSigma: 1.1,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['dpatel0421', {
            friendlyName: 'Dev Patel',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.22,
            outageMu: Math.log(75),
            outageSigma: 1.0,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['swilliams88', {
            friendlyName: 'Sarah Williams',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.10,
            outageMu: Math.log(45),
            outageSigma: 0.9,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['rgarcia2401', {
            friendlyName: 'Rita Garcia',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.16,
            outageMu: Math.log(80),
            outageSigma: 1.1,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['wparker0815', {
            friendlyName: 'Will Parker',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.14,
            outageMu: Math.log(70),
            outageSigma: 1.0,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['sgreenwood', {
            friendlyName: 'Steph Greenwood',
            flavor: 'stable-residential',
            disconnectsPerDay: 0.20,
            outageMu: Math.log(85),
            outageSigma: 1.1,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['dchen.voip', {
            friendlyName: 'Daniel Chen',
            flavor: 'stable-residential',
            // Heavy VOIP user — pays attention to reliability, premium connection
            disconnectsPerDay: 0.08,
            outageMu: Math.log(40),
            outageSigma: 0.8,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],

        // ============================================================
        // FLAKY RESIDENTIAL — visible problems, drives interesting reports
        // Disconnects frequent, outages longer with fatter tail
        // ============================================================
        ['jburke7621', {
            friendlyName: 'Jenny Burke',
            flavor: 'flaky-residential',
            disconnectsPerDay: 3.5,
            outageMu: Math.log(180),    // ~3min median outage
            outageSigma: 1.5,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['lhanson.pgh', {
            friendlyName: 'Lori Hanson',
            flavor: 'flaky-residential',
            disconnectsPerDay: 5.2,
            outageMu: Math.log(240),
            outageSigma: 1.6,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['bnguyen419', {
            friendlyName: 'Bao Nguyen',
            flavor: 'flaky-residential',
            disconnectsPerDay: 4.0,
            outageMu: Math.log(210),
            outageSigma: 1.5,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['emcfadden', {
            friendlyName: 'Erin McFadden',
            flavor: 'flaky-residential',
            disconnectsPerDay: 6.8,
            outageMu: Math.log(300),
            outageSigma: 1.7,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],
        ['twatkins.rural', {
            friendlyName: 'Tom Watkins',
            flavor: 'flaky-residential',
            // Rural / weather-affected — the worst non-special-state customer
            disconnectsPerDay: 12.0,
            outageMu: Math.log(450),    // 7.5min median, very fat tail
            outageSigma: 1.9,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'normal'
        }],

        // ============================================================
        // STABLE BUSINESS — backbone-grade reliability
        // Very few disconnects, very short outages, peaks in business hours
        // ============================================================
        ['pacific.st.node.04', {
            friendlyName: 'Pacific St Node 4',
            flavor: 'stable-business',
            disconnectsPerDay: 0.05,
            outageMu: Math.log(30),
            outageSigma: 0.7,
            timeOfDayWeights: BUSINESS_WEIGHTS,
            currentState: 'normal'
        }],
        ['bentleyville.tower.7', {
            friendlyName: 'Bentleyville Tower 7',
            flavor: 'stable-business',
            disconnectsPerDay: 0.08,
            outageMu: Math.log(45),
            outageSigma: 0.8,
            timeOfDayWeights: BUSINESS_WEIGHTS,
            currentState: 'normal'
        }],
        ['macgregor.relay', {
            friendlyName: 'MacGregor Relay',
            flavor: 'stable-business',
            disconnectsPerDay: 0.07,
            outageMu: Math.log(35),
            outageSigma: 0.7,
            timeOfDayWeights: BUSINESS_WEIGHTS,
            currentState: 'normal'
        }],
        ['denverton.school.modem', {
            friendlyName: 'Denverton School District',
            flavor: 'stable-business',
            disconnectsPerDay: 0.10,
            outageMu: Math.log(60),
            outageSigma: 0.9,
            timeOfDayWeights: BUSINESS_WEIGHTS,
            currentState: 'normal'
        }],

        // ============================================================
        // SPECIAL-STATE CUSTOMERS — drive the at-load scenarios
        // ============================================================

        /**
         * The "currently down for hours" centerpiece. At demo-load this customer
         * has been disconnected for several hours. Their reconnect is scheduled
         * 1-5 hours into the future portion of the stream, so a visitor who
         * stays around long enough sees them recover live. Underlying disconnect
         * rate is moderate so historical reports show a believable, troubled
         * customer rather than a perfect one with one freak outage.
         */
        ['chodges.mtwash', {
            friendlyName: 'Carl Hodges',
            flavor: 'currently-down',
            disconnectsPerDay: 2.0,
            outageMu: Math.log(180),
            outageSigma: 1.4,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'down-hours'
        }],

        /**
         * Just-reconnected customer. Stop 15-45min before demo-load,
         * Start 2-10min after that Stop. Visitor sees a customer who was
         * down very recently but is up now — useful for showing the
         * "recently recovered" UI state in the dashboard.
         */
        ['pmoreno1167', {
            friendlyName: 'Paula Moreno',
            flavor: 'just-reconnected',
            disconnectsPerDay: 1.2,
            outageMu: Math.log(150),
            outageSigma: 1.3,
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,
            currentState: 'just-reconnected'
        }],

        /**
         * Recently-replaced equipment. Stream contains a single Start event
         * 3-7 days ago and nothing else. The analyzer infers perfect uptime
         * since install. Useful as a "control group" — a customer who was
         * troubled, got new gear, and is now fine.
         */
        ['klindstrom.42', {
            friendlyName: 'Kris Lindstrom',
            flavor: 'recently-replaced',
            disconnectsPerDay: 0.05,    // unused (no walk runs for this state)
            outageMu: Math.log(30),     // unused
            outageSigma: 0.6,           // unused
            timeOfDayWeights: RESIDENTIAL_WEIGHTS,  // unused
            currentState: 'recently-installed'
        }]

    ]);

    /**
     * Look up a profile by RADIUS username.
     * @param {string} username
     * @returns {Object|null} the profile object, or null if not in registry
     *                        (null is the "Account Not Found" signal)
     */
    static get(username) {
        return this.#profiles.get(username) || null;
    }

    /**
     * Membership test. Useful when you need a boolean without the profile.
     */
    static has(username) {
        return this.#profiles.has(username);
    }

    /**
     * All valid usernames as an array. Used by the seeder to know what to
     * pre-populate, and (eventually) by the Add Customer modal to render
     * the "demo customers available" chip list.
     */
    static list() {
        return Array.from(this.#profiles.keys());
    }

    /**
     * All [username, profile] pairs. Used when consumers need flavor or
     * friendlyName ahead of actually calling the synthetic HTTP layer.
     */
    static all() {
        return Array.from(this.#profiles.entries());
    }

    /**
     * Convenience filter — return all usernames whose flavor matches.
     * Lets the seeder say "give me one currently-down customer, three
     * stable-residential, etc." without hardcoding usernames.
     */
    static byFlavor(flavor) {
        const out = [];
        for (const [username, profile] of this.#profiles) {
            if (profile.flavor === flavor) out.push(username);
        }
        return out;
    }
}
