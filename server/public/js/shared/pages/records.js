/* Attendance, Payroll, Performance and Projects. Each module has a "My …" section
 * and — for HR/Manager only — an "Employee …" section. What appears in the second
 * section is decided by the SERVER's scope for the signed-in user; the client just
 * separates the caller's own rows from the rest. */
import { get, put, post } from '../../core/api.js';
import { mountAsync, pageHead, table, pill, tabs, esc, fmtDate, money, personName, isMine, isStaff, formModal, toast, card, emptyBox, todayISO } from '../ui.js';

const sections = (ctx, mineLabel, othersLabel, build) => {
  ctx.root.innerHTML = '';
  const host = document.createElement('div');
  ctx.root.appendChild(host);
  const defs = [{ label: mineLabel, render: (el) => build(el, true) }];
  if (isStaff(ctx.user)) defs.push({ label: othersLabel, render: (el) => build(el, false) });
  tabs(host, defs);
};
const filterRows = (rows, ctx, mine) => rows.filter((r) => isMine(r, ctx.user) === mine);

/* ---------- ATTENDANCE ---------- */
function toMinutes(t) {
  if (!t) return null;
  const iso = new Date(t);
  if (String(t).includes('T') && !isNaN(iso)) return iso.getHours() * 60 + iso.getMinutes();
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = +m[1]; const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + +m[2];
}
const MIN_MINUTES = 8 * 60;
function duration(r) {
  const a = toMinutes(r.checkIn), b = toMinutes(r.checkOut);
  if (a === null || b === null || b < a) return { text: '—', short: false };
  const d = b - a;
  return { text: Math.floor(d / 60) + 'h ' + String(d % 60).padStart(2, '0') + 'm', short: d < MIN_MINUTES };
}
export async function attendance(ctx) {
  const month = { v: todayISO().slice(0, 7) };
  sections(ctx, 'My Attendance', 'Employee Attendance', (el, mine) => {
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">' +
      '<div style="font-size:12px;color:var(--text-2)">Expected working time: 8 hours per day</div>' +
      '<div class="field" style="margin:0"><input type="month" data-month value="' + month.v + '" aria-label="Month"></div></div><div data-body></div>';
    const body = el.querySelector('[data-body]');
    const load = () => mountAsync(body,
      async () => {
        if (mine) return (await get('/api/attendance/me', { month: month.v })).attendance || [];
        return filterRows(((await get('/api/attendance')).attendance || []).filter((r) => String(r.date).startsWith(month.v)), ctx, false);
      },
      (rows) => {
        const cols = [
          { label: 'Date', get: (r) => fmtDate(r.date) },
          ...(mine ? [] : [{ label: 'Employee', get: (r) => personName(r.employee) }]),
          { label: 'Status', get: (r) => pill(r.status), html: true },
          { label: 'Login', get: (r) => r.checkIn || '—' },
          { label: 'Logout', get: (r) => r.checkOut || '—' },
          { label: 'Working time', get: (r) => { const d = duration(r); return d.short ? d.text + ' · under 8h' : d.text; } },
        ];
        body.innerHTML = '<section class="card">' + table(cols, rows) + '</section>';
      }, { isEmpty: (r) => !r.length, emptyMsg: 'No attendance records for this month.' });
    el.querySelector('[data-month]').addEventListener('change', (e) => { month.v = e.target.value || month.v; load(); });
    load();
  });
}

/* ---------- PAYROLL ---------- */
const deductions = (r) => Object.values(r.deductions || {}).reduce((n, v) => n + (+v || 0), 0);
function payslipModal(r) {
  const d = r.deductions || {};
  window.openModal('<div class="modal-head"><h3>Payslip · ' + esc(r.period) + '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
    '<div class="modal-body">' + [['Gross', money(r.gross)], ['PF', money(d.pf)], ['TDS', money(d.tds)], ['ESI', money(d.esi)], ['Other deductions', money(d.other)], ['Net pay', money(r.net)], ['Status', r.status], ['Pay date', fmtDate(r.payDate)]]
      .map(([k, v]) => '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-2)">' + k + '</span><b>' + esc(v) + '</b></div>').join('') +
    '</div><div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button></div>');
}
export async function payroll(ctx) {
  sections(ctx, 'My Payroll', 'Employee Payroll', (el, mine) => {
    const head = '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">' + (mine ? '<button class="btn btn-outline btn-sm" data-raise>Raise salary request</button>' : '') + '</div><div data-body></div>';
    el.innerHTML = head;
    const body = el.querySelector('[data-body]');
    const raise = el.querySelector('[data-raise]');
    if (raise) raise.addEventListener('click', () => formModal({
      title: 'Salary-related request', submitLabel: 'Submit',
      fields: [{ name: 'subject', label: 'Subject', required: true }, { name: 'description', label: 'Details', type: 'textarea', required: true }],
      onSubmit: async (v) => { await post('/api/helpdesk', { subject: v.subject, description: v.description, category: 'Payroll' }); toast('Request submitted — track it under Helpdesk.'); },
    }));
    const load = () => mountAsync(body, async () => filterRows((await get('/api/payroll')).payroll || [], ctx, mine), (rows) => {
      const staffActions = !mine && ctx.user.role === 'HR';
      const cols = [
        ...(mine ? [] : [{ label: 'Employee', get: (r) => personName(r.employee) }]),
        { label: 'Period', get: (r) => r.period },
        { label: 'Gross', align: 'right', get: (r) => money(r.gross) },
        { label: 'Deductions', align: 'right', get: (r) => money(deductions(r)) },
        { label: 'Net', align: 'right', get: (r) => money(r.net) },
        { label: 'Status', get: (r) => pill(r.status), html: true },
      ];
      body.innerHTML = '<section class="card">' + table(cols, rows, {
        actions: (r, i) => '<button class="btn btn-outline btn-sm" data-view="' + i + '">View</button>' +
          (staffActions && r.status === 'Draft' ? ' <button class="btn btn-outline btn-sm" data-next="' + i + '" data-to="Approved">Approve</button>' : '') +
          (staffActions && r.status === 'Approved' ? ' <button class="btn btn-outline btn-sm" data-next="' + i + '" data-to="Processed">Mark processed</button>' : ''),
      }) + '</section>';
      body.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => payslipModal(rows[+b.dataset.view])));
      body.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await put('/api/payroll/' + rows[+b.dataset.next]._id, { status: b.dataset.to }); toast('Payroll ' + b.dataset.to.toLowerCase()); load(); }
        catch (e) { toast(e.message); b.disabled = false; }
      }));
    }, { isEmpty: (r) => !r.length, emptyMsg: 'No payroll history yet.' });
    load();
  });
}

