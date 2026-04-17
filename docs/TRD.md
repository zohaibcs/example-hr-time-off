# Technical Requirements Document (TRD): Time-Off Microservice

## 1. Context and goals

**Product context.** ReadyOn (referred to in examples as ExampleHR) is the primary UX for employees to request time off. Human Capital Management systems (e.g. Workday, SAP SuccessFactors) remain the **source of truth** for employment and entitlement data.

**Objective.** Provide a backend microservice that:

- Exposes APIs for employees and managers to create and progress time-off requests.
- Maintains **per-employee, per-location** balance mirrors and **local reservation (pending)** state so the UI can respond quickly while staying consistent with HCM.
- Integrates with HCM through **real-time** validate/submit calls and **batch** balance ingestion when HCM pushes the full corpus (e.g. annual refresh, work-anniversary grants).

**Success criteria (measurable).**

- No approved submission is persisted without a successful HCM acknowledgement (or explicit compensating handling).
- Local “available to book” never exceeds what HCM would allow under the defensive rules defined below, assuming HCM APIs behave as specified.
- Batch ingestion can be applied idempotently and surfaces **reconciliation** when HCM truth is lower than in-flight reservations.

---

## 2. Stakeholders and user stories

| Persona   | Need |
|----------|------|
| Employee | See **accurate** balance (HCM truth minus local pending) and get **fast** validation feedback on requests. |
| Manager  | Approve/reject knowing the request was **pre-validated** with HCM and that **insufficient balance** cases are blocked or clearly surfaced. |
| Ops/SRE  | Ingest batch updates safely; observe when **HCM drift** breaks local invariants. |

---

## 3. Problem statement and challenges

### 3.1 Dual writers and drift

HCM is updated by many processes (payroll, anniversary accruals, year-start resets, manual adjustments). ReadyOn is **not** the only writer. Local caches **will** drift unless we:

- Periodically or on-demand **refresh** from HCM for critical paths.
- Apply **batch reconciliation** when HCM sends the corpus.

### 3.2 Latency vs correctness

Pure “read-through” on every UI paint avoids stale cache but overloads HCM and adds latency. A **mirror + pending reservation** model gives instant reads while keeping correctness boundaries explicit.

### 3.3 HCM API guarantees are imperfect

We assume HCM returns errors for invalid dimensions or insufficient balance **when possible**, but we **do not** rely on that alone:

- **Defensive local check** before calling HCM (`available - pending >= requested`).
- **Validate** call before creating a reservation (when HCM supports it).
- **Refresh** after successful submit to align `available` with HCM truth.

### 3.4 Concurrency

Two requests for the same bucket can race. Mitigations:

- SQLite transaction around **read projected balance → insert request → increment pending**.
- Optional **optimistic version** column on `Balance` for retry semantics (future hardening).

### 3.5 Dimensions

**Assumption (given):** balances are keyed by **`employeeId` + `locationId`**. Leave type / policy can be added later as extra dimensions without changing the core reservation pattern.

---

## 4. Proposed solution

### 4.1 Data model (logical)

**Balance (mirror + reservation)**

| Field | Meaning |
|-------|--------|
| `employeeId`, `locationId` | Composite key. |
| `availableDays` | Last known HCM entitlement for this bucket (updated by batch sync and post-submit refresh). |
| `pendingDays` | Days reserved by non-terminal in-flight requests (`pending_manager`, etc.). |
| `version` | Monotonic counter for optimistic concurrency (optional enforcement). |
| `reconciliationRequired` | Set when batch sync finds `availableDays < pendingDays`. |
| `lastSyncedAt` | Last time this row was updated from HCM batch or successful refresh. |

**Projected available (UI):**  
`projectedAvailable = availableDays - pendingDays`  
(If `reconciliationRequired`, surface warning and block new bookings until resolved.)

**Time-off request**

States: `pending_hcm_validation` → `pending_manager` → `approved` | `rejected` | `hcm_denied` | `cancelled`.

