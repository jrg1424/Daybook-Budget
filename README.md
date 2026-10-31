# Daybook Budget

A small, local-first monthly budgeting app. Use it to track income and expenses, set category budgets, review date-range reports, and export a report as CSV.

This repository is also a learning project: its intentionally small vanilla JavaScript codebase makes the important engineering decisions visible without a framework or build system in the way.

## Run Locally

There is no install or build step. From the project directory, start a static web server:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). Use an HTTP server rather than opening `index.html` directly: the app uses browser storage and registers a service worker only on supported origins.

Enter placeholder details on the sign-in screen. It is a demo gate, not real authentication. Do not enter a real password.

## Features

- Record, edit, and delete income and expense entries.
- Set monthly budgets, create categories, and classify budgets as needs, wants, or savings.
- Review monthly totals and activity, filter entries, and move between supported months.
- Generate date-range reports with prorated budgets, then export the report to CSV.
- Keep data in this browser using `localStorage`; cache app files for offline loading with a service worker.

## How It Is Structured

The app is a static progressive web app with no server-side component:

| File | Responsibility |
| --- | --- |
| `index.html` | Accessible page structure, forms, dialogs, and navigation. |
| `styles.css` | Responsive layout and visual states. |
| `app.js` | Application state, persistence, validation, calculations, rendering, and event handlers. |
| `sw.js` | Runtime caching for same-origin GET requests and offline fallback. |
| `manifest.webmanifest` | Installable-app metadata. |
| `icon.svg` | App icon referenced by the document and manifest. |

The main flow in `app.js` is state-driven: user events validate and update `state`, `saveState()` persists it, and `render()` refreshes the overview and activity views. Reports are generated for a selected date range and kept in `latestReport` for CSV export.

## Data Model And Important Decisions

The stored state has three top-level collections:

```js
{
	categories: [{ id, name, budget, classification }],
	transactions: [{ id, kind, amount, categoryId, category, date, note, createdAt }],
	monthlyBudgets: { "YYYY-MM": { "category-id": amountInCents } }
}
```

- Money is stored as integer cents to avoid accumulating floating-point currency errors. Form values are converted to cents when saved.
- A transaction's `date` is an ISO-style `YYYY-MM-DD` string, which makes chronological comparisons and month filtering straightforward.
- Monthly budget overrides carry forward: the app uses the most recent override on or before the selected month. Reports prorate each month's budget by the number of selected days in that month.
- The app stores data in browser-local storage, not in an account or cloud database. Clearing site data removes it, and another browser or device will not see it.
- `localStorage` is synchronous and has limited capacity. `saveState()` catches write failures, but this is not a substitute for backup, synchronization, or durable storage.

Treat the stored JSON as untrusted input. `readState()` checks only a small part of its shape; production software would validate and migrate persisted data before using it.

## Offline Behavior

`sw.js` uses a network-first strategy for same-origin GET requests. Successful responses are cached, and a cached response is returned if the network request fails. The install step pre-caches the app shell. When changing cache behavior, remember to update `CACHE_NAME` so existing installations can move to a new cache version.

To check offline behavior, load the app once over HTTP, then use your browser's developer tools to switch the network to offline and reload. Browser storage and service-worker behavior can vary, so test in the browsers you intend to support.

## A Senior-Level Learning Path

Use each step to practice explaining the trade-offs, not just making the feature work.

1. **Trace a user action.** Follow “save an expense” from the form submit handler through validation, the state update, persistence, and rendering. Draw the call flow and identify which functions mutate state.
2. **Make money rules explicit.** Add tests for cents conversion, zero and invalid amounts, month boundaries, and prorated budgets. Decide how rounding should work and document the rule before changing the implementation.
3. **Separate domain logic from the DOM.** Extract calculations such as `totalsFor()` and `dateRangeBudget()` into pure functions. Give them focused tests before reorganizing UI code.
4. **Protect persisted data.** Define a schema version, validate every loaded collection, and add migrations so future data-model changes do not break existing users.
5. **Improve resilience.** Design an export/import backup flow and handle quota failures, corrupted storage, and unavailable browser APIs. Be clear about what recovery is possible without a server.
6. **Review security boundaries.** Replace the demo sign-in if real identities are required; never treat client-side checks as authentication. Consider sensitive data on shared devices, safe rendering of user input, and spreadsheet formula injection in CSV exports.
7. **Measure before optimizing.** Add realistic data-volume tests, profile report generation and rendering, and optimize only after identifying a bottleneck.
8. **Define release confidence.** Add automated tests for domain rules and key user flows, then document supported browsers, accessibility checks, offline expectations, and a release checklist.

For every change, write down the behavior it promises, the failure cases, and how you would verify it. That is the habit this project is meant to help build.

## Current Limitations

- Sign-in accepts any required email and passcode and only gates the demo UI for the current browser session. It does not authenticate or authorize anyone.
- Data is local to one browser profile and has no automatic backup or synchronization.
- There is no automated test runner, dependency manager, or build pipeline in this repository yet.
- The app supports months from January 2026 through December 2029; the range is currently fixed in the UI and JavaScript.
- Browser storage is not encrypted by this app. Avoid using real financial or account credentials in the demo.

## Suggested First Contributions

- Add unit tests for currency conversion, month selection, and report budget proration.
- Add JSON export and import with schema validation and a clear overwrite/merge policy.
- Add a storage schema version and a migration test using a saved older-format fixture.
- Make the supported month range derive from a single documented rule.
- Test keyboard-only use, screen-reader announcements, narrow mobile layouts, and offline reloads.
