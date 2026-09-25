# Cyethack HR Portal — MERN Edition

Your existing HR Portal, now backed by a real **MongoDB + Express + Node** API with **JWT access & refresh tokens**, **role-based access control**, and **object-level authorization** — while keeping your existing frontend design exactly as it was.

---

## 1. Project overview

The HR Portal was a single self-contained HTML/CSS/JS file with a demo login. This project turns it into a real full-stack application:

- The **existing portal UI is preserved unchanged** and served by the backend. Its login, session, and Employees data are wired to the real API by one small additive script (`server/public/frontend-integration.js`) — no existing portal code was edited.
- A **real backend** stores users and HR data in MongoDB, hashes passwords with bcrypt, issues JWTs, and enforces permissions on the server.
- A **React client scaffold** (`client/`) is included as the incremental migration path (AuthContext + API service + example page). It is optional — the preserved HTML portal is the working UI today.

On Windows, run `.\run-local.ps1` from PowerShell. On macOS/Linux or Git Bash, run `./run-local.sh`.

### Fastest way to try it (no MongoDB install needed)

```bash
cd server
npm install
npm run dev:mem      # runs the whole app against a throwaway in-memory MongoDB, seeded
<<<<<<< HEAD
# open http://localhost:5000  →  log in with hr@cyethack.com / Hr@123
=======
# open http://localhost:5000  →  log in with jaya.sahu@cyethack.com / JayaCY0125JS201
>>>>>>> 0f31467 (intial Update HRM 1.1)
```

---

## 2. MERN architecture

```
        Existing HTML/CSS/JS Portal  (server/public/index.html — unchanged)
                    │  fetch (Bearer access token + httpOnly refresh cookie)
                    ▼
        Express REST API  (/api/...)
                    │
        JWT auth · RBAC · object-level authz · security middleware
                    │
        Mongoose models
                    ▼
        MongoDB

   (Optional) React client (client/)  ──proxy /api──▶  the same Express API
```

## 3. Project structure

```
hr-portal-mern/
├── server/                 # Express + MongoDB API and the served portal
│   ├── config/             # env.js, database.js
│   ├── models/             # User, Employee, RefreshToken, Leave, Attendance, Payroll, Hiring
│   ├── middleware/         # authenticate, authorize, errorHandler, rateLimiter, validate
│   ├── controllers/        # auth + one per module
│   ├── routes/             # auth + one per module (+ index)
│   ├── utils/              # tokens, permissions, ApiError, catchAsync
│   ├── seeds/seed.js       # dev users + sample data
│   ├── tests/e2e.test.js   # 47 end-to-end tests (real MongoDB)
│   ├── public/             # the EXISTING portal (index.html) + frontend-integration.js
│   ├── app.js, server.js
│   └── .env.example
└── client/                 # React (Vite) scaffold — AuthContext, api service, example page
```

## 4. Requirements

- Node.js 16+ and npm
- MongoDB 5+ (local) or a MongoDB Atlas connection string — _or_ just use `npm run dev:mem` which needs neither.

## 5. Node version

Node 18 or 20 LTS recommended (works on 16+). Check with `node -v`.

## 6. MongoDB setup

- **Local:** install MongoDB Community Server; it runs at `mongodb://127.0.0.1:27017`. Use `mongodb://127.0.0.1:27017/cyethack_hr` as `MONGODB_URI`.
- **Atlas:** create a free cluster, add a database user, allow your IP, and copy the `mongodb+srv://…` string into `MONGODB_URI`.
- **No install:** `npm run dev:mem` starts a temporary in-memory MongoDB (data not persisted).

## 7. Installation

```bash
cd server && npm install
# optional React client:
cd ../client && npm install
```

## 8. Environment variables

Copy `server/.env.example` to `server/.env` and set values:

| Variable                                     | Meaning                                         |
| -------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                                   | `development` or `production`                   |
| `PORT`                                       | API/portal port (default 5000)                  |
| `MONGODB_URI`                                | MongoDB connection string                       |
| `JWT_SECRET`                                 | secret for access tokens (long random)          |
| `JWT_REFRESH_SECRET`                         | different secret (reserved for refresh signing) |
| `ACCESS_TOKEN_EXPIRES_IN`                    | e.g. `15m`                                      |
| `REFRESH_TOKEN_EXPIRES_IN`                   | e.g. `7d`                                       |
| `FRONTEND_URL`                               | CORS origin (default `http://localhost:5000`)   |
| `MAX_FAILED_LOGINS` / `ACCOUNT_LOCK_MINUTES` | lockout policy                                  |

Generate secrets with `openssl rand -base64 48`. Never commit `.env`.

## 9. Backend setup

```bash
cd server
cp .env.example .env      # then edit .env
npm run seed              # create users + sample data (needs MONGODB_URI reachable)
npm start                 # http://localhost:5000  (serves the portal + API)
```

## 10. Frontend setup

