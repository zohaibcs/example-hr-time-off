# Time-Off Microservice (ExampleHR / ReadyOn)

NestJS + SQLite service that mirrors **per-employee, per-location** time-off balances from an HCM system (Workday / SAP etc.), reserves **pending** days for in-flight requests, and integrates with HCM's realtime **validate** / **submit** APIs plus **batch** balance ingestion.

- **[Technical Requirements Document (TRD)](docs/TRD.md)** — problem analysis, chosen design, alternatives, API surface.

---

## Requirements

- **Node.js 18 or newer** (tested with Node 20). Check with `node -v`.
- **npm** (bundled with Node).
- Windows, macOS, or Linux. Examples below use **PowerShell**.

No external database is needed — SQLite runs embedded and the data file is created automatically.

---

## 1. Install

```powershell
# from the project root (d:\ExamplHRTool or wherever you cloned it)
npm install
```

This installs NestJS, TypeORM, SQLite, validation, and the test tooling.

---

## 2. Configure environment

Copy the example file once and edit values if needed.

```powershell
Copy-Item .env.example .env
```

`.env` controls:

| Variable | Default | Meaning |
|----------|---------|--------|
| `PORT` | `3000` | HTTP port the API listens on. |
| `DATABASE_PATH` | `data/timeoff.sqlite` | SQLite file path. The parent folder is created on boot. Delete the file to reset local data — it will be recreated on next run. |
| `HCM_BASE_URL` | `http://127.0.0.1:4000` | Base URL of the HCM realtime API. Points at the bundled mock by default. |
| `HCM_TIMEOUT_MS` | `10000` | Axios timeout for HCM calls. |

`.env` is git-ignored. `.env.example` is checked in as a template.

---

## 3. Run the service

You normally want two terminals: one for the **HCM mock** (so `/time-off/*` endpoints can validate/submit) and one for the **API** itself.

### 3a. Start the HCM mock (terminal 1)

```powershell
npm run demo:hcm
```

- Listens on `http://127.0.0.1:4000`.
- Pre-seeded from [`demo/seed-payload.json`](demo/seed-payload.json): `demo-emp` has 15 days at `hq` and 8 days at `branch-01`.
- Implements `GET /balances/:employeeId/:locationId`, `POST /time-off/validate`, `POST /time-off/submit`.
- Pure Node (no extra deps). Stop with **Ctrl+C**.

### 3b. Start the API (terminal 2)

Development (watch mode, auto-restarts on file change):

```powershell
npm run start:dev
```

Production-style run:

```powershell
npm run build
npm run start:prod
```

On startup you should see `Nest application successfully started` and all routes mapped. The API is now reachable at `http://127.0.0.1:3000` (or whatever `PORT` you set).

### 3c. Seed the API's balance mirror (optional but recommended)

With both the mock and API running, in a third terminal:

```powershell
npm run demo:seed
```

This POSTs `demo/seed-payload.json` to `/sync/balances/batch`.

---

## 4. API reference with sample payloads and responses

Base URL in all examples: `http://127.0.0.1:3000`.

All request bodies are `application/json`. All responses are `application/json`. Timestamps are ISO-8601 UTC. Dates are `YYYY-MM-DD`.

### 4.1 `GET /health`

Liveness check.

Response `200 OK`:

```json
{ "status": "ok" }
```

---

### 4.2 `GET /employees/:employeeId/balances`

List every balance bucket for an employee.

Example: `GET /employees/demo-emp/balances`

Response `200 OK`:

```json
[
  {
    "employeeId": "demo-emp",
    "locationId": "branch-01",
    "availableDays": 8,
    "pendingDays": 0,
    "projectedAvailableDays": 8,
    "reconciliationRequired": false,
    "lastSyncedAt": "2026-04-18T12:00:00.000Z"
  },
  {
    "employeeId": "demo-emp",
    "locationId": "hq",
    "availableDays": 15,
    "pendingDays": 0,
    "projectedAvailableDays": 15,
    "reconciliationRequired": false,
    "lastSyncedAt": "2026-04-18T12:00:00.000Z"
  }
]
```

If the employee has no rows yet, the array is empty.

---

### 4.3 `GET /employees/:employeeId/balances/:locationId`

Single bucket.

Example: `GET /employees/demo-emp/balances/hq`

Response `200 OK`:

```json
{
  "employeeId": "demo-emp",
  "locationId": "hq",
  "availableDays": 15,
  "pendingDays": 2,
  "projectedAvailableDays": 13,
  "reconciliationRequired": false,
  "lastSyncedAt": "2026-04-18T12:00:00.000Z"
}
```

