/* Role workspace bootstrap + router.
 *  1. waits for the verified session (frontend-integration.js → "hrm:session"),
 *  2. maps the server-issued role to ONE workspace (employee | hr | manager),
 *  3. dynamically imports ONLY that workspace's routes and pages (code splitting:
 *     an Employee never downloads HR or Manager code),
 *  4. renders the role's sidebar using the portal's existing nav markup/classes.
 * Route guards here are UX only — every API call is authorised again on the server. */
import { esc, toast } from '../shared/ui.js';

const WORKSPACE_OF = { EMPLOYEE: 'employee', HR: 'hr', MANAGER: 'manager', ADMIN: 'hr', SUPER_ADMIN: 'hr' };
const ALL_WS = ['employee', 'hr', 'manager'];
const LEGACY = ['dashboardPage', 'modulePage', 'hrLeaveCalendarPage', 'hrxModuleRoot', 'hrPlusRoot'];

let user = null, ws = null, cfg = null, navToken = 0;

const $ = (id) => document.getElementById(id);
const root = () => $('roleRoot');

function slugPath(path) { return path.replace(/\/+$/, '') || '/'; }

function buildNav() {
  const nav = $('nav');
  nav.innerHTML = '';
  cfg.groups.forEach((g) => {
    const lab = document.createElement('div');
    lab.className = 'nav-label';
    lab.textContent = g.group;
    nav.appendChild(lab);
    g.items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'nav-item';
      b.dataset.page = it.name;
      b.dataset.slug = it.slug;
      b.title = it.name;
      b.innerHTML = (typeof window.icon === 'function' ? window.icon(it.icon) : '') + '<span class="nav-text">' + esc(it.name) + '</span>';
      b.addEventListener('click', () => navigate('/' + ws + '/' + it.slug));
      nav.appendChild(b);
    });
  });
}

function takeOverShell() {
  window.__hrmWorkspace = ws;
  LEGACY.forEach((id) => { const n = $(id); if (n) n.hidden = true; });
  const sw = $('hp3Controls'); if (sw) sw.style.display = 'none';         // demo role switcher
  const quick = $('quickBtn'); if (quick) quick.hidden = true;           // demo quick actions mutate fake data
  const bar = document.getElementById('hrPlusWhatsNew'); if (bar) bar.hidden = true;
  const ew = document.getElementById('hrEmpDashNote'); if (ew) ew.remove();
  root().hidden = false;
}

function findItem(slug) {
  for (const g of cfg.groups) for (const it of g.items) if (it.slug === slug) return it;
  return null;
}

function forbidden(wsRequested) {
  root().innerHTML =
    '<div class="card"><div class="empty" role="alert"><b style="display:block;color:var(--text);margin-bottom:4px">Access denied</b>' +
    'The ' + esc(wsRequested) + ' workspace is not available to your account.' +
    '<div style="margin-top:12px"><button class="btn btn-outline btn-sm" data-goto="dashboard">Go to my dashboard</button></div></div></div>';
}

export async function navigate(path, { replace = false } = {}) {
  if (!cfg) return;
  path = slugPath(path);
  const parts = path.split('/').filter(Boolean);
  const first = parts[0];
  if (ALL_WS.includes(first) && first !== ws) {
    // someone typed /hr/... as an employee, etc.
    history.replaceState({}, '', '/' + ws + '/dashboard');
    toast('Access denied — that workspace is not part of your account.');
    $('pageTitle').textContent = 'Access denied';
    forbidden(first);
    return;
  }
  const slug = first === ws ? parts[1] || 'dashboard' : 'dashboard';
  const item = findItem(slug) || findItem('dashboard');
  const url = '/' + ws + '/' + item.slug;
  if (location.pathname !== url) history[replace ? 'replaceState' : 'pushState']({}, '', url);

  document.querySelectorAll('#nav .nav-item').forEach((b) => {
    if (b.dataset.slug === item.slug) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('pageTitle').textContent = item.name;
  document.body.classList.remove('drawer-open');
  const scrim = $('mobileScrim'); if (scrim) scrim.hidden = true;
  const content = $('content'); if (content) content.scrollTop = 0;

  const token = ++navToken;
  const host = root();
  host.innerHTML = '<div class="card"><div class="empty" role="status">Loading…</div></div>';
  try {
    const mod = await import('/js/roles/' + ws + '/pages/' + item.page + '.js');
    if (token !== navToken) return;               // a newer navigation superseded this one
    host.innerHTML = '';
    await mod.default({ root: host, user, ws, navigate });
  } catch (e) {
    if (token !== navToken) return;
    host.innerHTML = '<div class="card"><div class="empty" role="alert"><b style="display:block;color:var(--text);margin-bottom:4px">This page could not be loaded</b>' + esc(e.message || 'Unexpected error') + '</div></div>';
    console.error(e);
  }
}

async function start(u) {
  if (!u) return;
  if (user && String(user.id) === String(u.id) && cfg) return;
  user = u;
  ws = WORKSPACE_OF[u.role];
  if (!ws) return;
  try {
    cfg = (await import('/js/roles/' + ws + '/routes.js')).default;   // only this role's route table
  } catch (e) { console.error('Could not load workspace', e); return; }
  takeOverShell();
  buildNav();
  const { initBell } = await import('./bell.js');
  initBell();
  navigate(location.pathname, { replace: true });
}

/* delegated clicks: KPI cards, retry buttons, in-page links */
document.addEventListener('click', (ev) => {
  const g = ev.target.closest && ev.target.closest('#roleRoot [data-goto]');
  if (g && cfg) { ev.preventDefault(); const t = g.getAttribute('data-goto'); navigate(t.startsWith('/') ? t : '/' + ws + '/' + (t || 'dashboard')); }
});
window.addEventListener('hrm:navigate', (e) => navigate(e.detail));
window.addEventListener('popstate', () => navigate(location.pathname, { replace: true }));
window.addEventListener('hrm:session', (e) => start(e.detail));
if (window.__hrUser) start(window.__hrUser);
