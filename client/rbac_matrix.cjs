/* Complete role-based login + routing test matrix (spec §16 + scenarios).
 * Runs against the live React client (:3000) + live backend (:5000). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const U = {
  HR: ['hr@cyethack.com', 'Hr@123', '/hr'],
  EMPLOYEE: ['employee@cyethack.com', 'Employee@123', '/employee'],
  MANAGER: ['manager@cyethack.com', 'Manager@123', '/manager'],
  ADMIN: ['admin@cyethack.com', 'Admin@123', '/hr'],
  SUPER_ADMIN: ['superadmin@cyethack.com', 'Super@123', '/hr']
};
const results = [];
const ok = (n, c, x) => results.push([c ? 'PASS' : 'FAIL', n, x || '']);
const path = (p) => new URL(p.url()).pathname;

async function login(page, role) {
  const [email, pass] = U[role];
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', pass);
  await page.click('button.btn');
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
}

(async () => {
  const b = await chromium.launch({ headless: true });

  // 1) login → correct dashboard (all 5 roles)
  for (const role of Object.keys(U)) {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await login(p, role);
    ok(`login ${role} → ${U[role][2]}`, path(p).startsWith(U[role][2]), 'landed ' + path(p));
    await ctx.close();
  }

  // 2) cross-role denial matrix
  const DENY = [
    ['EMPLOYEE', '/hr'], ['EMPLOYEE', '/manager'],
    ['MANAGER', '/hr'], ['MANAGER', '/employee'],
    ['HR', '/manager'], ['HR', '/employee']
  ];
  for (const [role, url] of DENY) {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await login(p, role);
    await p.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400);
    const denied = await p.locator('text=Access Denied').count();
    ok(`${role} → ${url} blocked (Access Denied)`, denied > 0);
    await ctx.close();
  }

  // 3) Scenario 8 — authenticated user visiting /login is redirected to their workspace
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await login(p, 'MANAGER');
    await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
    const hasForm = await p.locator('input[type=password]').count();
    ok('authenticated /login → redirected to workspace (no form)', path(p) === '/manager' && hasForm === 0, 'at ' + path(p) + ' form=' + hasForm);
    await ctx.close();
  }

  // 4) refresh persistence — reload keeps the manager on /manager (session restored)
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await login(p, 'MANAGER');
    await p.goto(BASE + '/manager', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400);
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900);
    const onManager = path(p) === '/manager';
    const shellShown = await p.locator('.ws-navlink').count();
    ok('refresh keeps MANAGER on /manager (session restored)', onManager && shellShown > 0, 'at ' + path(p) + ' nav=' + shellShown);
    await ctx.close();
  }

  // 5) logout → /login, and protected URL no longer accessible afterwards
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await login(p, 'HR');
    await p.click('.pm-trigger');                                   // open profile dropdown
    await p.waitForTimeout(200);
    await p.locator('.pm-item.danger').click();                    // "Log out" menu item
    await p.waitForSelector('.cd-modal', { timeout: 3000 });
    await p.locator('.cd-modal .btn.danger').click();              // confirm
    await p.waitForFunction(() => location.pathname === '/login', { timeout: 6000 }).catch(() => {});
    ok('logout → /login', path(p) === '/login', 'at ' + path(p));
    await p.goto(BASE + '/hr', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
    ok('after logout, /hr is blocked (→ /login)', path(p) === '/login', 'at ' + path(p));
    await ctx.close();
  }

  await b.close();
  let pass = 0, fail = 0;
  for (const [s, n, x] of results) { console.log(`${s}  ${n}${x ? '  —  ' + x : ''}`); s === 'PASS' ? pass++ : fail++; }
  console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
