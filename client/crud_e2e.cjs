/* End-to-end CRUD persistence test — drives the REAL React UI (:3000) against the
 * REAL backend + DB (:5000). For each module it performs a mutation through the UI,
 * reloads the page (forcing a fresh fetch from the backend) to prove persistence,
 * and independently confirms the record via the API. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:5000';
const U = {
  HR: ['hr@cyethack.com', 'Hr@123', '/hr'],
  EMPLOYEE: ['employee@cyethack.com', 'Employee@123', '/employee']
};
const results = [];
const ok = (n, c, x) => { results.push([c ? 'PASS' : 'FAIL', n, x || '']); if (!c) console.log('   ✗ ' + n + (x ? '  — ' + x : '')); };
const path = (p) => new URL(p.url()).pathname;

async function login(page, role) {
  const [email, pass] = U[role];
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', pass);
  await page.click('button.btn');
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(400);
}
const F = (page, label, val, sel = '.cd-modal') => page.fill(`${sel} .ws-field:has-text("${label}") input`, val);
const S = (page, label, val, sel = '.cd-modal') => page.selectOption(`${sel} .ws-field:has-text("${label}") select`, val);
async function toast(page, kind = 'ok') {
  try { await page.waitForSelector(`.ws-toast.${kind}`, { timeout: 6000 }); return (await page.locator(`.ws-toast.${kind}`).last().textContent()) || ''; }
  catch { return ''; }
}
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.ws-toast').forEach((e) => e.remove())).catch(() => {});
async function apiLogin(role) {
  const [email, password] = U[role];
  const r = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).accessToken;
}
async function apiGet(p, t) { const r = await fetch(API + p, { headers: { Authorization: 'Bearer ' + t } }); return { status: r.status, body: await r.json().catch(() => ({})) }; }
const arr = (d) => (Array.isArray(d) ? d : Object.values(d || {}).find((v) => Array.isArray(v)) || []);

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  const netIssues = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', (r) => { const s = r.status(); if (s === 401 || s === 409) netIssues.push(s + ' ' + r.request().method() + ' ' + new URL(r.url()).pathname); });
  const hrToken = await apiLogin('HR');

  // ============ EMPLOYEE MODULE ============
  await login(page, 'HR');
  await page.goto(BASE + '/hr/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table tbody tr');

  // CREATE
  await page.getByRole('button', { name: '+ Add employee' }).click();
  await page.waitForSelector('.cd-modal');
  await F(page, 'Employee ID', 'CHS-E2E1');
  await F(page, 'Full name', 'E2E Tester');
  await F(page, 'Email', 'e2e.tester@cyethack.com');
  await F(page, 'Designation', 'Test Engineer');
  await page.click('.cd-modal .ws-btn.primary');
  const t1 = await toast(page, 'ok');
  ok('Employee CREATE → success toast', /added/i.test(t1), t1);
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});
  await page.waitForTimeout(300);
  ok('Employee CREATE → row appears in table', await page.getByText('CHS-E2E1').count() > 0);

  // PERSIST after reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table tbody tr');
  ok('Employee persists after page refresh', await page.getByText('CHS-E2E1').count() > 0);
  // PERSIST in DB (independent API)
  let dbEmp = arr((await apiGet('/api/employees', hrToken)).body).find((e) => e.employeeId === 'CHS-E2E1');
  ok('Employee exists in DB via API', !!dbEmp, dbEmp ? dbEmp.fullName : 'not found');

  // UPDATE
  await page.locator('tr:has-text("CHS-E2E1") button:has-text("Edit")').click();
  await page.waitForSelector('.cd-modal');
  await F(page, 'Designation', 'Senior Test Engineer');
  await page.click('.cd-modal .ws-btn.primary');
  ok('Employee UPDATE → success toast', /updated/i.test(await toast(page, 'ok')));
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table tbody tr');
  dbEmp = arr((await apiGet('/api/employees', hrToken)).body).find((e) => e.employeeId === 'CHS-E2E1');
  ok('Employee UPDATE persisted in DB (designation)', dbEmp && dbEmp.designation === 'Senior Test Engineer', dbEmp && dbEmp.designation);

  // DELETE (soft-delete → Exited)
  await page.locator('tr:has-text("CHS-E2E1") button:has-text("Delete")').click();
  await page.waitForSelector('.cd-modal .btn.danger');
  await page.click('.cd-modal .btn.danger');
  ok('Employee DELETE → success toast', /offboard|exited/i.test(await toast(page, 'ok')));
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table');
  await page.waitForTimeout(300);
  ok('Employee removed from active roster after delete', await page.getByText('CHS-E2E1').count() === 0);
  const active = arr((await apiGet('/api/employees', hrToken)).body).find((e) => e.employeeId === 'CHS-E2E1');
  const exited = arr((await apiGet('/api/employees?status=Exited', hrToken)).body).find((e) => e.employeeId === 'CHS-E2E1');
  ok('Employee soft-deleted in DB (absent from active, present as Exited)', !active && exited && exited.status === 'Exited', exited ? exited.status : 'not exited');

  // ============ PAYROLL MODULE ============
  await page.goto(BASE + '/hr/payroll', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-page');
  await page.getByRole('button', { name: '+ Create payslip' }).click();
  await page.waitForSelector('.cd-modal');
  await S(page, 'Employee', { index: 1 });
  await F(page, 'Period', '2099-03');
  await F(page, 'Gross', '100000');
  await F(page, 'PF', '12000');
  await F(page, 'TDS', '8000');
  const netPreview = await page.inputValue('.cd-modal .ws-field:has-text("Net pay") input');
  ok('Payroll net preview computed (₹80,000)', /80,000/.test(netPreview), netPreview);
  await page.click('.cd-modal .ws-btn.primary');
  ok('Payroll CREATE → success toast', /created/i.test(await toast(page, 'ok')));
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table tbody tr');
  ok('Payroll persists after refresh (period 2099-03)', await page.getByText('2099-03').count() > 0);
  let dbSlip = arr((await apiGet('/api/payroll', hrToken)).body).find((s) => s.period === '2099-03');
  ok('Payroll in DB with SERVER-computed net = 80000', dbSlip && dbSlip.net === 80000, dbSlip ? 'net=' + dbSlip.net : 'not found');

  // UPDATE gross → net recomputed server-side
  await page.locator('tr:has-text("2099-03") button:has-text("Edit")').click();
  await page.waitForSelector('.cd-modal');
  await F(page, 'Gross', '120000');
  await page.click('.cd-modal .ws-btn.primary');
  ok('Payroll UPDATE → success toast', /updated/i.test(await toast(page, 'ok')));
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});
  dbSlip = arr((await apiGet('/api/payroll', hrToken)).body).find((s) => s.period === '2099-03');
  ok('Payroll UPDATE persisted, net recomputed = 100000', dbSlip && dbSlip.net === 100000, dbSlip ? 'net=' + dbSlip.net : 'missing');

  // DUPLICATE guard (same employee + period) → 409 friendly error
  await page.getByRole('button', { name: '+ Create payslip' }).click();
  await page.waitForSelector('.cd-modal');
  await S(page, 'Employee', { index: 1 });
  await F(page, 'Period', '2099-03');
  await F(page, 'Gross', '5000');
  await page.click('.cd-modal .ws-btn.primary');
  ok('Payroll duplicate period → friendly error toast', /already exists/i.test(await toast(page, 'err')));
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // ============ RECRUITMENT MODULE ============
  await page.goto(BASE + '/hr/recruitment', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-page');
  await page.getByRole('button', { name: '+ Add job' }).click();
  await page.waitForSelector('.cd-modal');
  await F(page, 'Job ID', 'JOB-E2E1');
  await F(page, 'Role title', 'E2E Role');
  await page.click('.cd-modal .ws-btn.primary');
  ok('Recruitment job CREATE → success toast', /posted/i.test(await toast(page, 'ok')));
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table tbody tr');
  ok('Recruitment job persists after refresh', await page.getByText('JOB-E2E1').count() > 0);

  // add candidate + move stage
  await page.locator('tr:has-text("JOB-E2E1") button:has-text("Candidates")').click();
  await page.waitForSelector('.cd-modal.xl');
  await page.fill('.cd-modal .ws-field:has-text("Name") input', 'E2E Cand');
  await page.click('.cd-modal .ws-btn.primary'); // Add candidate
  ok('Recruitment candidate ADD → toast', /pipeline/i.test(await toast(page, 'ok')));
  await page.waitForTimeout(400);
  await clearToasts(page);
  await page.selectOption('.cd-modal tr:has-text("E2E Cand") select', 'Interview');
  ok('Recruitment candidate STAGE change → toast', /interview/i.test(await toast(page, 'ok')));
  await page.waitForTimeout(400);
  await page.click('.cd-modal .ws-btn:has-text("Done")');
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});

  // persist: reload, reopen, check candidate + stage
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table tbody tr');
  await page.locator('tr:has-text("JOB-E2E1") button:has-text("Candidates")').click();
  await page.waitForSelector('.cd-modal.xl');
  ok('Recruitment candidate persists after refresh', await page.locator('.cd-modal tr:has-text("E2E Cand")').count() > 0);
  const stageVal = await page.inputValue('.cd-modal tr:has-text("E2E Cand") select').catch(() => '');
  ok('Recruitment candidate stage persisted (Interview)', stageVal === 'Interview', stageVal);
  await page.click('.cd-modal .ws-btn:has-text("Done")');
  await page.waitForSelector('.cd-modal', { state: 'detached' }).catch(() => {});
  const dbJob = arr((await apiGet('/api/hiring', hrToken)).body).find((j) => j.jobId === 'JOB-E2E1');
  ok('Recruitment in DB: job + candidate + stage', dbJob && dbJob.candidates.some((c) => c.name === 'E2E Cand' && c.stage === 'Interview'), dbJob ? JSON.stringify(dbJob.candidates.map((c) => c.stage)) : 'no job');

  // delete job
  await page.locator('tr:has-text("JOB-E2E1") button:has-text("Delete")').click();
  await page.waitForSelector('.cd-modal .btn.danger');
  await page.click('.cd-modal .btn.danger');
  ok('Recruitment job DELETE → toast', /removed/i.test(await toast(page, 'ok')));
  await page.waitForTimeout(400);
  const jobGone = !arr((await apiGet('/api/hiring', hrToken)).body).find((j) => j.jobId === 'JOB-E2E1');
  ok('Recruitment job deleted in DB', jobGone);

  // ============ LEAVE MODULE ============
  const empCtx = await b.newContext();
  const emp = await empCtx.newPage();
  await login(emp, 'EMPLOYEE');
  await emp.goto(BASE + '/employee/leave', { waitUntil: 'domcontentloaded' });
  await emp.waitForSelector('.ws-form-row');
  await emp.fill('input[aria-label="From"]', '2099-05-10');
  await emp.fill('input[aria-label="To"]', '2099-05-12');
  await emp.click('.ws-form-row button.ws-btn.primary');
  ok('Leave APPLY → success toast', /submitted/i.test(await toast(emp, 'ok')));
  await emp.waitForTimeout(500);
  await emp.reload({ waitUntil: 'domcontentloaded' });
  await emp.waitForSelector('.ws-table');
  ok('Leave request persists after refresh (Pending)', await emp.locator('.ws-table tr:has-text("Pending")').count() > 0);

  // HR approves it (proves approve → DB)
  await page.goto(BASE + '/hr/leave', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-table');
  const pendRow = page.locator('.ws-table tr:has-text("May 2099"):has-text("Pending")').first();
  if (await pendRow.count() > 0) {
    await pendRow.locator('button:has-text("Approve")').click();
    ok('Leave APPROVE (HR) → toast', /approved/i.test(await toast(page, 'ok')));
    await page.waitForTimeout(400);
  } else ok('Leave APPROVE (HR) → toast', false, 'no pending May-2099 row visible to HR');
  const empTok = await apiLogin('EMPLOYEE');
  const leaves = arr((await apiGet('/api/leaves', empTok)).body);
  const approved = leaves.find((l) => l.status === 'Approved' && new Date(l.from).getFullYear() === 2099);
  ok('Leave APPROVE persisted in DB', !!approved, approved ? 'approved' : 'not found');

  // employee applies a 2nd leave then cancels it (proves cancel → DB)
  await emp.goto(BASE + '/employee/leave', { waitUntil: 'domcontentloaded' });
  await emp.waitForSelector('.ws-form-row');
  await emp.fill('input[aria-label="From"]', '2099-06-10');
  await emp.fill('input[aria-label="To"]', '2099-06-11');
  await emp.click('.ws-form-row button.ws-btn.primary');
  await toast(emp, 'ok');
  await emp.waitForTimeout(500);
  await emp.reload({ waitUntil: 'domcontentloaded' });
  await emp.waitForSelector('.ws-table');
  const cancelRow = emp.locator('.ws-table tr:has-text("Jun 2099"):has-text("Pending")').first();
  await cancelRow.locator('button:has-text("Cancel")').click();
  ok('Leave CANCEL (own pending) → toast', /cancelled/i.test(await toast(emp, 'ok')));
  await emp.waitForTimeout(500);
  const leaves2 = arr((await apiGet('/api/leaves', empTok)).body);
  const cancelled = leaves2.find((l) => l.status === 'Cancelled' && new Date(l.from).getMonth() === 5 && new Date(l.from).getFullYear() === 2099);
  ok('Leave CANCEL persisted in DB', !!cancelled, cancelled ? 'cancelled' : 'not found');

  // ---- console / network hygiene ----
  // Two non-2xx responses are EXPECTED and benign:
  //   • 401 POST /api/auth/refresh  → the session probe on first load (no cookie yet → show login)
  //   • 409 POST /api/payroll        → the intentional duplicate-period test above
  const EXPECTED = new Set(['401 POST /api/auth/refresh', '409 POST /api/payroll']);
  const unexpectedNet = netIssues.filter((s) => !EXPECTED.has(s));
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e)); // exclude network-status noise; keep real JS/React errors
  console.log('   net non-2xx observed: ' + (netIssues.join(', ') || 'none'));
  ok('No UNEXPECTED non-2xx network responses (only the session-probe 401 + intentional dup-409)', unexpectedNet.length === 0, 'unexpected=[' + unexpectedNet.join(', ') + ']');
  ok('No JavaScript/React console errors during CRUD flows', jsErrors.length === 0, jsErrors.slice(0, 4).join(' | '));

  await b.close();
  let pass = 0, fail = 0;
  console.log('');
  for (const [s, n, x] of results) { console.log(`${s}  ${n}${x && s === 'PASS' ? '  —  ' + x : ''}`); s === 'PASS' ? pass++ : fail++; }
  console.log(`\n======== CRUD E2E: ${pass} passed, ${fail} failed ========`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