- **The existing portal** is served automatically at `http://localhost:5000` — no build step. It is the file `server/public/index.html`, unchanged except one added `<script src="/frontend-integration.js">` line.
- **The React scaffold** (optional): `cd client && npm install && npm run dev` → `http://localhost:3000` (proxies `/api` to the backend). `npm run build` produces `client/dist`.

## 11. Database setup

Running `npm run seed` clears the collections and inserts the dev users, employees, and sample leave/attendance/payroll/hiring records. Re-run any time to reset.

## 12. Seed users (DEVELOPMENT ONLY — change before real use)

<<<<<<< HEAD
| Email                   | Password     | Role                                 |
| ----------------------- | ------------ | ------------------------------------ |
| superadmin@cyethack.com | Super@123    | SUPER_ADMIN                          |
| admin@cyethack.com      | Admin@123    | ADMIN                                |
| hr@cyethack.com         | Hr@123       | HR                                   |
| manager@cyethack.com    | Manager@123  | MANAGER (manages CHS-0005, CHS-0006) |
| employee@cyethack.com   | Employee@123 | EMPLOYEE                             |
=======
| Email                          | Password              | Role                                 |
| ------------------------------ | --------------------- | ------------------------------------ |
| superadmin@cyethack.com        | Super@123             | SUPER_ADMIN                          |
| admin@cyethack.com             | Admin@123             | ADMIN                                |
| jaya.sahu@cyethack.com         | JayaCY0125JS201       | HR                                   |
| surya.dwivedi@cyethack.com     | SuryCY0824SD301       | MANAGER (manages CY0525RS109, CY0226AR110, CY0626AD111, CY0726SS112) |
| rohith.sai@cyethack.com        | GangCY0525RS109       | EMPLOYEE                             |
>>>>>>> 0f31467 (intial Update HRM 1.1)

## 13. JWT authentication flow

```
login (email+password) → server verifies bcrypt hash
   → issues a short-lived ACCESS token (JSON, held in memory by the client)
   → issues a REFRESH token (random, hashed in DB; raw value in an httpOnly cookie)
protected request → Authorization: Bearer <access token>
access token expired (401) → POST /api/auth/refresh (cookie) → new access token → retry
logout → refresh token revoked server-side + cookie cleared
```

## 14. Access-token lifetime

Short-lived, default **15 minutes** (`ACCESS_TOKEN_EXPIRES_IN`). Payload is minimal: `{ sub, role, iat, exp }`. It is verified on every protected request (signature + expiry + live user + active status).

## 15. Refresh-token flow

Refresh tokens are **rotated** on every use: the old one is revoked and a new one issued in the same "family". Only a SHA-256 **hash** is stored, so a DB leak exposes no usable token. **Reuse detection:** replaying a rotated token revokes the whole family (defence against stolen tokens). Default lifetime **7 days**; stored with a TTL index so expired records self-delete.

## 16. Logout

`POST /api/auth/logout` revokes the refresh-token family in the database and clears the cookie. After logout, the refresh token no longer works — it is a real server-side invalidation, not just a client redirect.

## 17. RBAC

Five roles: `SUPER_ADMIN`, `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`. Roles come from the verified JWT / database — never from anything the client sends. `requireRole(...)` and `requirePermission('resource:action')` guard routes; ownership/team scoping is enforced inside controllers.

## 18. Permissions (summary)

- **SUPER_ADMIN** — everything.
- **ADMIN** — user admin + all HR modules.
- **HR** — full Employees, Leave, Attendance, Payroll, Hiring, Reports.
- **MANAGER** — read team; approve team leave; team reports; own profile/leave/attendance/payroll.
- **EMPLOYEE** — own profile, own leave (apply/history), own attendance, own payroll.

The full map is in `server/utils/permissions.js`.

## 19. API endpoints

```
POST /api/auth/login · refresh · logout · change-password · bootstrap-admin   GET /api/auth/me
GET/POST/PUT /api/users                        (admin: provision users, change roles)
GET /api/employees · GET/POST/PUT/DELETE /api/employees[/:id]
GET/POST /api/leaves · PUT/DELETE /api/leaves/:id
GET/POST /api/attendance · PUT /api/attendance/:id
GET /api/payroll · GET /api/payroll/:id · POST/PUT /api/payroll[/:id]
GET/POST/PUT/DELETE /api/hiring[/:id]
GET/POST /api/performance · PUT /api/performance/:id
GET /api/projects · GET /api/projects/:id · POST/PUT /api/projects[/:id]
GET/POST /api/documents · GET /api/documents/:id/download · DELETE /api/documents/:id   (real file upload/download)
GET/POST/PUT/DELETE /api/notices[/:id]
GET/POST /api/helpdesk · PUT /api/helpdesk/:id
GET/POST /api/offboarding · PUT /api/offboarding/:id
GET /api/org-chart · GET /api/reports/summary · GET /api/analytics/overview · GET /api/health
```

