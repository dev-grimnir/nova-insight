# Nova-Insight Architecture

## Overview

Nova-Insight is a Tampermonkey userscript dashboard for monitoring RADIUS customer connection status. It runs inside the authenticated RADIUS admin portal, scrapes live event logs, performs statistical analysis, and presents an interactive multi-tab customer management interface with snapshot and reporting capabilities.

All sensitive data at rest is AES-256-GCM encrypted. Updates are polling-based (no WebSocket). There is no separate build step — the script is delivered directly via Tampermonkey.

---

## MVC Structure

The codebase strictly separates concerns into three layers:

- **Models** (`src/models/`) — pure data containers with `toJSON()` / `static fromJSON()` serialization
- **Controllers** (`src/controllers/`) — business logic, state management, orchestration; controllers create other controllers
- **Views** (`src/views/`) — DOM rendering and event wiring only; views are dumb and receive everything from the controller

Private methods throughout use JavaScript's `#method` syntax. Static utility classes (`NovaAnalyzer`, `NovaCollector`, `NovaCryptoController`, `NovaHTTPController`) have no instance state.

---

## Entry Point & Delivery

| Item | Value |
|---|---|
| Script type | Tampermonkey userscript |
| Match | `https://admin.neonova.net/*` |
| Run-at | `document-end`, main frame only |
| External deps | Chart.js 4.4.1, Tailwind CSS (both CDN `@require`) |

`nova-dashboard.user.js` is the entry point. It calls `NovaDashboardController.create()`, which is the static factory for the entire application.

---

## Source Map

```
src/
  config.js                          Base URL constant for RADIUS admin portal
  core/
    utils.js                         formatDuration(), session bonus calculation
    nova-toast.js                    Static error toast (fixed, z-10010, auto-dismiss)
  controllers/
    nova-http-controller.js          HTTP scraping, pagination, HTML parsing
    nova-collector.js                Entry dedup and cleaning
    nova-analyzer.js                 Statistical analysis and metric computation
    nova-crypto-controller.js        AES-256-GCM encryption (static)
    nova-dashboard-controller.js     Top-level orchestration, polling, crypto init
    nova-tab-controller.js           Tab groups, customer list, alerting state machine
    nova-customer-controller.js      Single customer lifecycle
    nova-snapshot-controller.js      Snapshot data pipeline and drill-down history
    nova-report-controller.js        Report data container + inline snapshot factory
    nova-report-order-controller.js  Date range picker modal
    nova-progress-controller.js      Report generation orchestration + progress UI
    nova-admin-controller.js         Single admin contact
    nova-admin-manager-controller.js Admin contacts list (encrypted)
    nova-add-customer-controller.js  Add customer modal + validation
    nova-notifier-controller.js      Alert dispatch
    nova-passphrase-controller.js    Passphrase entry modal
  models/
    log-entry.js                     Timestamp + status ("Start"/"Stop") + dateObj
    nova-customer-model.js           Single customer: identity, status, 24h event buffer
    nova-dashboard-model.js          Customer list, polling config, encrypted settings blob
    nova-tab-model.js                Tab metadata + customer controller array
    nova-snapshot-model.js           Immutable point-in-time snapshot with metrics
    nova-report-model.js             Report metadata: metrics, entry count, long disconnects
    nova-admin-model.js              Admin contact: name + normalized phone
    nova-admin-manager-model.js      Admin contacts list
    nova-daily-disconnect-model.js   Date + event list for a single day view
  views/
    base-nova-view.js                Loads Tailwind, panel create/show/hide, scoped $()
    nova-base-modal-view.js          Modal lifecycle: fade-in, Escape, fade-out, events
    nova-dashboard-view.js           Main dashboard panel, minimize, header, tab bar
    nova-tab-view.js                 Table body rendering, drag-and-drop rows
    nova-customer-view.js            Single customer row, inline name edit, action buttons
    nova-inline-snapshot-view.js     24h mini SVG timeline bar (redrawn each poll)
    nova-snapshot-view.js            Snapshot modal chrome (wraps NovaSnapshotPanelView)
    nova-snapshot-panel-view.js      Shared snapshot paradigm: header ribbon + chart + drill-down
    nova-snapshot-chart.js           Chart.js builder (connection timeline, tick drill targets)
    nova-report-view.js              Report modal: inline snapshot, hourly chart, stats, exports
    nova-report-snapshot-view.js     Inline snapshot variant for embedding inside reports
    nova-report-order-view.js        Date range picker UI (presets + custom picker)
    nova-progress-view.js            Progress bar modal with cancel button
    nova-passphrase-view.js          Passphrase entry with "remember on device" checkbox
    nova-add-customer-view.js        Add customer form with validation
    nova-admin-manager-view.js       Admin contacts modal: table + add form + inline edit
    nova-admin-view.js               Single admin contact row
    nova-daily-disconnect-view.js    Daily timeline EKG chart (exists, not wired to UI)
    nova-spinner-view.js             Loading spinner
  scripts/
    nova-dashboard.user.js           Entry point
```

