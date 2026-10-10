/* Analytics — real aggregates from /api/analytics/overview, scoped by the server. */
import { get } from '../../core/api.js';
import { mountAsync, pageHead, kpiGrid, table, esc, money } from '../ui.js';

const bars = (rows, label, value) => {
  const max = Math.max(1, ...rows.map(value));
  return rows.map((r) => '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px"><span>' + esc(label(r)) + '</span><b>' + esc(value(r)) + '</b></div><div class="progress"><div class="fill" style="width:' + Math.round((value(r) / max) * 100) + '%"></div></div></div>').join('');
};
export async function analytics(ctx) {
  ctx.root.innerHTML = pageHead('Analytics', 'Loading scope…') + '<div data-body></div>';
  const body = ctx.root.querySelector('[data-body]');
  await mountAsync(body, () => get('/api/analytics/overview'), (d) => {
    const sub = ctx.root.querySelector('.hr-plus-head .sub'); if (sub) sub.textContent = { company: 'Company-wide', team: 'Your team', assigned: 'Employees assigned to you' }[d.scope] || '';
    const sec = (title, rows, label, value) => '<section class="card"><div class="card-head"><div><h2>' + title + '</h2></div></div>' + (rows.length ? bars(rows, label, value) : '<div class="empty">No data yet.</div>') + '</section>';
    body.innerHTML = kpiGrid([
      { label: 'Headcount', value: d.headcount, sub: 'Active employees', icon: 'users', color: 'var(--teal)', tint: 'var(--teal-tint)', goto: 'org-chart' },
      { label: 'Avg. rating', value: d.performance.avgRating ?? '—', sub: d.performance.reviews + ' reviews', icon: 'trendingUp', color: 'var(--violet)', tint: 'var(--violet-tint)', goto: 'performance' },
      { label: 'Open positions', value: d.openPositions, sub: 'Recruitment', icon: 'briefcase', color: 'var(--blue)', tint: 'var(--blue-tint)', goto: '' },
    ]) + '<div class="hr-plus-grid2">' +
      sec('Headcount by department', d.headcountByDepartment, (r) => r.department, (r) => r.count) +
      sec('Leave by status', d.leaveByStatus, (r) => r.status, (r) => r.count) +
      sec('Payroll by status', d.payrollByStatus, (r) => r.status + ' · ' + money(r.net), (r) => r.count) +
      sec('Projects by status', d.projectsByStatus, (r) => r.status, (r) => r.count) + '</div>';
  });
}
