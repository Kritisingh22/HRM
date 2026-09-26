/* Employees — full CRUD against the REAL backend/database.
 *   GET    /api/employees        (role-scoped list; HR gets the full roster + salary)
 *   POST   /api/employees        (employees:write)  → add
 *   PUT    /api/employees/:id     (employees:write)  → edit
 *   DELETE /api/employees/:id     (employees:delete) → soft-delete (marks Exited, disables login)
 * Every mutation calls the API, then reloads the list from the backend response —
 * so the table always shows the actual saved database state (survives refresh).
 * Buttons are gated by the user's real permissions; the backend enforces them too. */
import { useState } from 'react';
import { Card } from '../../components/ui';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { Field } from '../../components/form';
import ConfirmDialog from '../../portal/ConfirmDialog';
import { COLUMNS } from '../../components/columns';
import { useList } from '../../hooks/useList';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { api } from '../../services/api';

const GENDERS = ['', 'Male', 'Female', 'Other', 'Prefer not to say'];
const STATUSES = ['Active', 'On Leave', 'Probation', 'Exited'];
const EMP_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'];

const blank = {
  employeeId: '', fullName: '', email: '', phone: '', gender: '', department: '',
  designation: '', manager: '', employmentType: 'Full-time', location: '',
  joiningDate: '', salary: '', grade: '', status: 'Active'
};

const errText = (e) => e?.data?.details?.[0] || (e?.status === 409 ? 'An employee with that ID or email already exists.' : e?.status === 403 ? 'You do not have permission to do that.' : e?.message || 'Something went wrong.');
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export default function EmployeesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/employees');

  const canWrite = hasPermission('employees:write') || hasPermission('employees:update');
  const canDelete = hasPermission('employees:delete');
  const canSeeSalary = hasPermission('payroll:read');
  const isHR = hasPermission('employees:write');

  const [editing, setEditing] = useState(null);   // {} = add, {…} = edit, null = closed
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.del('/api/employees/' + (toDelete._id || toDelete.employeeId));
      toast.success(`${toDelete.fullName} was offboarded (marked Exited).`);
      setToDelete(null);
      await reload();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  }

  const actions = (r) => (
    <>
      {canWrite && <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button>}
      {canDelete && r.status !== 'Exited' && <button className="ws-btn sm bad" onClick={() => setToDelete(r)}>Delete</button>}
    </>
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Employees</h1>
        <span className="ws-scope">All employees</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add employee</button></div>}
      </div>

      <Card>
        <DataTable
          columns={canSeeSalary ? COLUMNS.employeesHR : COLUMNS.employees}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite || canDelete ? actions : undefined}
          emptyText="No employees yet. Use “Add employee” to create the first record."
        />
      </Card>

      {editing && (
        <EmployeeForm
          initial={editing}
          canSeeSalary={canSeeSalary}
          isHR={isHR}
          managers={rows || []}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(errText(e))}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Offboard employee?"
        message={toDelete ? `${toDelete.fullName} (${toDelete.employeeId}) will be marked “Exited” and their login disabled. Records are kept for history; this is a soft-delete, not a permanent erase.` : ''}
        confirmText={busy ? 'Working…' : 'Offboard'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={remove}
      />
    </div>
  );
}

function EmployeeForm({ initial, canSeeSalary, isHR, managers, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({ ...blank, ...initial, joiningDate: toDateInput(initial.joiningDate), salary: initial.salary ?? '' });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (isHR && !f.employeeId.trim()) err.employeeId = 'Required.';
    if (!f.fullName.trim()) err.fullName = 'Required.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) err.email = 'Enter a valid email.';
    if (canSeeSalary && f.salary !== '' && (isNaN(Number(f.salary)) || Number(f.salary) < 0)) err.salary = 'Enter a valid amount.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {
      fullName: f.fullName.trim(),
      email: f.email.trim() || undefined, phone: f.phone.trim() || undefined,
      gender: f.gender || undefined, department: f.department.trim() || undefined,
      designation: f.designation.trim() || undefined, manager: f.manager || undefined,
      employmentType: f.employmentType || undefined, location: f.location.trim() || undefined,
      joiningDate: f.joiningDate || undefined, grade: f.grade.trim() || undefined
    };
    if (isHR) {
      if (!isEdit) body.employeeId = f.employeeId.trim();
      body.status = f.status;
      if (canSeeSalary && f.salary !== '') body.salary = Number(f.salary);
    }
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/employees/' + (initial._id || initial.employeeId), body);
      else await api.post('/api/employees', body);
      onSaved(isEdit ? `${body.fullName} updated.` : `${body.fullName} added.`);
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit employee' : 'Add employee'} onClose={() => (busy ? null : onClose())}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          {isHR && (
            <Field label="Employee ID" required error={fieldErr.employeeId} hint={isEdit ? 'Identifier is fixed' : 'e.g. CY0125JS201'}>
              <input value={f.employeeId} onChange={set('employeeId')} disabled={isEdit} placeholder="CY0125JS201" />
            </Field>
          )}
          <Field label="Full name" required error={fieldErr.fullName}>
            <input value={f.fullName} onChange={set('fullName')} placeholder="Jane Doe" />
          </Field>
          <Field label="Email" error={fieldErr.email}>
            <input value={f.email} onChange={set('email')} placeholder="jane@cyethack.com" />
          </Field>
          <Field label="Phone">
            <input value={f.phone} onChange={set('phone')} placeholder="+91 …" />
          </Field>
          <Field label="Department">
            <input value={f.department} onChange={set('department')} placeholder="Engineering" />
          </Field>
          <Field label="Designation">
            <input value={f.designation} onChange={set('designation')} placeholder="Security Analyst" />
          </Field>
          <Field label="Manager">
            <select value={f.manager} onChange={set('manager')}>
              <option value="">— None —</option>
              {managers.filter((m) => m.employeeId && m.employeeId !== f.employeeId).map((m) => (
                <option key={m.employeeId} value={m.employeeId}>{m.employeeId} — {m.fullName}</option>
              ))}
            </select>
          </Field>
          <Field label="Employment type">
            <select value={f.employmentType} onChange={set('employmentType')}>
              {EMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Gender">
            <select value={f.gender} onChange={set('gender')}>
              {GENDERS.map((g) => <option key={g} value={g}>{g || '— Not specified —'}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <input value={f.location} onChange={set('location')} placeholder="Noida" />
          </Field>
          <Field label="Joining date">
            <input type="date" value={f.joiningDate} onChange={set('joiningDate')} />
          </Field>
          <Field label="Grade">
            <input value={f.grade} onChange={set('grade')} placeholder="L3" />
          </Field>
          {isHR && canSeeSalary && (
            <Field label="Salary (₹ / year)" error={fieldErr.salary} hint="Visible to HR only">
              <input type="number" min="0" value={f.salary} onChange={set('salary')} placeholder="0" />
            </Field>
          )}
          {isHR && (
            <Field label="Status">
              <select value={f.status} onChange={set('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add employee'}</button>
        </div>
      </form>
    </Modal>
  );
}
