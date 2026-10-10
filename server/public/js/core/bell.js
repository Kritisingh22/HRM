/* Notification bell backed by /api/notifications (replaces the demo list). */
import { get, put } from './api.js';
import { esc, fmtDate } from '../shared/ui.js';

async function refreshBadge() {
  const badge = document.getElementById('bellBadge');
  try {
    const d = await get('/api/notifications/unread-count');
    const n = d.unreadCount || 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n ? 'grid' : 'none';      // the portal toggles this inline style
  } catch (e) { badge.style.display = 'none'; }
}

async function renderMenu() {
  const menu = document.getElementById('bellMenu');
  menu.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const d = await get('/api/notifications', { limit: 8 });
    const list = d.notifications || [];
    if (!list.length) { menu.innerHTML = '<div class="empty">No notifications</div>'; return; }
    menu.innerHTML = list.map((n) =>
      '<div class="notif" data-id="' + esc(n._id) + '"><div><b>' + esc(n.title) + '</b>' +
      '<div style="font-size:12px;color:var(--text-2)">' + esc(n.message) + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">' + fmtDate(n.createdAt) + (n.read ? '' : ' · new') + '</div></div></div>').join('');
    menu.querySelectorAll('.notif').forEach((el) => el.addEventListener('click', async () => {
      try { await put('/api/notifications/' + el.dataset.id + '/read'); } catch (e) { /* ignore */ }
      refreshBadge();
    }));
  } catch (e) { menu.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}

let started = false;
export function initBell() {
  if (started) return; started = true;
  window.renderBellMenu = renderMenu;           // replaces the demo list wherever the portal re-renders it
  const btn = document.getElementById('bellBtn');
  if (btn) btn.addEventListener('click', () => renderMenu());   // fresh data each time it opens
  renderMenu();
  refreshBadge();
  setInterval(refreshBadge, 60000);
}
