/* Settings — account (change password), portal help and session info. */
import { get, post } from '../../core/api.js';
import { pageHead, esc, toast, isStaff } from '../ui.js';

const GUIDE = {
  EMPLOYEE: ['Dashboard: your attendance, leave, payroll, projects, performance and tasks at a glance.', 'To-Do: plan daily tasks and tick them off; completed tasks feed your report.', 'Leave: apply, track pending/approved/rejected requests and view the calendar.', 'Helpdesk: raise a query and follow its status; you are notified when it is updated.'],
  STAFF: ['Dashboard: figures for the employees in your scope only.', 'Leave Approvals: approve or reject requests with optional remarks.', 'Helpdesk: respond to and update queries from your employees.', 'Org Chart: the reporting structure you are authorised to see.'],
};
export async function settings(ctx) {
  const guide = (isStaff(ctx.user) ? GUIDE.STAFF : GUIDE.EMPLOYEE).map((g) => '<li>' + esc(g) + '</li>').join('');
  ctx.root.innerHTML = pageHead('Settings', 'Account and portal preferences') +
    '<div class="hr-plus-grid2"><section class="card"><div class="card-head"><div><h2>Change password</h2><div class="sub">Use at least 8 characters</div></div></div>' +
    '<div class="hr-plus-field"><label for="st_cur">Current password</label><input id="st_cur" type="password" autocomplete="current-password"></div>' +
    '<div class="hr-plus-field"><label for="st_new">New password</label><input id="st_new" type="password" autocomplete="new-password"></div>' +
    '<div class="hr-plus-field"><label for="st_new2">Confirm new password</label><input id="st_new2" type="password" autocomplete="new-password"></div>' +
    '<div id="st_err" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div><div style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" id="st_go">Update password</button></div></section>' +
    '<section class="card"><div class="card-head"><div><h2>Portal guide</h2><div class="sub">How this workspace works</div></div></div><ul style="padding-left:18px;font-size:13px;color:var(--text-2);line-height:1.7">' + guide + '</ul>' +
    '<div style="margin-top:14px;font-size:12px;color:var(--text-2)">Signed in as <b style="color:var(--text)">' + esc(ctx.user.email) + '</b> · ' + esc(ctx.user.role) + '</div></section></div>';
  const err = document.getElementById('st_err');
  document.getElementById('st_go').addEventListener('click', async (ev) => {
    const cur = st('cur'), n1 = st('new'), n2 = st('new2');
    err.style.display = 'none';
    if (!cur || !n1) { return show('Fill in all password fields.'); }
    if (n1.length < 8) return show('New password must be at least 8 characters.');
    if (n1 !== n2) return show('The new passwords do not match.');
    ev.target.disabled = true;
    try { await post('/api/auth/change-password', { currentPassword: cur, newPassword: n1 }); toast('Password updated'); ['cur', 'new', 'new2'].forEach((k) => { document.getElementById('st_' + k).value = ''; }); }
    catch (e) { show(e.message); }
    ev.target.disabled = false;
  });
  function st(k) { return document.getElementById('st_' + k).value; }
  function show(m) { err.textContent = m; err.style.display = 'block'; }
}
