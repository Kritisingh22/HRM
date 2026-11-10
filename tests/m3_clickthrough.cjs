/* M3 CSP/XSS click-through against the LIVE served portal (http://localhost:5000).
 * For each role it logs in, walks every visible nav section, opens the account
 * dropdown, exercises search + a modal, and logs out — while capturing any
 * Content-Security-Policy violation and any uncaught JS error. A strict
 * script-src ('self', no unsafe-inline) means anything that depended on inline
 * script/handlers would surface here as a CSP violation.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:5000';
const CREDS = {
  HR:       { email: 'hr@cyethack.com',       pass: 'Hr@123' },
  Manager:  { email: 'manager@cyethack.com',  pass: 'Manager@123' },
  Employee: { email: 'employee@cyethack.com', pass: 'Employee@123' }
};
const results = [];
function ok(name, cond, extra) { results.push([cond ? 'PASS' : 'FAIL', name, extra || '']); }

async function openAvatarItem(page, label) {
  try {
    await page.click('#avatarBtn', { timeout: 2000 });
    await page.waitForSelector('#avatarMenu:not([hidden])', { timeout: 2000 });
    return await page.evaluate((lbl) => {
      const it = [...document.querySelectorAll('#avatarMenu .menu-item')]
        .find(b => (b.textContent || '').trim().toLowerCase().includes(lbl.toLowerCase()));
      if (!it) return false; it.click(); return true;
    }, label);
  } catch (e) { return false; }
}

async function runRole(browser, role) {
  const cspViolations = [];
  const jsErrors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.HP3_NO_TOUR = true;
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(e.effectiveDirective + ' | blocked:' + (e.blockedURI || '') +
        ' | ' + (e.sourceFile || '') + ':' + (e.lineNumber || ''));
    });
  });
  page.on('console', (m) => {
    const t = m.text();
    if (/content security policy|refused to (execute|apply)/i.test(t)) cspViolations.push('[console] ' + t);
  });
  page.on('pageerror', (e) => jsErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // ---- login ----
  await page.waitForSelector('#hr-auth-user', { timeout: 8000 });
  await page.fill('#hr-auth-user', CREDS[role].email);
  await page.fill('#hr-auth-pass', CREDS[role].pass);
  await page.click('#hr-auth-submit');
  await page.waitForSelector('#hr-auth-container', { state: 'hidden', timeout: 8000 });
  await page.waitForTimeout(800); // let role portal + nav filtering settle
  ok(`${role}: login succeeds (gate closes)`, true);

  // ---- walk every VISIBLE nav section ----
  const pages = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-item[data-page]')]
      .filter(b => b.offsetParent !== null)
      .map(b => b.getAttribute('data-page')));
  let visited = 0;
  for (const p of pages) {
    const clicked = await page.evaluate((pg) => {
      const b = [...document.querySelectorAll('.nav-item[data-page]')].find(x => x.getAttribute('data-page') === pg && x.offsetParent !== null);
      if (!b) return false; b.click(); return true;
    }, p);
    if (clicked) { visited++; await page.waitForTimeout(220); }
  }
  ok(`${role}: navigated all ${pages.length} visible sections`, visited === pages.length, `sections: ${pages.join(', ')}`);

  // ---- account dropdown: Profile ----
  const prof = await openAvatarItem(page, 'Profile');
  ok(`${role}: account menu → Profile opens`, prof);
  await page.waitForTimeout(250);

  // ---- notifications (bell) dropdown ----
  const bell = await page.evaluate(() => { const b = document.getElementById('bellBtn'); if (!b) return false; b.click(); return true; });
  await page.waitForTimeout(200);
  ok(`${role}: notifications dropdown opens`, bell);
  await page.keyboard.press('Escape');

  // ---- search (type into the top search box) ----
  const searched = await page.evaluate(() => { const s = document.getElementById('searchInput'); if (!s) return false; s.focus(); return true; });
  if (searched) { await page.type('#searchInput', 'a', { delay: 30 }); await page.waitForTimeout(200); await page.fill('#searchInput', ''); }
  ok(`${role}: top search input usable`, searched);

  // ---- open a modal (Quick Action → first item), then close ----
  try {
    await page.evaluate(() => { const q = document.getElementById('quickBtn'); if (q) q.click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const it = document.querySelector('#quickMenu .menu-item'); if (it) it.click(); });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  } catch (e) { /* non-fatal */ }

  // ---- logout ----
  const lo = await openAvatarItem(page, 'Log out');
  if (!lo) { // fallback to sidebar logout button
    await page.evaluate(() => { const b = document.getElementById('logoutBtn'); if (b) b.click(); });
  }
  await page.waitForTimeout(400);
  // confirm dialog (frontend-integration) → click confirm if present
  await page.evaluate(() => { const c = document.querySelector('.hr-logout-confirm'); if (c) c.click(); });
  await page.waitForTimeout(500);
  const gateBack = await page.evaluate(() => { const g = document.getElementById('hr-auth-container'); return !!g && !g.hidden; });
  ok(`${role}: logout returns to login gate`, gateBack);

  // ---- collect violations ----
  const domCsp = await page.evaluate(() => window.__csp || []);
  const allCsp = [...cspViolations, ...domCsp];
  ok(`${role}: ZERO CSP violations`, allCsp.length === 0, allCsp.slice(0, 6).join(' ;; '));
  ok(`${role}: ZERO uncaught JS errors`, jsErrors.length === 0, jsErrors.slice(0, 4).join(' ;; '));

  await context.close();
  return { cspCount: allCsp.length, jsCount: jsErrors.length, sections: pages };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const summary = {};
  for (const role of ['HR', 'Manager', 'Employee']) {
    summary[role] = await runRole(browser, role);
  }
  await browser.close();

  let pass = 0, fail = 0;
  for (const [s, n, extra] of results) {
    console.log(`${s}  ${n}${extra ? '  —  ' + extra : ''}`);
    s === 'PASS' ? pass++ : fail++;
  }
  console.log('\n--- per role ---');
  for (const r of Object.keys(summary)) console.log(`${r}: ${summary[r].sections.length} sections, CSP violations=${summary[r].cspCount}, JS errors=${summary[r].jsCount}`);
  console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