---

## Application Startup

```
nova-dashboard.user.js
  └─ NovaDashboardController.create()        static factory
       ├─ NovaCryptoController.initMasterKey()
       │    └─ if no stored key → show NovaPassphraseView
       ├─ load tabs from localStorage (decrypt)
       ├─ load settings from localStorage (decrypt)
       ├─ build NovaTabController
       └─ start polling loop
```

---

## Data Flow: Polling

```
NovaDashboardController.poll()
  └─ for each tab → for each customer:
       ├─ NovaHTTPController.getLatestEntry()     HTTP scrape
       ├─ NovaCustomerModel.ingestEvents()        merge + dedupe + 24h clip
       ├─ compute status + duration from buffer
       └─ NovaTabController.#evaluateAlerting()
            └─ NovaNotifierController (if threshold met)
```

**Cold start**: Progressive lookback widening (1d → 7d → 30d → 90d → 6m → 11m) until events are found.
**Steady state**: Incremental fetch from buffer tail with a 1-minute overlap.

---

## Data Flow: Report Generation

```
NovaCustomerView [Report button]
  └─ NovaReportOrderController     date range picker
       └─ NovaProgressController   orchestrates generation
            ├─ NovaHTTPController.paginateReportLogs()   paginated scrape (100/page)
            ├─ NovaCollector.cleanEntries()              dedupe + sort
            ├─ NovaAnalyzer.computeMetrics()             full statistical pass
            └─ NovaReportController
                 └─ NovaReportView
                      ├─ inline snapshot (seeded, no HTTP)
                      ├─ hourly Chart.js bar chart
                      ├─ key statistics table
                      ├─ long disconnects collapsible table
                      └─ export buttons (CSV / HTML / PDF)
```

---

## Data Flow: Snapshot & Drill-Down

```
NovaCustomerView [status dot or 24h cell]
  └─ NovaSnapshotController
       ├─ buildData()              HTTP fetch → clean → analyze → model
       └─ NovaSnapshotView
            └─ NovaSnapshotPanelView
                 ├─ header ribbon  (status, uptime, disconnects, session stats...)
                 └─ NovaSnapshotChart
                      └─ tick click → drillTo(range)
                           └─ buildFromEvents()   reuses in-memory events, no HTTP
                                └─ history stack (goBack() pops)
```

When a snapshot is embedded inside a report, `NovaReportController.createInlineSnapshot()` seeds the snapshot model from the already-fetched report data and mounts it via `NovaReportSnapshotView` — no additional HTTP call.

---

## NovaAnalyzer: Metrics Output

Every snapshot and report runs through `NovaAnalyzer.computeMetrics()`. The returned object:

