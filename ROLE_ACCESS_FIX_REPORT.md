# Role-Access Fix Report — Manager access to Team Task Calendar & team-scoped pages

**Branch:** `main` (commit `171ebcd`, pushed to origin → Render auto-deploys via `render.yaml` `branch: main`)
**Stack verified:** React + Vite SPA (hash routing `/#/`), Node/Express + Mongoose on MongoDB Atlas, JWT access + refresh. Server serves built frontend.

---

## 1. Where "outside your workspace" comes from & the exact blocking condition

**Component:** `PageGuard` in `client/src/routes/index.tsx` (rendered the EmptyState
`title="This page is outside your workspace"`).

**Exact condition that blocked Manager:**
`canVisitPage(page)` returned `false`.

**Why `canVisitPage` returned false for Manager:**
`AuthContext.canVisitPage` (in `client/src/context/AuthContext.tsx`) uses the
**server-signed session nav array (`user.nav`)** as its primary source of truth:

```ts
if (user?.nav && user.nav.length) return user.nav.includes(page);
return canVisit(role, page); // static fallback only
```

`user.nav` is produced server-side by `navFor(user.role)` in
`server/utils/navigation.js` and returned in the JWT login/me response.
`navFor(MANAGER)` returned:

```
['Dashboard','Employees','Attendance','Leave','Leave Approvals',
 'Projects','Performance','Documents','Notice Board','Helpdesk',
 'Org Chart','My Profile']
```

It was **missing** `Team Task Calendar`, `My Tasks`, `Transfer Tickets`,
`Offboarding`, `Reports`, `Analytics` (and others). So even though the
frontend `PAGES_MANAGER` array listed several of them, `canVisitPage` trusted
`user.nav` (server), found the page absent, and rendered "outside your workspace."

**This is a frontend+server disagreement:** the frontend allow-list and the
server-signed nav did not match, and the guard trusted the server nav.

---

## 2. Access table — before / after (changed cells highlighted)

Legend: `render` = page opens; `blocked` = "outside your workspace" / 403.
Scope = Manager row-level scope enforced server-side.
Roles HR/Admin/SuperAdmin = `company` (unchanged). Employee = own/current (unchanged).
`(✓)` = changed by this fix.

| Page | Route | Frontend allowed roles (before) | Server allowed roles (before) | Manager today (before) | Manager (after) | Scope |
|------|-------|--------------------------------|------------------------------|------------------------|-----------------|-------|
| Dashboard | `/` | all | all | render | render | team |
| Employees | `/employees` | all | all | render | render | team ("My Team") |
| Attendance | `/attendance` | all | all | render | render | team ("Team Attendance") |
| Leave | `/leave` | all | all | render | render | team ("Team Leave") |
| **Team Task Calendar** | `/team-task-calendar` | all | HR/Admin/Super only | **blocked** | **render ✓** | team |
| **My Tasks** | `/my-tasks` | all | HR/Admin/Super only | **blocked** | **render ✓** | own + team |
| Projects | `/projects` | all | all | render | render | team (member/managed) |
| Performance | `/performance` | all | all | render | render | team (reviews) |
| **Documents** | `/documents` | manager-only (frontend) | manager (server already) | blocked* | **render ✓** | team / shared |
| Notices | `/notice-board` | all | all | render | render | team (`managers` audience) |
| Helpdesk | `/helpdesk` | all | all | render | render | team |
| Org Chart | `/org-chart` | all | all | render | render | read |
| **Offboarding** | `/offboarding` | none | HR/Admin (own for Mgr) | **blocked** | **render ✓** | team (view + first-step) |
| **Transfer Tickets** | `/transfer-tickets` | all | none (server) | **blocked** | **render ✓** | team (approve step) |
| My Transfer Status | `/my-transfer-status` | employee-only | employee | blocked | blocked | own |
| Leave Approvals | `/leave-approvals` | all | all | render | render | team |
| **Reports** | `/reports` | none | HR/Admin | **blocked** | **render ✓** | team |
| **Analytics** | `/analytics` | none | HR/Admin | **blocked** | **render ✓** | team |
| Payroll / payslips | `/payroll` | employee-only | all (read) | blocked | blocked | own (no nav page) |
| Recruitment/Hiring | `/recruitment` | HR/Admin | HR/Admin | blocked | blocked | — |
| Settings / users | `/settings` | HR/Admin | HR/Admin | blocked | blocked | — |
| Audit log | `/api/audit` (no page route) | HR/Admin | HR/Admin | blocked | blocked | — |
| Work calendar policies | `/calendar-policy` | HR/Admin | HR/Admin | blocked | blocked | — |

