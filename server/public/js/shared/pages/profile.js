/* My Profile — always the signed-in user's own record (loaded by the session's id). */
import { get, put } from '../../core/api.js';
import { mountAsync, pageHead, esc, fmtDate, money, toast, isStaff } from '../ui.js';

const RO = [['Employee ID', 'employeeId'], ['Name', 'fullName'], ['Email', 'email'], ['Department', 'department'], ['Designation', 'designation'], ['Manager', 'manager'], ['Employment type', 'employmentType'], ['Work mode', 'workMode'], ['Joined', 'joiningDate'], ['Status', 'status']];
const EDIT = [['Phone', 'phone'], ['Location', 'location'], ['Address', 'address'], ['Emergency contact', 'emergencyContact']];
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export async function profile(ctx) {
  ctx.root.innerHTML = '';
  const body = document.createElement('div'); ctx.root.appendChild(body);
  await mountAsync(body, async () => {
    if (!ctx.user.employeeId) return { employee: null };
    return get('/api/employees/' + encodeURIComponent(ctx.user.employeeId));
  }, ({ employee: e }) => {
    if (!e) { body.innerHTML = '<div class="card"><div class="empty">Your account is not linked to an employee record yet.</div></div>'; return; }
    const v = (k) => (k === 'joiningDate' ? fmtDate(e[k]) : e[k] || '—');
    body.innerHTML = pageHead('My Profile', ctx.user.role === 'EMPLOYEE' ? 'Employee' : ctx.user.role === 'HR' ? 'HR' : ctx.user.role === 'MANAGER' ? 'Manager' : ctx.user.role) +
      '<div class="hr-plus-grid2"><section class="card"><div class="hr-plus-prof"><div class="hr-plus-av">' + esc(initials(e.fullName)) + '</div><div>' +
      RO.map(([l, k]) => '<div class="hr-plus-ro" style="margin-bottom:10px"><span class="k">' + l + '</span><span class="v">' + esc(v(k)) + '</span></div>').join('') + '</div></div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Contact details</h2><div class="sub">You can update these fields</div></div></div><div data-form>' +
      EDIT.map(([l, k]) => '<div class="hr-plus-field"><label for="pf_' + k + '">' + l + '</label><input id="pf_' + k + '" value="' + esc(e[k] || '') + '"></div>').join('') +
      '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" data-save>Save changes</button></div></div></section></div>';
    body.querySelector('[data-save]').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      const payload = {}; EDIT.forEach(([, k]) => { payload[k] = document.getElementById('pf_' + k).value.trim(); });
      try { await put('/api/employees/me/profile', payload); toast('Profile updated'); } catch (err) { toast(err.message); }
      ev.target.disabled = false;
    });
  });
}
