# HRM k6 performance tests

## Plan and inspected application contract

The implementation leaves the React app, Express routes, authentication, business logic, and MongoDB models unchanged. It adds a k6-only harness around the existing API.

- Frontend API calls use same-origin `/api/*`; the Express API is mounted at `/api`, with a database-free `GET /health` at the host root and `GET /api/health` reporting MongoDB connection state.
- Authentication is `POST /api/auth/login` with email/password, a bearer access JWT in `accessToken`, and an HTTP-only `cyethack_refresh` cookie. `POST /api/auth/refresh` rotates the cookie and returns another access JWT. Protected routes use `Authorization: Bearer <token>`.
- Access tokens default to 15 minutes. The test VU holds its own token and cookie jar, refreshes before expiry, and never writes credentials or tokens into output.
- MongoDB uses Mongoose's default connection pool (no `maxPoolSize`/`minPoolSize` override found) and a 10-second server selection timeout.
- Express applies a 1,000-request-per-IP/15-minute API limiter, a 20-login-attempts-per-IP/15-minute login limiter, a 1 MB JSON body limit, and CORS restricted to `FRONTEND_URL`. No application-level request timeout was found.
- Document bytes use the configured storage provider (Cloudflare R2 in production); document uploads have a 10 MB default cap and a separate per-user upload limiter. Uploads and PDF generation are excluded from the default workload to avoid external cost and persistent writes.
- Login is not read-only: it writes refresh-token and login-session documents and may create related notifications. Refresh rotates persisted tokens. Cleanup is available only for the dedicated `cyethack_hrm_k6` database.
- The route registry mounts: `/auth`, `/users`, `/employees`, `/leaves`, `/attendance`, `/payroll`, `/hiring`, `/performance`, `/projects`, `/documents`, `/notices`, `/helpdesk`, `/offboarding`, `/org-chart`, `/reports`, `/analytics`, `/audit`, `/daily-reports`, `/permissions`, `/payslip-requests`, `/requirements`, `/transfers`, `/sessions`, `/dashboard`, `/bootstrap`, `/todos`, `/departments`, `/designations`, `/leave-types`, `/calendar`, `/salary-structures`, `/employee-documents`, `/training`, `/certifications`, `/notifications`, `/calendar-policy`, `/transfer-tickets`, and `/team-tasks`. Each feature router defines additional operations; only the explicitly inventoried endpoints below are exercised by default.

## Test inventory

| Endpoint and method | Authentication / role | Request parameters | Expected status | Effect |
|---|---|---|---:|---|
| `GET /health` | None | None | 200 | Read-only liveness |
| `POST /api/auth/login` | Public; dedicated test account for the selected role | JSON `email`, `password` | 200 | Writes login session and refresh token; may notify assigned test HR/manager |
| `POST /api/auth/refresh` | Refresh cookie created by this VU's login | Cookie; no body | 200 | Rotates persisted refresh token |
| `GET /api/auth/me` | Bearer token; all five roles | `Authorization` header | 200 | Read-only authenticated profile |
| `GET /api/dashboard` | Bearer token; role-scoped | `Authorization` header | 200 | Read-only summary |
| `GET /api/employees` | Bearer token; row/permission-scoped | `Authorization` header; no explicit query parameters | 200 | Read-only employee listing |
| `GET /api/attendance/me` | Bearer token; own record | `Authorization` header | 200 | Read-only own attendance |
| `GET /api/leaves` | Bearer token; own/team/company-scoped | `Authorization` header | 200 | Read-only leave listing |
| `GET /api/notifications/unread-count` | Bearer token; own notifications | `Authorization` header | 200 | Read-only count |
| `GET /api/payroll` | Bearer token; own/company-scoped | `Authorization` header | 200 | Read-only payroll listing |
| `GET /api/reports/me` | Bearer token; own report | `Authorization` header | 200 | Read-only report |
| `GET /api/analytics/overview` | `analytics:read`; HR, Manager, Admin, Super Admin | Employee bearer token | 403 | Intentional authorization-denial check; counted as expected, not a failed request |

Expected denial checks use only the employee account and the API's actual permission gate. No attendance, leave, payroll, document, or employee business writes are generated. No production employee or business records are read by design; use a dedicated test database with synthetic fixtures.