- **pending_hcm_validation:** HCM validate in flight; no pending increment until validation succeeds (implementation may collapse this step for simplicity).
- **pending_manager:** pending incremented; awaiting manager.
- **approved:** HCM submit succeeded; pending decremented; available refreshed from HCM or decremented consistently.

### 4.2 Request lifecycle (happy path)

1. **Create request (employee):**  
   - Defensive local check: `projectedAvailable >= days`.  
   - **HCM validate** (real-time).  
   - In a **transaction:** insert request `pending_manager`, `pendingDays += days`.

2. **Approve (manager):**  
   - **HCM submit** with dimensions.  
   - On success: `pendingDays -= days`; **refresh balance** from HCM GET (or apply compensating update + mark stale).  
   - Mark request `approved`.

3. **Reject / cancel:**  
   - `pendingDays -= days` if still reserved; terminal state.

### 4.3 Batch ingestion (HCM → ReadyOn)

`POST /sync/balances/batch` accepts an array of `{ employeeId, locationId, availableDays, asOf? }`.

- Upsert each balance row’s `availableDays`, set `lastSyncedAt`.
- If `availableDays < pendingDays`, set `reconciliationRequired = true` and return those rows in the response for monitoring.

**Idempotency:** same payload applied twice yields the same final state.

### 4.4 Real-time HCM integration (ReadyOn → HCM)

Abstract **HcmClient** with:

- `GET /balances/:employeeId/:locationId` — fetch current entitlement (used after submit and for diagnostics).
- `POST /time-off/validate` — pre-check entitlement and dimension validity.
- `POST /time-off/submit` — authoritative booking in HCM.

The concrete paths are implementation details; the TRD treats them as **capabilities**.

---

## 5. Alternatives considered

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| **A. Cache-only (no local pending)** | Simple storage | Cannot give instant consistent UX; double-submit risk | Rejected |
| **B. Optimistic UI + eventual HCM sync only** | Fast | Managers may approve invalid rows; trust issues | Rejected for manager workflow |
| **C. Mirror + pending (chosen)** | Fast reads; clear invariant; works with batch | Requires reconciliation when HCM < pending | **Selected** |
| **D. Saga / outbox to HCM** | Strong async guarantees | More infra (message bus, idempotency keys); higher cost | Future if HCM is often unavailable |
| **E. GraphQL API** | Flexible queries | Overkill for bounded workflows; team standard here is REST | Deferred |

---

## 6. API surface (REST)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/employees/:employeeId/balances` | List per-location balances + projected available. |
| `GET` | `/employees/:employeeId/balances/:locationId` | Single bucket. |
| `POST` | `/time-off/requests` | Create request (validates + reserves). |
| `GET` | `/time-off/requests/:id` | Request detail. |
| `POST` | `/time-off/requests/:id/approve` | Manager approve → HCM submit. |
| `POST` | `/time-off/requests/:id/reject` | Manager reject → release pending. |
| `POST` | `/time-off/requests/:id/cancel` | Employee cancel if policy allows → release pending. |
| `POST` | `/sync/balances/batch` | Ingest HCM corpus (service-to-service). |
| `GET` | `/health` | Liveness. |

**GraphQL:** Not in v1; can be a BFF layer later without changing core services.

---

## 7. Non-functional requirements

- **Storage:** SQLite for development and tests; production would target a managed RDBMS with migrations.
- **Security:** AuthN/Z omitted in this reference implementation; production would use OAuth2/OIDC and tenant scoping.
- **Observability:** Log HCM failures with correlation IDs; expose reconciliation flags on balance reads.

---

## 8. Out of scope (v1)

- Policy engines (carry-over, blackout dates, partial days).
- Multi-tenant isolation beyond string IDs.
- HR admin UI for reconciliation workflows (flags only).

---

## 9. References

- This repository: NestJS implementation, SQLite persistence, HCM mock for automated tests, and `npm run test:cov` for coverage evidence.