```
{
  // Connection state
  percentConnected, daysSpanned,
  totalConnectedSec, totalDisconnectedSec,
  finalState,           // 'up' | 'down' — state at end of window
  lastTransitionMs,     // timestamp of last state change

  // Disconnects
  disconnects,
  longDisconnects[],    // outages > 30 min: { stopDate, startDate, durationSec }
  hourlyDisconnects[],  // [0..23] count per hour
  dailyCount{},         // date string → count

  // Sessions
  avgSessionMin, longestSessionMin, shortestSessionMin,

  // Reconnects
  avgReconnectMin, medianReconnectMin,
  timeSinceLastStr,

  // Peak analysis
  peakHourStr, peakDayStr,
  businessDisconnects, offHoursDisconnects,

  // Monthly bar data
  monthlyBuckets[],     // { year, month, startDate, endDate, connectedSec, ... }

  // Provenance
  totalResultsCounted, ignoredAsDuplicates, monitoringPeriod
}
```

**Boundary handling**: If the first log entry is after `requestedStart`, the analyzer injects an opposite-status entry at the boundary so the leading dead space is correctly accounted for. The trailing end is handled by `#calculateEndTime` (pure delta, no injection).

---

## Encryption

| Item | Stored as |
|---|---|
| Customer tabs + all customer models | Encrypted blob in `novaDashboardTabs` |
| Admin contacts | Encrypted blob in `novaDashboardAdmins` |
| Dashboard settings | Encrypted blob in `novaDashboardSettings` |
| Raw AES key (if "remember device") | `novaDashboardMasterKey` (base64) |
| Event history | In-memory only, never persisted |

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2, 100,000 iterations, random salt
- IV: Fresh 12-byte random IV per encryption operation
- No passphrase is ever stored — only the derived key

---

## View Base Classes

**`BaseNovaView`**: Loads Tailwind dynamically, creates/shows/hides the panel, provides a `$(selector)` helper scoped to the panel element.

**`NovaBaseModalView`** (extends `BaseNovaView`): Adds modal lifecycle — two-rAF paint-before-transition pattern, Escape key listener, fade-out + DOM cleanup, and custom event dispatch (`nova:modal-opened` / `nova:modal-closed`).

---

## Snapshot Panel Ribbon

The snapshot header right-side ribbon surfaces all key metrics without requiring a full report:

| Row | Stats |
|---|---|
| 1 | Current/End Status · Uptime % · Disconnects · Last Drop · Long Disconnects |
| 2 | Avg Session · Longest Session · Avg Reconnect · Business Hrs · Off-Hours |

"Current Status" is shown when the window ends within 10 minutes of now; otherwise "End Status". Long Disconnects shows a fixed-position scrollable tooltip (`z-10100`, appended to `document.body` to escape modal `overflow-hidden` clipping).

---

## Report Exports

| Format | Mechanism |
|---|---|
| CSV | Plain text metrics + long disconnects table, direct download |
| HTML | Self-contained file: snapshot chart embedded as base64 PNG, hourly chart as live interactive Chart.js with serialized data, full stats and long disconnects tables |
| PDF | Generates the same HTML document, opens in new tab, calls `window.print()` — no third-party library |

---

## localStorage Keys

| Key | Contents |
|---|---|
| `novaDashboardMasterKey` | Raw AES key (base64), only present if "remember on device" was chosen |
| `novaDashboardTabs` | Encrypted: all tabs + customer models |
| `novaDashboardSettings` | Encrypted: polling interval, privacy mode, etc. |
| `novaDashboardAdmins` | Encrypted: admin contacts list |

---

## Alerting State Machine

Managed by `NovaTabController.#evaluateAlerting()`:

1. **Startup**: If already disconnected, backfill the disconnect timestamp from the actual log event (not `Date.now()`)
2. **Connected → Disconnected**: Record disconnect time, clear alert-sent flag
3. **Still disconnected + elapsed > 5 min + no alert sent**: Fire alert via `NovaNotifierController`, mark sent
4. **Disconnected → Connected**: Send recovery alert if an outage alert was sent; clear all flags

`NovaNotifierController` currently dispatches via `window.alert()` — stub ready for SMS integration.

---

## Known Gaps

- **No SMS**: Notifier is a stub; real transport not yet implemented
- **Daily disconnect view**: `NovaDailyDisconnectView` exists but is not wired to any UI trigger
- **No offline support**: All runtime data is in-memory; no service worker or cache layer
- **No real-time push**: Polling only; interval configurable from 1–60 minutes