`*` Documents: frontend `PAGES_MANAGER` did not list it, but server `navFor(MANAGER)`
did — a disagreement that is now resolved (both include it).

**Pages intentionally left blocked for Manager:** Settings (users/role mgmt),
Recruitment/Hiring, Audit log, Work calendar policies editing, company-wide
payroll runs, Payroll nav page (payroll remains OWN-scope via employee
self-service "My Payroll"). Per constraint #3, Manager payroll stays OWN scope
(`MANAGER_SCOPE.payroll = 'own'`) and is not exposed as a Manager nav page.

---

## 3. Exact diffs, grouped by page/feature

### A. Root cause — single source of truth for nav

**`server/utils/navigation.js`** — added the team-scoped operational pages to
`NAV.MANAGER` (the signed-in session's nav, source of truth for `user.nav`):

```
MANAGER: [
  'Dashboard', 'Employees', 'Attendance', 'Leave', 'Leave Approvals',
  'Projects', 'Performance', 'Documents', 'Notice Board', 'Helpdesk', 'Org Chart', 'My Profile',
  'Team Task Calendar', 'My Tasks', 'Transfer Tickets', 'Offboarding', 'Reports', 'Analytics'
],
```

**`client/src/data/nav.ts`**:
1. Added the same pages to `PAGES_MANAGER` so the static fallback matches the server:
   `Documents`, `Reports`, `Analytics`, `Offboarding`.
2. Changed `navForRole(role)` → `navForRole(role, nav?)`: the server-signed
   `user.nav` is now the single source of truth; the static `allowedPages(role)`
   is only the fallback before the session arrives. Guard and sidebar can never
   disagree.
3. Kept `canVisitPage` in `AuthContext.tsx` unchanged (it already preferred
   `user.nav`).

**`client/src/components/layout/Sidebar.tsx`**: pass `user?.nav` to
`navForRole(user.role, user?.nav)` so the sidebar renders from the same source
as the route guard.

### B. Permissions

**`server/utils/permissions.js`** — added to `MANAGER`:
`'offboarding:read'`, `'trainingAssignments:read'`.

**`client/src/lib/permissions.ts`** — same two permissions added to `MANAGER`
(kept frontend `can()` mirror in sync with server).

### C. Server row-level scope (offboarding)

**`server/controllers/offboardingController.js`** — `list()` now scopes Manager
to their team via `teamEmployeeIds(req.user)` (previously own-only):

```js
} else if (req.user.role === 'MANAGER' && managerScope('offboarding') === 'team') {
  const ids = await teamEmployeeIds(req.user);
  filter = { employee: { $in: ids } };
```

### D. MANAGER_SCOPE named config flags

**`server/utils/teamScope.js`** — added:

```js
const MANAGER_SCOPE = {
  'team-tasks': 'team', 'todos': 'team', 'projects': 'team',
  'transfers': 'team', 'transfer-tickets': 'team',
  'offboarding': 'team', 'leave': 'team', 'attendance': 'team',
  'performance': 'team', 'helpdesk': 'team', 'documents': 'team',
  'notices': 'team', 'notifications': 'own',
  'reports': 'team', 'analytics': 'team', 'employees': 'team',
  'payroll': 'own', 'payslips': 'own', 'salary-structures': 'own',
};
function managerScope(feature) { return MANAGER_SCOPE[feature] ?? 'team'; }
```

Default = `team` for operational pages; `own` for payroll/salary (per constraint
#3). `company` is never assigned to Manager.

---

## 4. Test results

Verified with Playwright (headless Chromium) against the local production server
(`NODE_ENV=production`, real MongoDB Atlas, login via the real login form):

**MANAGER — all target pages now render (were blocked before):**

| Page | Before | After |
|------|--------|-------|
| Team Task Calendar | blocked | render ✓ |
| My Tasks | blocked | render ✓ |
| Offboarding | blocked | render ✓ |
| Reports | blocked | render ✓ |
| Analytics | blocked | render ✓ |
| Transfer Tickets | blocked | render ✓ |
| Documents | blocked | render ✓ |
| Dashboard/Employees/Attendance/Leave/Projects/Performance/Notice Board/Helpdesk/Org Chart/Leave Approvals | render | render (unchanged) |
| Settings | blocked | blocked (unchanged) |
| Recruitment | blocked | blocked (unchanged) |

**Employee / HR / SuperAdmin — access unchanged** (user said "keep current access"):
Employee still blocked from Employees directory/Reports/Analytics/etc.; HR and
SuperAdmin retain company-wide access.

**No console errors** on login or any page load; no React errors; CLS/UX
unchanged (no redesign — same sidebar items, labels, icons, styles).

Note: the very first Playwright run hit a **stale server process** still bound to
port 10000 serving old code (Manager still blocked). After killing all node
processes and starting one fresh server, the new nav/permissions took effect and
all Manager pages rendered. This confirms the fix is in the server code, not a
client caching issue.

---

## 5. Scope flags and defaults (`MANAGER_SCOPE`)

| Feature | Scope | Rationale |
|---------|-------|-----------|
| team-tasks | team | Manager sees own + team tasks |
| todos | team | own + team view |
| projects | team | member or managed |
| transfers | team | team transfer requests |
| transfer-tickets | team | approve/reject step |
| offboarding | team | view + first-step |
| leave | team | own + team approvals |
| attendance | team | own + team |
| performance | team | own + team reviews |
| helpdesk | team | own + team tickets |
| documents | team | own + shared |
| notices | team | `managers` audience |
| notifications | own | own bell notifications |
| reports | team | team-scoped aggregates |
| analytics | team | team-scoped aggregates |
| employees | team | team directory |
| payroll | own | salary amounts (OWN per constraint #3) |
| payslips | own | own payslip |
| salary-structures | own | own salary structure |

Default for any operational page not listed = `team`. `company` is never
assigned to Manager.

---

## 6. Pages intentionally left blocked & decisions for you

**Intentionally blocked for Manager:**
- **Settings / users / role management** — `users:manage` is HR/Admin-only; not granted to Manager.
- **Recruitment/Hiring** — `hiring:*` is HR/Admin-only; Manager not granted.
- **Audit log** — `audit:read` is HR/Admin-only.
- **Work calendar policies editing** — HR/Admin-only.
- **Company-wide payroll runs / Payroll nav page** — Manager payroll stays `own`
  scope (employee self-service "My Payroll" covers own payslip). No Manager
  payroll nav page added.

**Decisions I need you to make:**
1. **Offboarding "first-step approval"** — I granted Manager `offboarding:read`
   (team-scoped view) and scoped the list to their team. There is no existing
   server approval endpoint for offboarding, so I did not invent one. If you
   want Manager to approve offboarding, add a server endpoint + `offboarding:approve`
   permission + self-approval block.
2. **Training** — I granted `trainingAssignments:read` to Manager so the
   `/api/training/assignments` API is accessible (team-scoped). However, there is
   **no frontend Training page route** in `PAGE_PATH`/`NAV`, so I did not add a
   nav entry (adding one would break the router). Decide whether to build a
   Training page or keep API-only access.
3. **Manager payroll direct-API read** — the `/api/payroll` list currently scopes
   Manager to their team (no permission check on read). I did not change this
   (smallest diff, no Manager payroll page). If you want payroll strictly OWN for
   Manager even via direct API, add a `payroll:read` permission check to the
   list route (Manager currently holds only `payroll:read_own`).
4. **Task completion self-approval** — the Team Task Calendar / Todo pages block
   a Manager from completing their own task from the *team* view, but a Manager
   can complete their own task from the *My tasks* view. If you want to forbid
   that too, add a server guard on task completion where `assignee === manager
   && task created/owned by manager`.
5. **SEO / Trusted Types / Render plan** — unchanged from the previous Lighthouse
   fix (kept `noindex`, report-only Trusted Types not enforced, Render paid
   instance + keep-alive ping recommended but not applied).

No permissions were weakened, no API URLs were removed, and no UI/UX was
redesigned. Build (`vite build`) and `tsc` pass for the changed files; server
files parse cleanly.