## Install

On Windows, install k6 with winget:

```powershell
winget install --id Grafana.k6 --exact
k6 version
```

For other operating systems, use the official [k6 installation guide](https://grafana.com/docs/k6/latest/set-up/install-k6/). No npm dependency is required.

## Isolated local smoke tests

The local helper uses the repository's existing `mongodb-memory-server` dependency and starts a fresh, disposable MongoDB plus the real Express app on a dynamically assigned loopback port. It creates cryptographically random synthetic accounts for the run, then removes the ignored credential file and shuts down both processes. It never uses the app already running on port 5000 or any configured external MongoDB.

```powershell
node .\tests\performance\scripts\run-local.js smoke
node .\tests\performance\scripts\run-local.js authentication
node .\tests\performance\scripts\run-local.js baseline
```

Each invocation gets its own fresh login-rate-limit state. The local baseline is capped at 20 VUs to respect the existing 20-logins-per-IP/15-minute rule; this helper does not disable that limit. The current source tree must boot successfully for these tests; the harness reports startup errors without changing application routes.

## Environment and test accounts

1. Start the app and MongoDB against an isolated local test database. For remote staging, get approval from the staging owner and set the explicit staging guard below.
2. Copy `data/test-users.example.json` to the ignored `data/test-users.json`; fill each role array with dedicated synthetic test credentials. Role keys must be `EMPLOYEE`, `MANAGER`, `HR`, `ADMIN`, and `SUPER_ADMIN`. The file is gitignored. Do not put credentials in scripts, reports, or source control.
3. Default role assignment is round-robin across the five roles. One account per role is enough for functional scenarios; for high concurrency, use dedicated accounts as the app's session/login side effects are persisted.
4. The application's login limiter permits only 20 logins per source IP per 15 minutes. The baseline and focused endpoint profiles cap at 20 VUs for that reason. A single k6 generator attempting 500 fresh logins will be throttled; do not disable or bypass this limit. A 500-VU run needs an authorized distributed load-generation plan that preserves the limiter and dedicated test identities. The harness stops the run on the first invalid or throttled login instead of repeatedly retrying bad credentials.
5. Login and refresh create persisted records. Reuse only test accounts in the isolated database and run the guarded cleanup after a run. Do not point cleanup to a shared or production database.

For synthetic account provisioning, use a dedicated database named exactly `cyethack_hrm_k6`. Edit the ignored user file to contain at least 100 unique accounts per role for the default round-robin 500-VU test. Use non-production, synthetic email addresses and unique random passwords of at least 12 characters. The seeder refuses `.invalid` sample emails, placeholder passwords, existing configured accounts, and any database URI not explicitly naming the dedicated database.

```powershell
$env:K6_ENV = 'local' # or approved staging
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/cyethack_hrm_k6'
$env:K6_SEED_CONFIRM = 'CREATE_K6_TEST_USERS'
node .\tests\performance\scripts\seed-test-users.js
```

The script creates only the configured test identities and linked synthetic employee profiles. It never updates or deletes existing accounts/business data; if a creation fails, it attempts to roll back only records created by that invocation. Provision staging test users only with staging-owner approval.

Local defaults are `BASE_URL=http://127.0.0.1:5000` and `API_BASE_URL=http://127.0.0.1:5000/api`. The local guard rejects non-loopback hosts.
The PowerShell runner forwards only the documented k6 settings to the k6 runtime; it does not expose the rest of the shell environment.

For staging, configure PowerShell before execution:

```powershell
$env:K6_ENV = 'staging'
$env:ALLOW_STAGING_TESTS = 'true'
$env:BASE_URL = 'https://your-approved-staging-host'
$env:API_BASE_URL = "$($env:BASE_URL)/api"
$env:K6_USERS_FILE = '../data/test-users.json'
```

Production is disabled unless `K6_ENV=production`, explicit `BASE_URL` and `API_BASE_URL` are supplied, and `PRODUCTION_AUTHORIZATION=I_AUTHORIZE_PRODUCTION_LOAD_TESTING` is set. Do not set these values without the production owner's explicit approval.

Configuration variables:

| Variable | Default | Purpose |
|---|---|---|
| `K6_ENV` | `local` | `local`, `staging`, or `production` |
| `BASE_URL` | `http://127.0.0.1:5000` | App origin |
| `API_BASE_URL` | `${BASE_URL}/api` | Actual API root |
| `K6_USERS_FILE` | `../data/test-users.json` | Ignored JSON credential file, relative to the performance helper directory |
| `TARGET_VUS` | `500` | Main load, target, progressive, and soak VUs |
| `TEST_DURATION` | Profile-specific | Hold duration override (for progressive, each tier) |
| `K6_STRESS_VUS` | `750` | Stress-test peak; must exceed `TARGET_VUS` |
| `K6_ROLE` | Round-robin roles | Optionally pin VUs to one role; ensure the file has enough accounts |
| `ALLOW_STAGING_TESTS` | unset | Must equal `true` for staging |

## Run sequentially

Run one profile at a time; the runner stops after a failed profile and does not start the next one.

```powershell
.\tests\performance\run.ps1 -Suite health
.\tests\performance\run.ps1 -Suite smoke
.\tests\performance\run.ps1 -Suite authentication
.\tests\performance\run.ps1 -Suite baseline
.\tests\performance\run.ps1 -Suite progressive
.\tests\performance\run.ps1 -Suite target
.\tests\performance\run.ps1 -Suite stress
.\tests\performance\run.ps1 -Suite soak
```

`health` is one read-only liveness probe. `smoke` ramps to at most 5 VUs and holds for 1 minute. `baseline` ramps to at most 20 VUs and holds for 5 minutes. `progressive` ramps through 100, 250, then `TARGET_VUS`, holding 5 minutes at each tier. `target` ramps to `TARGET_VUS` over 5 minutes, holds for 25 minutes, and ramps down. `stress` climbs to `K6_STRESS_VUS`, with threshold-based abort enabled. `soak` holds `TARGET_VUS` for 45 minutes. `TEST_DURATION` overrides hold duration. `-Suite all` runs the listed profiles in order, but is intentionally not the default.

The focused endpoint scenarios `dashboard`, `employees`, `attendance`, `leave`, `payroll`, `notifications`, and `reports` each run for up to 20 VUs. `full-workflow` uses the 10/20/15/15/15/10/5/10 percent mix documented above.

The runner also saves k6's JSON-lines time series (including per-status request counts and VU samples) next to the HTML and summary JSON.

Run the explicitly guarded cleanup only against a separate database named exactly `cyethack_hrm_k6`:

```powershell
$env:K6_ENV = 'local' # or 'staging'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/cyethack_hrm_k6'
$env:K6_CLEANUP_CONFIRM = 'DELETE_K6_TEST_SESSIONS'
node .\tests\performance\scripts\cleanup-sessions.js
```

The cleanup removes login sessions and refresh tokens only for the configured test-user emails, plus notifications tied to those exact login-session IDs. It never deletes users, employees, leave, attendance, payroll, document, or other business records.

## Thresholds, reports, and monitoring

- General API: failure rate `<1%`, checks `>99%`, p95 `<500 ms`, p99 `<1,000 ms`.
- Login: p95 `<1,000 ms`, p99 `<2,000 ms`.
- Refresh and each core read workflow: p95 `<500 ms`, p99 `<1,000 ms`.
- Expected `403` authorization denial is checked separately and is not included as a failed HTTP request.
- Every run writes timestamped HTML, raw summary JSON, and a JSON-lines time series under `results/`. The report includes observed status counts and active VUs. Results and credentials are ignored by Git.

The HTML report identifies itself as k6-threshold-only. k6 does not collect Node process CPU/heap/event-loop lag, MongoDB pool/slow-query/index metrics, R2 latency/bandwidth, or hosting CPU/memory/network data. Capture those from the respective staging/hosting dashboards during each major run and record them alongside the JSON report. Do not treat k6 VUs as proof of infrastructure capacity.

PDF generation/download, R2 uploads, and all business writes are intentionally excluded. Add them only with dedicated synthetic records, an approved isolated storage bucket, explicit cleanup semantics, and tested authorization. No code change or optimization to the application is part of this harness.

## Current validation status

The harness does not claim that 500 VUs are sustained until a full target run passes all thresholds and the infrastructure observations have been recorded. A k6 summary without monitoring data cannot satisfy the 500-VU acceptance criteria.
