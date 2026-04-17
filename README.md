# Time-Off Microservice (ExampleHR / ReadyOn)

NestJS + SQLite service that mirrors **per-employee, per-location** time-off balances from an HCM system, reserves **pending** days for in-flight requests, and integrates with HCM **validate** / **submit** APIs plus **batch** balance ingestion.

## Documentation

- **[Technical Requirements Document (TRD)](docs/TRD.md)** — problem analysis, solution, alternatives, API surface.

## Configuration

Copy `.env.example` to `.env` and set:

- `DATABASE_PATH` — SQLite file path (default `data/timeoff.sqlite`; parent directory is created at startup).
- `HCM_BASE_URL` — base URL of the HCM realtime API (validate, submit, balance read).

## Scripts

```bash
npm install
npm run start:dev
npm run build
npm run start:prod
```

## Tests and coverage

Tests include:

- **Unit / service tests** — SQLite `:memory:` with mocked HCM HTTP (`src/**/*.spec.ts`).
- **HCM mock** — Express app simulating balance validate/submit (`test/hcm-mock/`).
- **Integration tests** — full Nest app + temp SQLite + mock HCM HTTP server (`test/*.integration.spec.ts`).

```bash
npm test
npm run test:cov
```

Coverage report is written to `coverage/` (open `coverage/lcov-report/index.html` in a browser).

## Publishing to GitHub

Initialize a repository in this folder, commit, and add a remote:

```bash
git init
git add .
git commit -m "Add time-off microservice, TRD, and tests"
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/employees/:employeeId/balances` | List balances + projected available |
| GET | `/employees/:employeeId/balances/:locationId` | Single bucket |
| POST | `/time-off/requests` | Create request (HCM validate + pending reserve) |
| GET | `/time-off/requests/:id` | Request detail |
| POST | `/time-off/requests/:id/approve` | Manager approve → HCM submit + balance refresh |
| POST | `/time-off/requests/:id/reject` | Reject → release pending |
| POST | `/time-off/requests/:id/cancel` | Cancel → release pending |
| POST | `/sync/balances/batch` | Ingest HCM batch (`{ items: [...] }`) |
