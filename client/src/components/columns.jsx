/* Column sets for each resource table. `get(row)` reads the value; optional
 * `render(value,row)` formats it. Employee/owner/manager refs may be populated
 * objects, so we read them defensively. Salary only appears where the API
 * actually returns it (HR) — for other roles the field is absent and the column
 * simply shows "—" (it is never sent to them). */
import { StatusPill, personName } from './ui';

const money = (n) => (typeof n === 'number' ? '₹' + n.toLocaleString('en-IN') : '—');
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const statusCol = (label = 'Status', key = 'status') => ({ label, get: (r) => r[key], render: (v) => <StatusPill value={v} /> });
const emp = (label = 'Employee', key = 'employee') => ({ label, get: (r) => personName(r[key]) });

export const COLUMNS = {
  employees: [
    { label: 'ID', get: (r) => r.employeeId },
    { label: 'Name', get: (r) => r.fullName },
    { label: 'Email', get: (r) => r.email },
    { label: 'Department', get: (r) => r.department },
    { label: 'Designation', get: (r) => r.designation },
    { label: 'Manager', get: (r) => r.manager },
    statusCol()
  ],
  employeesHR: [
    { label: 'ID', get: (r) => r.employeeId },
    { label: 'Name', get: (r) => r.fullName },
    { label: 'Email', get: (r) => r.email },
    { label: 'Department', get: (r) => r.department },
    { label: 'Designation', get: (r) => r.designation },
    { label: 'Manager', get: (r) => r.manager },
    { label: 'Salary', align: 'right', get: (r) => r.salary, render: (v) => money(v) },
    statusCol()
  ],
  team: [
    { label: 'ID', get: (r) => r.employeeId },
    { label: 'Name', get: (r) => r.fullName },
    { label: 'Department', get: (r) => r.department },
    { label: 'Designation', get: (r) => r.designation },
    statusCol()
  ],
  leaves: [
    emp(),
    { label: 'Type', get: (r) => r.type },
    { label: 'From', get: (r) => r.from, render: (v) => fmtDate(v) },
    { label: 'To', get: (r) => r.to, render: (v) => fmtDate(v) },
    { label: 'Days', align: 'right', get: (r) => r.days },
    statusCol()
  ],
  attendance: [
    emp(),
    { label: 'Date', get: (r) => r.date, render: (v) => fmtDate(v) },
    statusCol()
  ],
  payroll: [
    emp(),
    { label: 'Period', get: (r) => r.period },
    { label: 'Gross', align: 'right', get: (r) => r.gross, render: (v) => money(v) },
    { label: 'Net', align: 'right', get: (r) => r.net, render: (v) => money(v) },
    statusCol()
  ],
  performance: [
    emp(),
    { label: 'Cycle', get: (r) => r.cycle },
    { label: 'Rating', align: 'right', get: (r) => r.rating }
  ],
  projects: [
    { label: 'Project', get: (r) => r.name },
    { label: 'Client', get: (r) => r.client },
    { label: 'Manager', get: (r) => personName(r.manager) },
    statusCol()
  ],
  documents: [
<<<<<<< HEAD
    { label: 'Document', get: (r) => r.name },
    { label: 'Type', get: (r) => r.type },
    { label: 'Owner', get: (r) => personName(r.owner) },
    statusCol()
  ],
=======
    { label: 'Document', get: (r) => r.title },
    { label: 'Category', get: (r) => r.category },
    { label: 'Owner', get: (r) => personName(r.owner) },
    { label: 'Visibility', get: (r) => r.visibility },
    statusCol()
  ],
  dailyReports: [
    { label: 'Date', get: (r) => r.date, render: (v) => fmtDate(v) },
    { label: 'Employee', get: (r) => personName(r.employee) },
    { label: 'Department', get: (r) => r.employee?.department || '—' },
    { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> },
    { label: 'Tasks Completed', get: (r) => r.tasksCompleted },
    { label: 'Pending Work', get: (r) => r.pendingWork },
    { label: 'Blockers', get: (r) => r.blockers },
  ],
>>>>>>> 0f31467 (intial Update HRM 1.1)
  notices: [
    { label: 'Title', get: (r) => r.title },
    { label: 'Author', get: (r) => personName(r.author) },
    { label: 'Date', get: (r) => r.date || r.publishedAt || r.createdAt, render: (v) => fmtDate(v) }
  ],
  helpdesk: [
    { label: 'Subject', get: (r) => r.subject },
    { label: 'Category', get: (r) => r.category },
    statusCol()
  ],
  hiring: [
    { label: 'Role', get: (r) => r.title },
    { label: 'Department', get: (r) => r.department },
    statusCol('Stage', 'stage'),
    statusCol()
  ],
  offboarding: [
    emp(),
    { label: 'Reason', get: (r) => r.reason },
    statusCol()
  ],
  users: [
    { label: 'Name', get: (r) => r.fullName },
    { label: 'Email', get: (r) => r.email },
    { label: 'Role', get: (r) => r.role },
    { label: 'Employee ID', get: (r) => r.employeeId },
    statusCol()
  ]
};