Response `404 Not Found` when the bucket doesn't exist:

```json
{
  "statusCode": 404,
  "message": "No balance for demo-emp / missing-loc",
  "error": "Not Found"
}
```

---

### 4.4 `POST /sync/balances/batch`

Ingest HCM's corpus of balances (batch). Upserts each row; flags `reconciliationRequired` when `availableDays < pendingDays`.

Request body:

```json
{
  "items": [
    {
      "employeeId": "demo-emp",
      "locationId": "hq",
      "availableDays": 15,
      "asOf": "2026-04-18T12:00:00.000Z"
    },
    {
      "employeeId": "demo-emp",
      "locationId": "branch-01",
      "availableDays": 8
    }
  ]
}
```

Field notes:

- `items[].availableDays` — number, required, `>= 0`.
- `items[].asOf` — optional ISO-8601 timestamp; defaults to "now" on the server.

Response `201 Created`:

```json
{
  "applied": 2,
  "reconciliationFlagged": []
}
```

When HCM truth drops below in-flight pending, the row appears in `reconciliationFlagged`:

```json
{
  "applied": 1,
  "reconciliationFlagged": [
    {
      "employeeId": "demo-emp",
      "locationId": "hq",
      "availableDays": 1,
      "pendingDays": 3
    }
  ]
}
```

---

### 4.5 `POST /time-off/requests`

Create a time-off request. Flow: defensive local check → HCM validate → DB transaction that reserves `pendingDays`.

Request body:

```json
{
  "employeeId": "demo-emp",
  "locationId": "hq",
  "startDate": "2026-06-10",
  "endDate": "2026-06-12",
  "days": 2
}
```

Field notes:

- `days` — number, required, `> 0`. Can be fractional (e.g. `0.5`).
- All fields are required. Unknown properties are rejected by validation.

Response `201 Created`:

```json
{
  "id": "4d2c2f2a-7e6b-4e0a-8a63-08a6d5c0b123",
  "status": "pending_manager",
  "employeeId": "demo-emp",
  "locationId": "hq",
  "days": 2,
  "startDate": "2026-06-10",
  "endDate": "2026-06-12"
}
```

Common error responses:

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `"Insufficient projected balance (have 1, need 2)"` | Local `available - pending < days`. Seed balances or reduce `days`. |
| `400` | `"Insufficient in HCM"` | HCM validate said no. |
| `400` | `"HCM unavailable"` | HCM mock/API unreachable or timed out. |
| `400` | `["days must not be less than 0.01", ...]` | DTO validation; check the request body. |

---

### 4.6 `GET /time-off/requests/:id`

Fetch a single request.

Example: `GET /time-off/requests/4d2c2f2a-7e6b-4e0a-8a63-08a6d5c0b123`

Response `200 OK`:

```json
{
  "id": "4d2c2f2a-7e6b-4e0a-8a63-08a6d5c0b123",
  "employeeId": "demo-emp",
  "locationId": "hq",
  "startDate": "2026-06-10",
  "endDate": "2026-06-12",
  "days": 2,
  "status": "pending_manager",
  "hcmSubmissionId": null,
  "createdAt": "2026-04-18T21:30:00.000Z",
  "updatedAt": "2026-04-18T21:30:00.000Z"
}
```

Response `404 Not Found` when the UUID is unknown.

`status` is one of: `pending_manager`, `approved`, `rejected`, `hcm_denied`, `cancelled`.

---

### 4.7 `POST /time-off/requests/:id/approve`

Manager approve. Submits to HCM; on success clears `pendingDays` and refreshes `availableDays` from HCM. No request body required.

Example: `POST /time-off/requests/4d2c2f2a-…/approve`

Response `201 Created`:

```json
{
  "id": "4d2c2f2a-7e6b-4e0a-8a63-08a6d5c0b123",
  "employeeId": "demo-emp",
  "locationId": "hq",
  "startDate": "2026-06-10",
  "endDate": "2026-06-12",
  "days": 2,
  "status": "approved",
  "hcmSubmissionId": "b27d6e14-c7c0-4c84-8c65-e8b1e6a5c712",
  "createdAt": "2026-04-18T21:30:00.000Z",
  "updatedAt": "2026-04-18T21:32:10.000Z"
}
```

Errors:

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `"Request is not awaiting manager approval"` | Already terminal state. |
| `400` | `"HCM submit denied"` | HCM rejected submit. |
| `400` | `"HCM unavailable"` | HCM unreachable. |
| `404` | `"<id>"` | Unknown request id. |

---