Every `/api` route except login/refresh/bootstrap-admin/health requires a valid access token; writes and sensitive reads add role/permission and ownership checks. **Full per-endpoint reference (with auth + required permission) is in [`docs/API.md`](docs/API.md).** All 17 portal modules are backed by real MongoDB collections: Users, Employees, Attendance, Leave, Payroll, Recruitment, Performance, Projects, Documents (real file upload/download), Notices, Helpdesk, Offboarding, plus Org Chart, Reports and Analytics derived from real data.

## 20. Security

bcrypt password hashing (12 rounds) · JWT expiry · refresh-token rotation + revocation + reuse-detection · httpOnly + SameSite=strict cookies (Secure in production) · CORS · Helmet security headers + CSP · login rate limiting · account lockout after repeated failures · input validation (express-validator) · Mongoose schema validation · secrets only in `.env` · no passwords/tokens in logs or responses · safe generic errors (no stack traces, no user enumeration).

## 21. Development commands

```bash
# server/
npm run dev:mem     # full app on in-memory Mongo (no install)
npm start           # run against MONGODB_URI
npm run seed        # (re)seed the database
npm test            # 80 end-to-end tests against a real (in-memory) MongoDB
# client/
npm run dev         # React dev server (proxies /api)
npm run build       # production build → client/dist
```

## 22. Production build

- Set `NODE_ENV=production`, real `JWT_SECRET`/`JWT_REFRESH_SECRET`, and a production `MONGODB_URI` in `.env`.
- Serve over **HTTPS** (Secure cookies require it). Set `FRONTEND_URL` to your real origin for CORS.
- The portal is served by Express directly. If you adopt the React client, run `npm run build` and serve `client/dist` (or point Express `static` at it).
- The server **refuses to start in production** if `JWT_SECRET`/`JWT_REFRESH_SECRET` are left at their defaults, or if `SETUP_TOKEN` is set to the placeholder or is shorter than 16 characters — so an unsafe secret can never reach production.

### First deployment — creating the first admin securely

The first admin is created through `POST /api/auth/bootstrap-admin`, which is guarded by **two** conditions that must **both** hold — the database has zero users **and** a correct `SETUP_TOKEN` is supplied. Either one failing returns **403**. This closes the gap where an empty database alone (e.g. after a reset) would let anyone create an admin.

1. Generate a strong token and set it in the environment before first launch: `SETUP_TOKEN=$(openssl rand -base64 32)`.
2. Start the app, then create your admin (the token goes in the `X-Setup-Token` header, never in a URL and never in frontend code):
   ```bash
   curl -X POST https://hr.yourdomain.com/api/auth/bootstrap-admin \
     -H "Content-Type: application/json" \
     -H "X-Setup-Token: $SETUP_TOKEN" \
     -d '{"fullName":"Your Name","email":"you@company.com","password":"a-strong-password"}'
   ```
3. Log in, then provision everyone else from **Users** (`POST /api/users`).
4. **Blank out `SETUP_TOKEN`** (`SETUP_TOKEN=`) and redeploy — this disables bootstrap entirely for the running system. It stays disabled anyway while any user exists, but blanking the token removes the capability even if the database is later wiped.

The token is compared in constant time, is never logged, and is never returned in any API response.

## 23. Deployment

**Docker (app + MongoDB in one command):** from the project root, set `JWT_SECRET`/`JWT_REFRESH_SECRET` in a `.env`, then `docker compose up --build` and open http://localhost:5000 (see `docker-compose.yml`).

**Managed host:** any Node host (Render, Railway, a VPS…) with MongoDB Atlas. Set env vars (including a strong `SETUP_TOKEN`), run `npm ci --omit=dev` then `npm start`, put it behind HTTPS. Create the first admin with `POST /api/auth/bootstrap-admin` — which requires **both** an empty user store **and** the correct `SETUP_TOKEN` (see **First deployment** above) — instead of running the dev seed in production.

Full step-by-step (Docker + Atlas + first-admin + storage + checklist) is in **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**. See also `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/USER_GUIDE.md`, `docs/TESTING.md`.

## 24. Troubleshooting

- **`MongooseServerSelectionError`** → `MONGODB_URI` wrong or MongoDB not running / IP not allowed in Atlas. Try `npm run dev:mem` to isolate.
- **401 on every request** → access token missing/expired; the client auto-refreshes, but if the refresh cookie is gone you'll be sent to login. Check that the browser is on the same origin as the API.
- **Login always fails** → run `npm run seed`; confirm you're using the dev credentials above.
- **CSP blocks something** → adjust the `contentSecurityPolicy` directives in `server/app.js`.
- **Port in use** → change `PORT` in `.env`.

---

### A note on the frontend-preservation rule

The existing portal design was **not changed**. `server/public/index.html` is your original file with a single `<script src="/frontend-integration.js">` line added before `</body>`; that script connects the existing login/session/logout and the Employees table to the real API without touching any existing markup, CSS, or logic. The demo `localStorage` value the old portal used is kept only as a UI-state mirror — it is **not** the authentication; the real security is the server-side JWT + httpOnly refresh cookie.
