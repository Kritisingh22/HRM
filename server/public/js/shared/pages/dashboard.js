/* Dashboards — ONE call to /api/dashboard returns a small, role-scoped payload. */
import { get } from '../../core/api.js';
import { mountAsync, pageHead, kpiGrid, card, esc, money, fmtDate } from '../ui.js';

const C = { teal: ['var(--teal)', 'var(--teal-tint)'], green: ['var(--green)', 'var(--green-tint)'], amber: ['var(--amber)', 'var(--amber-tint)'], violet: ['var(--violet)', 'var(--violet-tint)'], blue: ['var(--blue)', 'var(--blue-tint)'] };
const k = (label, value, sub, icon, col, goto) => ({ label, value, sub, icon, color: C[col][0], tint: C[col][1], goto });

export async function employeeDashboard({ root, user }) {
  root.innerHTML = '';
  const head = document.createElement('div'); const body = document.createElement('div');
  root.append(head, body);
  head.innerHTML = pageHead('Welcome, ' + (user.name || '').split(' ')[0], 'Your personal workspace');
  await mountAsync(body, () => get('/api/dashboard'), (d) => {
    const a = d.attendance, l = d.leave;
    body.innerHTML = kpiGrid([
      k('Attendance this month', a.presentDays + ' / ' + a.recordedDays, a.today ? 'Today: ' + a.today.status : 'Not marked today', 'userCheck', 'green', 'attendance'),
      k('Leave', l.pending + ' pending', l.approved + ' approved · ' + l.daysTaken + ' days taken', 'calendar', 'amber', 'leave'),
      k('Latest payroll', d.payroll ? money(d.payroll.net) : '—', d.payroll ? d.payroll.period + ' · ' + d.payroll.status : 'No payslips yet', 'banknote', 'teal', 'payroll'),
      k('Projects', d.projects.active + ' active', d.projects.total + ' assigned', 'briefcase', 'blue', 'projects'),
      k('Performance', d.performance && d.performance.rating ? d.performance.rating + ' / 5' : '—', d.performance ? d.performance.cycle : 'No review yet', 'trendingUp', 'violet', 'performance'),
      k("Today's tasks", d.todos.completedToday + ' done', d.todos.pendingToday + ' pending', 'clipboardCheck', 'green', 'todo'),
      k('Helpdesk', d.helpdesk.open + ' open', 'Your queries', 'bell', 'amber', 'helpdesk'),
    ]);
    if (!d.linked) body.insertAdjacentHTML('afterbegin', '<div class="card" style="margin-bottom:16px"><div class="empty">No employee record is linked to your account yet — ask HR to link it.</div></div>');
  });
}

export async function staffDashboard({ root, user }, title) {
  root.innerHTML = '';
  const head = document.createElement('div'); const body = document.createElement('div');
  root.append(head, body);
  head.innerHTML = pageHead(title, '');
  await mountAsync(body, () => get('/api/dashboard'), (d) => {
    const scope = { company: 'Company-wide', team: 'Your team', assigned: 'Employees assigned to you' }[d.scope] || '';
    head.innerHTML = pageHead(title, scope);
    const items = [];
    if (d.hrCount !== undefined) items.push(k('HR team', d.hrCount, 'HR users in your scope', 'users', 'violet', 'org-chart'));
    items.push(
      k('Employees', d.employees, scope, 'users', 'teal', 'org-chart'),
      k('Present today', d.presentToday, 'Marked present / WFH', 'userCheck', 'green', 'attendance'),
      k('On leave', d.onLeave, 'Currently on leave', 'calendar', 'amber', 'leave'),
      k('Pending leave', d.pendingLeaves, 'Awaiting approval', 'clipboardCheck', 'violet', 'leave-approvals'),
      k('Payroll to process', d.payrollPending, 'Draft or approved', 'banknote', 'teal', 'payroll'),
      k('Active projects', d.activeProjects, 'In progress', 'briefcase', 'blue', 'projects'),
      k('Helpdesk', d.openTickets, 'Open queries', 'bell', 'amber', 'helpdesk'),
    );
    body.innerHTML = kpiGrid(items);
  });
}
