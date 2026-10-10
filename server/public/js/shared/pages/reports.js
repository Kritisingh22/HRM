/* Reports. "My report" is computed from the caller's own records (GET /api/reports/me).
 * Staff also review daily reports submitted by employees in their scope. */
import { get, put } from '../../core/api.js';
import { mountAsync, kpiGrid, table, pill, tabs, esc, fmtDate, personName, isStaff, formModal, toast, todayISO } from '../ui.js';

function myReport(el) {
  const range = { from: todayISO().slice(0, 8) + '01', to: todayISO() };
  el.innerHTML = '<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px;flex-wrap:wrap"><div class="field" style="margin:0"><input type="date" data-from value="' + range.from + '" aria-label="From"></div><div class="field" style="margin:0"><input type="date" data-to value="' + range.to + '" aria-label="To"></div></div><div data-body></div>';
  const body = el.querySelector('[data-body]');
  const load = () => mountAsync(body, () => get('/api/reports/me', range), (d) => {
    if (!d.linked) { body.innerHTML = '<div class="card"><div class="empty">No employee record is linked to your account.</div></div>'; return; }
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '% completed' : 'No data');
    body.innerHTML = kpiGrid([
      { label: 'Attendance', value: d.attendance.daysPresent + ' days', sub: d.attendance.daysAbsent + ' absent · ' + d.attendance.recorded + ' recorded', icon: 'userCheck', color: 'var(--green)', tint: 'var(--green-tint)', goto: 'attendance' },
      { label: 'Leave taken', value: d.leave.daysTaken + ' days', sub: d.leave.requests + ' approved requests', icon: 'calendar', color: 'var(--amber)', tint: 'var(--amber-tint)', goto: 'leave' },
      { label: 'To-Do completion', value: d.todos.completed + ' / ' + d.todos.total, sub: pct(d.todos.completed, d.todos.total), icon: 'clipboardCheck', color: 'var(--teal)', tint: 'var(--teal-tint)', goto: 'todo' },
      { label: 'Project tasks', value: d.projects.doneTasks + ' / ' + d.projects.assignedTasks, sub: pct(d.projects.doneTasks, d.projects.assignedTasks), icon: 'briefcase', color: 'var(--blue)', tint: 'var(--blue-tint)', goto: 'projects' },
      { label: 'Daily reports', value: d.dailyReports.submitted, sub: 'Submitted in this period', icon: 'fileText', color: 'var(--violet)', tint: 'var(--violet-tint)', goto: '' },
    ]);
  });
  el.querySelector('[data-from]').addEventListener('change', (e) => { range.from = e.target.value; load(); });
  el.querySelector('[data-to]').addEventListener('change', (e) => { range.to = e.target.value; load(); });
  load();
}
function employeeReports(el) {
  const load = () => mountAsync(el, async () => (await get('/api/daily-reports')).reports || [], (rows) => {
    el.innerHTML = '<section class="card">' + table([
      { label: 'Date', get: (r) => fmtDate(r.date) }, { label: 'Employee', get: (r) => personName(r.employee) },
      { label: 'Completed', get: (r) => r.tasksCompleted || '—' }, { label: 'Blockers', get: (r) => r.blockers || '—' }, { label: 'Status', get: (r) => pill(r.status), html: true },
    ], rows, { actions: (r, i) => r.status === 'Submitted' ? '<button class="btn btn-outline btn-sm" data-i="' + i + '">Review</button>' : '' }) + '</section>';
    el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const r = rows[+b.dataset.i];
      formModal({ title: 'Review report', submitLabel: 'Mark reviewed', fields: [{ name: 'reviewNote', label: 'Note (optional)', type: 'textarea' }],
        onSubmit: async (v) => { await put('/api/daily-reports/' + r._id, { status: 'Reviewed', reviewNote: v.reviewNote }); toast('Report reviewed'); load(); } });
    }));
  }, { isEmpty: (r) => !r.length, emptyMsg: 'No employee reports in your scope.' });
  load();
}
export async function reports(ctx) {
  ctx.root.innerHTML = '';
  const host = document.createElement('div'); ctx.root.appendChild(host);
  const defs = [{ label: isStaff(ctx.user) ? 'My Reports' : 'Reports', render: myReport }];
  if (isStaff(ctx.user)) defs.push({ label: 'Employee Reports', render: employeeReports });
  tabs(host, defs);
}
