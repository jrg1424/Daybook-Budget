# Daybook Budget

A small, local-first monthly budgeting app. Use it to track income and expenses, set category budgets, review date-range reports, and export a report as CSV.

This repository is also a learning project: its small vanilla JavaScript frontend and Node.js backend make the important engineering decisions visible without a frontend build system.

## Run Locally

Install the backend dependencies, then start the app server from the project directory:

```sh
npm install
npm start
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). If port 8000 is occupied, start on another port with `PORT=8001 npm start`.

Enter placeholder details on the sign-in screen. It is a demo gate, not real authentication. Do not enter a real password.

## Features

- Record, edit, and delete income and expense entries.
- Set monthly budgets, create categories, and classify budgets as needs, wants, or savings.
- Review monthly totals and activity, filter entries, and move between supported months.
- Generate date-range reports with prorated budgets, then export the report to CSV.
- Store budget data in a local SQLite database through the backend API; cache app files for offline loading with a service worker.

## How It Is Structured

The app is a static progressive web app with no server-side component:

| File | Responsibility |
| --- | --- |
| `index.html` | Accessible page structure, forms, dialogs, and navigation. |
| `styles.css` | Responsive layout and visual states. |
| `app.js` | Application state, API calls, validation, calculations, rendering, and event handlers. |
| `server.js` | Local Express server, state validation, and SQLite-backed API. |
| `tests/server.test.js` | API persistence and invalid-state tests. |
| `sw.js` | Runtime caching for same-origin GET requests and offline fallback. |
| `manifest.webmanifest` | Installable-app metadata. |
| `icon.svg` | App icon referenced by the document and manifest. |

The main flow in `app.js` is state-driven: startup loads state from `GET /api/state`, user events update `state`, `saveState()` sends changes to `PUT /api/state`, and `render()` refreshes the views. The backend validates and stores each state snapshot in SQLite. Reports are generated for a selected date range and kept in `latestReport` for CSV export.

The API starts with an empty database. On first startup, it imports existing valid budget data from this browser's previous local storage, if available. After that, SQLite is authoritative. The profile display name remains in browser storage.

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
- Budget data is stored in `.data/daybook.sqlite`; the directory is excluded from Git. Clearing browser site data does not delete the database, but deleting the database file does.
- The backend stores a validated JSON state snapshot in SQLite to preserve the existing frontend data model. This keeps the initial API small; a multi-user system would need account ownership and per-user data isolation.
- API writes are serialized by the browser and each SQLite snapshot update is atomic. Failed requests show an error, but the app does not yet retry or roll back an in-memory change.

Treat the stored JSON as untrusted input. `readState()` checks only a small part of its shape; production software would validate and migrate persisted data before using it.

## Offline Behavior

`sw.js` uses a network-first strategy for app files and excludes `/api/` responses. Successful static responses are cached, and a cached response is returned if the network request fails. Budget data still requires the local backend to be running. When changing cache behavior, remember to update `CACHE_NAME` so existing installations can move to a new cache version.

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

## Backend Safety And Limitations

- The sign-in screen is a demo gate only. It does not authenticate or authorize anyone; all browser sessions using this local server share the same database.
- The server binds to `127.0.0.1` and has no authentication. Do not expose it to a network or deploy it for real users.
- The database has no automatic backup or synchronization. Back up `.data/daybook.sqlite` while the server is stopped.
- Run the backend tests with `npm test`. There is no frontend test runner or build pipeline yet.
- The app supports months from January 2026 through December 2029; the range is currently fixed in the UI and JavaScript.
- The database is not encrypted by this app. Avoid storing sensitive real financial data.

## Suggested First Contributions

- Add unit tests for currency conversion, month selection, and report budget proration.
- Replace the single shared state snapshot with per-user records only after adding real authentication and authorization.
- Add JSON export and import with schema validation and a clear overwrite/merge policy.
- Add a storage schema version and a migration test using a saved older-format fixture.
- Make the supported month range derive from a single documented rule.
- Test keyboard-only use, screen-reader announcements, narrow mobile layouts, and offline reloads.

## Programmer Joke

Why did the developer bring a ladder to work? To reach the high-level language.
