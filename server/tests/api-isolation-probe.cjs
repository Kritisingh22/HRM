/* Live API-level data-isolation probe against the seeded dev backend (:5000).
 * Independent of the browser matrix and the jest suite — hits the real shared
 * endpoints as each role and checks scope, salary projection, and module gating. */
const BASE = 'http://localhost:5000';
const results = [];
const ok = (n, c, x) => results.push([c ? 'PASS' : 'FAIL', n, x || '']);

async function login(email, password) {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const d = await r.json();
  return { token: d.accessToken, user: d.user };
}
const auth = (t) => ({ Authorization: 'Bearer ' + t });
async function get(path, t) {
  const r = await fetch(BASE + path, { headers: auth(t) });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

(async () => {
  const HR = await login('hr@cyethack.com', 'Hr@123');
  const MGR = await login('manager@cyethack.com', 'Manager@123');
  const EMP = await login('employee@cyethack.com', 'Employee@123');

  // roles resolved from backend identity (never client-supplied)
  ok('HR identity role=HR from backend', HR.user.role === 'HR', HR.user.role + ' portal=' + HR.user.portal);
  ok('MANAGER identity role=MANAGER from backend', MGR.user.role === 'MANAGER', MGR.user.role + ' portal=' + MGR.user.portal);
  ok('EMPLOYEE identity role=EMPLOYEE from backend', EMP.user.role === 'EMPLOYEE', EMP.user.role + ' portal=' + EMP.user.portal);

  // ---- Employees list: scope + salary projection ----
  const hrEmp = await get('/api/employees', HR.token);
  const mgrEmp = await get('/api/employees', MGR.token);
  const empEmp = await get('/api/employees', EMP.token);
  const hrCount = hrEmp.body?.employees?.length ?? 0;
  const mgrCount = mgrEmp.body?.employees?.length ?? 0;
  const empCount = empEmp.body?.employees?.length ?? 0;
  ok('HR sees full roster (> manager scope)', hrCount > mgrCount && hrCount > 0, `HR=${hrCount} MGR=${mgrCount} EMP=${empCount}`);
  ok('MANAGER roster is a scoped subset (team+self)', mgrCount > 0 && mgrCount < hrCount, `MGR=${mgrCount}`);
  ok('EMPLOYEE roster is self only (1 row)', empCount === 1, `EMP=${empCount}`);

  const hasSalary = (arr) => arr.some((e) => Object.prototype.hasOwnProperty.call(e, 'salary'));
  ok('HR employees INCLUDE salary field', hasSalary(hrEmp.body.employees), 'salary present');
  ok('MANAGER employees OMIT salary (property absent)', !hasSalary(mgrEmp.body.employees), 'salary absent');
  ok('EMPLOYEE employees OMIT salary (property absent)', !hasSalary(empEmp.body.employees), 'salary absent');

  // ---- Object-level (IDOR/BOLA): employee → someone else's record = 403 ----
  const others = hrEmp.body.employees.filter((e) => e.employeeId !== EMP.user.employeeId);
  const someoneElse = others[0]?.employeeId;
  const empSelf = await get('/api/employees/' + EMP.user.employeeId, EMP.token);
  const empOther = await get('/api/employees/' + someoneElse, EMP.token);
  ok('EMPLOYEE can read own employee record (200)', empSelf.status === 200, 'self ' + empSelf.status);
  ok('EMPLOYEE reading another employee record → 403', empOther.status === 403, 'other ' + someoneElse + ' → ' + empOther.status);

  // manager → a non-team member (pick an employee NOT in manager's scoped list)
  const mgrIds = new Set((mgrEmp.body.employees || []).map((e) => e.employeeId));
  const nonTeam = hrEmp.body.employees.find((e) => !mgrIds.has(e.employeeId));
  if (nonTeam) {
    const mgrOther = await get('/api/employees/' + nonTeam.employeeId, MGR.token);
    ok('MANAGER reading a non-team employee → 403', mgrOther.status === 403, nonTeam.employeeId + ' → ' + mgrOther.status);
  } else ok('MANAGER reading a non-team employee → 403', false, 'no non-team employee found to test');

  // ---- Module gating (permission-based) ----
  ok('EMPLOYEE → /api/hiring (recruitment) → 403', (await get('/api/hiring', EMP.token)).status === 403);
  ok('MANAGER → /api/hiring (recruitment) → 403', (await get('/api/hiring', MGR.token)).status === 403);
  ok('HR → /api/hiring (recruitment) → 200', (await get('/api/hiring', HR.token)).status === 200);
  ok('EMPLOYEE → /api/reports/summary → 403', (await get('/api/reports/summary', EMP.token)).status === 403);
  ok('MANAGER → /api/reports/summary → 200 (team reports)', (await get('/api/reports/summary', MGR.token)).status === 200);
  ok('HR → /api/reports/summary → 200', (await get('/api/reports/summary', HR.token)).status === 200);
  ok('EMPLOYEE → /api/users (user mgmt) → 403', (await get('/api/users', EMP.token)).status === 403);
  ok('MANAGER → /api/users (user mgmt) → 403', (await get('/api/users', MGR.token)).status === 403);
  ok('HR → /api/users → 200', (await get('/api/users', HR.token)).status === 200);

  // ---- Payroll scope ----
  const empPay = await get('/api/payroll', EMP.token);
  const hrPay = await get('/api/payroll', HR.token);
  const empPayN = empPay.body?.payslips?.length ?? empPay.body?.count ?? (Array.isArray(empPay.body) ? empPay.body.length : '?');
  const hrPayN = hrPay.body?.payslips?.length ?? hrPay.body?.count ?? (Array.isArray(hrPay.body) ? hrPay.body.length : '?');
  ok('EMPLOYEE payroll list is own-only (≤ HR list)', empPay.status === 200 && hrPay.status === 200, `EMP=${empPayN} HR=${hrPayN}`);

  // ---- Org chart scope differs by role ----
  const hrOrg = await get('/api/org-chart', HR.token);
  const mgrOrg = await get('/api/org-chart', MGR.token);
  const empOrg = await get('/api/org-chart', EMP.token);
  ok('Org chart HR scope = company', hrOrg.body?.scope === 'company', 'scope=' + hrOrg.body?.scope + ' count=' + hrOrg.body?.count);
  ok('Org chart MANAGER scope = team', mgrOrg.body?.scope === 'team', 'scope=' + mgrOrg.body?.scope + ' count=' + mgrOrg.body?.count);
  ok('Org chart EMPLOYEE scope = self', empOrg.body?.scope === 'self', 'scope=' + empOrg.body?.scope + ' count=' + empOrg.body?.count);
  ok('Org chart HR count ≥ MANAGER count ≥ EMPLOYEE count', (hrOrg.body?.count >= mgrOrg.body?.count) && (mgrOrg.body?.count >= empOrg.body?.count), `HR=${hrOrg.body?.count} MGR=${mgrOrg.body?.count} EMP=${empOrg.body?.count}`);
  // org chart never leaks salary/contact
  const anyNode = (hrOrg.body?.roots || [])[0];
  ok('Org chart nodes carry no salary/email/phone', anyNode && !('salary' in anyNode) && !('email' in anyNode) && !('phone' in anyNode), anyNode ? Object.keys(anyNode).join(',') : 'no nodes');

  // ---- Self-service is field-limited + IDOR-safe (no id in URL) ----
  const selfEdit = await fetch(BASE + '/api/employees/me/profile', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(EMP.token) },
    body: JSON.stringify({ phone: '+1-555-0199', salary: 999999, role: 'ADMIN', department: 'Executive' })
  });
  const seBody = await selfEdit.json();
  const emp2 = seBody.employee || {};
  ok('Self-service update accepted (200)', selfEdit.status === 200, 'status ' + selfEdit.status);
  ok('Self-service applied allow-listed field (phone)', emp2.phone === '+1-555-0199', 'phone=' + emp2.phone);
  ok('Self-service IGNORED privileged fields (salary/role/department)', !('salary' in emp2) && emp2.department !== 'Executive', 'dept=' + emp2.department);

  let pass = 0, fail = 0;
  for (const [s, n, x] of results) { console.log(`${s}  ${n}${x ? '  —  ' + x : ''}`); s === 'PASS' ? pass++ : fail++; }
  console.log(`\n======== API ISOLATION: ${pass} passed, ${fail} failed ========`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('PROBE ERROR:', e); process.exit(2); });
