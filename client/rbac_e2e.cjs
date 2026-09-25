/* Role-by-role verification of the React workspaces against the live backend.
 * Positive: each role logs in → lands in its own workspace → sees role-correct
 * nav → every nav page renders. Negative: cross-workspace URLs show Access Denied,
 * and direct cross-role API calls (using the user's own session) return 403. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const CREDS = {
  HR: { email: 'hr@cyethack.com', pass: 'Hr@123', portal: '/hr', has: ['Employees', 'Users', 'Payroll', 'Managers'], hasnt: [] },
  MANAGER: { email: 'manager@cyethack.com', pass: 'Manager@123', portal: '/manager', has: ['My Team', 'Team Leave'], hasnt: ['Users', 'Payroll'] },
  EMPLOYEE: { email: 'employee@cyethack.com', pass: 'Employee@123', portal: '/employee', has: ['My Payroll', 'My Manager', 'My Profile'], hasnt: ['Users', 'My Team'] }
};
const results = [];
const ok = (n, c, x) => results.push([c ? 'PASS' : 'FAIL', n, x || '']);

async function login(page, c) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', c.email);
  await page.fill('input[type=password]', c.pass);
  await page.click('button.btn');
  await page.waitForURL((u) => new URL(u).pathname.startsWith(c.portal), { timeout: 8000 });
}

async function runRole(browser, role) {
  const c = CREDS[role];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));

  await login(page, c);
  ok(`${role}: login lands in own workspace (${c.portal})`, new URL(page.url()).pathname.startsWith(c.portal), page.url());

  // role-correct nav
  const labels = await page.$$eval('.ws-navlink .ws-navlabel', (els) => els.map((e) => e.textContent.trim()));
  ok(`${role}: sidebar shows expected items`, c.has.every((h) => labels.includes(h)), 'has=' + labels.join(','));
  ok(`${role}: sidebar hides other-role items`, c.hasnt.every((h) => !labels.includes(h)), 'hasnt-check');

  // walk every nav page; each must render a heading and not crash
  let walked = 0, brokenPages = [];
  for (const label of labels) {
    await page.evaluate((lbl) => {
      const el = [...document.querySelectorAll('.ws-navlink')].find((a) => a.textContent.trim().includes(lbl));
      if (el) el.click();
    }, label);
    await page.waitForTimeout(350);
    const heading = await page.$eval('.ws-page-head h1, .pf-page h2', (e) => e.textContent).catch(() => null);
    if (heading) walked++; else brokenPages.push(label);
  }
  ok(`${role}: all ${labels.length} nav pages render`, brokenPages.length === 0, brokenPages.length ? 'broken: ' + brokenPages.join(',') : '');

  // dashboard screenshot
  await page.goto(BASE + c.portal, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/home/claude/rbac_' + role.toLowerCase() + '.png' });

  ok(`${role}: no uncaught JS errors during walk`, errs.length === 0, errs.slice(0, 3).join(' ;; '));
  await ctx.close();
}

async function negativeTests(browser) {
  // Employee cannot enter HR or Manager workspaces (Access Denied), and direct
  // cross-role API calls with the employee's own session return 403.
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await login(page, CREDS.EMPLOYEE);

  for (const [target, name] of [['/hr', 'HR'], ['/manager', 'Manager']]) {
    await page.goto(BASE + target, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const denied = await page.locator('text=Access Denied').count();
    ok(`NEG: Employee → ${target} shows Access Denied`, denied > 0);
  }

  // direct API as the employee's own session (refresh → bearer → call)
  const api = await page.evaluate(async () => {
    const ref = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    const { accessToken } = await ref.json();
    const call = async (p) => (await fetch(p, { headers: { Authorization: 'Bearer ' + accessToken }, credentials: 'same-origin' })).status;
    return {
      otherEmp: await call('/api/employees/CHS-0004'), // another employee (IDOR/BOLA)
      users: await call('/api/users'),                 // HR-only
      hiring: await call('/api/hiring'),               // HR-only
      ownEmp: await call('/api/employees/CHS-0008')    // self → allowed
    };
  });
  ok('NEG: Employee → GET other employee (IDOR) → 403', api.otherEmp === 403, 'got ' + api.otherEmp);
  ok('NEG: Employee → GET /api/users (HR-only) → 403', api.users === 403, 'got ' + api.users);
  ok('NEG: Employee → GET /api/hiring (HR-only) → 403', api.hiring === 403, 'got ' + api.hiring);
  ok('NEG: Employee → GET own record → 200', api.ownEmp === 200, 'got ' + api.ownEmp);
  await ctx.close();

  // Manager cannot enter HR workspace
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await login(p2, CREDS.MANAGER);
  await p2.goto(BASE + '/hr', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(400);
  ok('NEG: Manager → /hr shows Access Denied', (await p2.locator('text=Access Denied').count()) > 0);
  // manager direct API: another manager's… only one manager seeded, so test HR-only endpoint + non-team employee
  const mapi = await p2.evaluate(async () => {
    const ref = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    const { accessToken } = await ref.json();
    const call = async (p) => (await fetch(p, { headers: { Authorization: 'Bearer ' + accessToken }, credentials: 'same-origin' })).status;
    return { users: await call('/api/users'), payrollWrite: (await fetch('/api/payroll', { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' })).status };
  });
  ok('NEG: Manager → GET /api/users (HR-only) → 403', mapi.users === 403, 'got ' + mapi.users);
  ok('NEG: Manager → create payroll (HR-only) → 403', mapi.payrollWrite === 403, 'got ' + mapi.payrollWrite);
  await ctx2.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const role of ['HR', 'MANAGER', 'EMPLOYEE']) await runRole(browser, role);
  await negativeTests(browser);
  await browser.close();
  let pass = 0, fail = 0;
  for (const [s, n, x] of results) { console.log(`${s}  ${n}${x ? '  —  ' + x : ''}`); s === 'PASS' ? pass++ : fail++; }
  console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