/* ---------- PERFORMANCE ---------- */
export async function performance(ctx) {
  sections(ctx, 'My Performance', 'Employee Performance', (el, mine) => {
    mountAsync(el, async () => filterRows((await get('/api/performance')).performance || [], ctx, mine), (rows) => {
      const cols = [
        ...(mine ? [] : [{ label: 'Employee', get: (r) => personName(r.employee) }]),
        { label: 'Cycle', get: (r) => r.cycle },
        { label: 'Rating', align: 'right', get: (r) => r.rating ? r.rating + ' / 5' : '—' },
        { label: 'Targets met', get: (r) => { const g = r.goals || []; return g.length ? g.filter((x) => x.status === 'Achieved').length + ' of ' + g.length : '—'; } },
        { label: 'Status', get: (r) => pill(r.status), html: true },
      ];
      el.innerHTML = '<section class="card">' + table(cols, rows, { actions: (r, i) => '<button class="btn btn-outline btn-sm" data-i="' + i + '">Details</button>' }) + '</section>';
      el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        const r = rows[+b.dataset.i];
        window.openModal('<div class="modal-head"><h3>' + esc(r.cycle) + ' review</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div><div class="modal-body">' +
          (r.goals && r.goals.length ? table([{ label: 'Target', get: (g) => g.title }, { label: 'Goal', get: (g) => g.target || '—' }, { label: 'Achieved', get: (g) => g.achieved || '—' }, { label: 'Status', get: (g) => g.status }], r.goals) : '<div class="empty">No targets recorded.</div>') +
          '<div style="margin-top:12px;font-size:13px"><b>Feedback</b><div style="color:var(--text-2);margin-top:4px">' + esc(r.managerFeedback || 'No feedback yet.') + '</div></div></div><div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button></div>');
      }));
    }, { isEmpty: (r) => !r.length, emptyMsg: mine ? 'No performance reviews yet.' : 'No performance records in your scope.' });
  });
}

/* ---------- PROJECTS ---------- */
const TASK_STATUS = ['To Do', 'In Progress', 'Done'];
export async function projects(ctx) {
  sections(ctx, 'My Projects', 'Employee Projects', (el, mine) => {
    mountAsync(el, async () => {
      const list = (await get('/api/projects')).projects || [];
      // my projects = I am a member or the manager; the server already limited the list to my scope
      const me = ctx.user.employeeId;
      const isMember = (p) => (p.manager && p.manager.employeeId === me) || (p.members || []).some((m) => (m && m.employeeId) === me);
      return list.filter((p) => (isStaff(ctx.user) ? isMember(p) === mine : true));
    }, (rows, reload) => {
      const cols = [
        { label: 'Project', get: (p) => p.name }, { label: 'ID', get: (p) => p.projectId },
        { label: 'Manager', get: (p) => personName(p.manager) },
        { label: 'Progress', align: 'right', get: (p) => (p.progress || 0) + '%' },
        { label: 'Status', get: (p) => pill(p.status), html: true },
      ];
      el.innerHTML = '<section class="card">' + table(cols, rows, { actions: (p, i) => '<button class="btn btn-outline btn-sm" data-i="' + i + '">Open</button>' }) + '</section>';
      el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        const p = rows[+b.dataset.i];
        const tasks = p.tasks || [];
        window.openModal('<div class="modal-head"><h3>' + esc(p.name) + '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div><div class="modal-body">' +
          '<p style="color:var(--text-2);font-size:13px;margin-bottom:12px">' + esc(p.description || 'No description.') + '</p>' +
          (tasks.length ? tasks.map((t) => '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><span>' + esc(t.title) + '</span>' +
            '<select data-task="' + esc(t._id) + '" aria-label="Task status">' + TASK_STATUS.map((s) => '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>').join('') : '<div class="empty">No tasks on this project.</div>') +
          '</div><div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button></div>');
        document.querySelectorAll('select[data-task]').forEach((s) => s.addEventListener('change', async () => {
          try { await put('/api/projects/' + p._id + '/tasks/' + s.dataset.task, { status: s.value }); toast('Task updated'); reload(); }
          catch (e) { toast(e.message); }
        }));
      }));
    }, { isEmpty: (r) => !r.length, emptyMsg: mine ? 'No projects assigned to you.' : 'No employee projects in your scope.' });
  });
}