### 4.8 `POST /time-off/requests/:id/reject`

Reject a pending request and release its pending reservation. No request body required.

Response `201 Created` (same shape as 4.6, with `status: "rejected"`).

Errors:

- `400 "Request is not pending manager"` — already terminal.
- `404` — unknown request id.

---

### 4.9 `POST /time-off/requests/:id/cancel`

Employee cancel. Same behavior as reject but sets `status: "cancelled"`. No request body required.

---

## 5. End-to-end example (PowerShell)

Seed balances, create a request, approve it, and verify balances.

```powershell
# 0) Seed via batch (same content as demo/seed-payload.json)
$seed = @{
  items = @(
    @{ employeeId = 'demo-emp'; locationId = 'hq';        availableDays = 15 },
    @{ employeeId = 'demo-emp'; locationId = 'branch-01'; availableDays = 8  }
  )
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method POST `
  -Uri http://127.0.0.1:3000/sync/balances/batch `
  -ContentType 'application/json' -Body $seed

# 1) Read balance
Invoke-RestMethod http://127.0.0.1:3000/employees/demo-emp/balances/hq

# 2) Create request
$body = @{
  employeeId = 'demo-emp'
  locationId = 'hq'
  startDate  = '2026-06-10'
  endDate    = '2026-06-12'
  days       = 2
} | ConvertTo-Json
$created = Invoke-RestMethod -Method POST `
  -Uri http://127.0.0.1:3000/time-off/requests `
  -ContentType 'application/json' -Body $body
$created

# 3) Approve it
Invoke-RestMethod -Method POST `
  "http://127.0.0.1:3000/time-off/requests/$($created.id)/approve"

# 4) Confirm balance dropped
Invoke-RestMethod http://127.0.0.1:3000/employees/demo-emp/balances/hq
```

Expected after step 4:

```json
{
  "employeeId": "demo-emp",
  "locationId": "hq",
  "availableDays": 13,
  "pendingDays": 0,
  "projectedAvailableDays": 13,
  "reconciliationRequired": false,
  "lastSyncedAt": "2026-04-18T21:32:10.000Z"
}
```

---

## 6. Tests and coverage

The test suite covers unit, integration, and end-to-end scenarios — including a bundled in-process HCM mock.

| Location | Role |
|----------|------|
| `src/**/*.spec.ts` | Service + HCM client unit tests (SQLite `:memory:`, mocked HTTP). |
| `test/hcm-mock/` | Express-based HCM mock used by integration tests. |
| `test/*.integration.spec.ts` | Full Nest app + temp SQLite + live HTTP to the HCM mock. |

Run everything:

```powershell
npm test
```

With coverage report:

```powershell
npm run test:cov
```

Coverage is written to `coverage/`. Open `coverage/lcov-report/index.html` in a browser for the line-by-line report. Current statement coverage is **~90%**.

---

## 7. Project layout

```
src/
  app.module.ts            # wires TypeORM + modules
  main.ts                  # bootstrap, CORS, validation pipe
  entities/                # Balance, TimeOffRequest
  balances/                # GET balances endpoints
  requests/                # POST create/approve/reject/cancel
  sync/                    # POST /sync/balances/batch
  hcm/                     # HcmService (axios client for HCM)
  health.controller.ts

test/                      # integration tests + in-process HCM mock
docs/TRD.md                # technical requirements doc
demo/                      # optional: seed JSON + HCM mock (safe to delete)
```

---

## 8. Troubleshooting

- **`/time-off/requests` returns 400 "HCM unavailable"** — the HCM mock is not running. Start it with `npm run demo:hcm`, or point `HCM_BASE_URL` at a real HCM.
- **`/time-off/requests` returns 400 "Insufficient projected balance"** — the employee/location has not been seeded. Run `npm run demo:seed` or POST your own body to `/sync/balances/batch`.
- **`/time-off/requests` returns 400 "Insufficient in HCM"** — HCM mock doesn't have enough balance for that employee/location. Restart it (it reloads `demo/seed-payload.json`), or lower `days`.
- **Stuck data** — delete `data/timeoff.sqlite` while the API is stopped; it is recreated on next run.

---

## 9. Cleanup

Anything under `demo/`, `data/`, `coverage/`, and `dist/` is disposable:

- `demo/` — delete the folder if you don't want the HCM mock and seed scripts. See `demo/DELETE-THIS-FOLDER.txt`.
- `data/timeoff.sqlite` — delete to reset local data.
- `coverage/`, `dist/` — regenerated by `npm run test:cov` / `npm run build`.

All four paths are `.gitignore`d already.
