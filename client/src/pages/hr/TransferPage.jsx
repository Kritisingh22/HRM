/* HR Transfers & Department Changes — HR manages employee transfers, promotions, department changes.
 *  GET    /api/transfers   (transfers:read)  → list all (scoped)
 *  POST   /api/transfers   (transfers:write) → create transfer
 *  PUT    /api/transfers/:id (transfers:approve) → approve/reject/implement
 *  When implemented, Employee record is updated automatically */
import { useState } from 'react';
import { Card, StatusPill } from '../../components/ui';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { Field } from '../../components/form';
import ConfirmDialog from '../../portal/ConfirmDialog';
import { useList } from '../../hooks/useList';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { api } from '../../services/api';

const TRANSFER_TYPES = ['Transfer', 'Department Change', 'Promotion', 'Demotion', 'Role Change', 'Location Change'];
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Implemented'];

const COLS = [
  { label: 'Employee', get: (r) => r.employee ? `${r.employee.fullName} (${r.employee.employeeId})` : '—' },
  { label: 'Type', get: (r) => r.type, render: (v) => <StatusPill value={v} /> },
  { label: 'From Department', get: (r) => r.fromDepartment || '—' },
  { label: 'To Department', get: (r) => r.toDepartment || '—' },
  { label: 'From Designation', get: (r) => r.fromDesignation || '—' },
  { label: 'To Designation', get: (r) => r.toDesignation || '—' },
  { label: 'Effective Date', get: (r) => r.effectiveDate ? new Date(r.effectiveDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
  { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> },
];

const errText = (e) => e?.data?.details?.[0]
  || (e?.status === 403 ? 'You do not have permission to do that.'
    : e?.message || 'Something went wrong.');

export default function TransferPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/transfers');
  const emps = useList('/api/employees');

  const canWrite = hasPermission('transfers:write');
  const canApprove = hasPermission('transfers:approve');
  const canDelete = hasPermission('transfers:delete');

  const [editing, setEditing] = useState(null);     // {} = add, {…} = edit
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function removeTransfer() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.del('/api/transfers/' + (toDelete._id));
      toast.success(`Transfer record for “${toDelete.employee?.fullName || toDelete.employee}” removed.`);
      setToDelete(null);
      await reload();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  }

  const actions = (r) => (
    <>
      {canWrite && r.status === 'Pending' && <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button>}
      {canApprove && r.status === 'Pending' && (
        <>
          <button className="ws-btn sm ok" onClick={() => handleStatusChange(r, 'Approved')}>Approve</button>
          <button className="ws-btn sm bad" onClick={() => handleStatusChange(r, 'Rejected')}>Reject</button>
        </>
      )}
      {canApprove && r.status === 'Approved' && <button className="ws-btn sm primary" onClick={() => handleStatusChange(r, 'Implemented')}>Implement</button>}
      {canDelete && r.status !== 'Implemented' && <button className="ws-btn sm bad" onClick={() => setToDelete(r)}>Delete</button>}
    </>
  );

  async function handleStatusChange(transfer, newStatus) {
    try {
      await api.put('/api/transfers/' + transfer._id, { status: newStatus });
      toast.success(`Transfer ${newStatus.toLowerCase()}.`);
      await reload();
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Transfers & Department Changes</h1>
        <span className="ws-scope">Organizational changes</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ New Transfer</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLS}
          rows={rows}
          loading={loading}
          error={error}
          actions={(canWrite || canApprove || canDelete) ? actions : undefined}
          emptyText="No transfer records yet. Use “New Transfer” to create the first record."
        />
      </Card>

      {editing && (
        <TransferForm
          initial={editing}
          employees={emps.rows || []}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(errText(e))}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete transfer record?"
        message={toDelete ? `Transfer for “${toDelete.employee?.fullName || toDelete.employee}” will be permanently removed.` : ''}
        confirmText={busy ? 'Working…' : 'Delete'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={removeTransfer}
      />
    </div>
  );
}

function TransferForm({ initial, employees, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({
    employee: initial.employee?._id || initial.employee || '',
    type: initial.type || 'Transfer',
    fromDepartment: initial.fromDepartment || '',
    fromDesignation: initial.fromDesignation || '',
    fromLocation: initial.fromLocation || '',
    fromManager: initial.fromManager || '',
    toDepartment: initial.toDepartment || '',
    toDesignation: initial.toDesignation || '',
    toLocation: initial.toLocation || '',
    toManager: initial.toManager || '',
    reason: initial.reason || '',
    effectiveDate: initial.effectiveDate ? new Date(initial.effectiveDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
  });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  // Populate from values when employee changes
  const handleEmployeeChange = async (employeeId) => {
    setF(s => ({ ...s, employee: employeeId }));
    if (!employeeId) return;
    try {
      const emp = employees.find(e => e._id === employeeId);
      if (emp) {
        setF(s => ({
          ...s,
          fromDepartment: emp.department || '',
          fromDesignation: emp.designation || '',
          fromLocation: emp.location || '',
          fromManager: emp.manager || '',
          toDepartment: emp.department || '',
          toDesignation: emp.designation || '',
          toLocation: emp.location || '',
          toManager: emp.manager || '',
        }));
      }
    } catch (e) {
      console.error('Failed to load employee details:', e);
    }
  };

  function validate() {
    const err = {};
    if (!f.employee) err.employee = 'Required.';
    if (!f.type) err.type = 'Required.';
    if (!f.effectiveDate) err.effectiveDate = 'Required.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {
      employee: f.employee,
      type: f.type,
      fromDepartment: f.fromDepartment || undefined,
      fromDesignation: f.fromDesignation || undefined,
      fromLocation: f.fromLocation || undefined,
      fromManager: f.fromManager || undefined,
      toDepartment: f.toDepartment || undefined,
      toDesignation: f.toDesignation || undefined,
      toLocation: f.toLocation || undefined,
      toManager: f.toManager || undefined,
      reason: f.reason.trim() || undefined,
      effectiveDate: f.effectiveDate
    };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/transfers/' + initial._id, body);
      else await api.post('/api/transfers', body);
      onSaved(isEdit ? `Transfer updated.` : `Transfer created. Employee and managers have been notified.`);
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit transfer' : 'New transfer / department change'} onClose={() => (busy ? null : onClose())}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Employee" required error={fieldErr.employee}>
            <select value={f.employee} onChange={(e) => handleEmployeeChange(e.target.value)} disabled={isEdit}>
              <option value="">— Select Employee —</option>
              {employees.filter((emp) => emp.status !== 'Exited').map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.fullName} ({emp.employeeId}) — {emp.department || '—'}</option>
              ))}
            </select>
          </Field>
          <Field label="Type" required error={fieldErr.type}>
            <select value={f.type} onChange={set('type')} disabled={isEdit && f.status !== 'Pending'}>
              {TRANSFER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Effective Date" required error={fieldErr.effectiveDate}>
            <input type="date" value={f.effectiveDate} onChange={set('effectiveDate')} disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="From Department">
            <input value={f.fromDepartment} onChange={set('fromDepartment')} disabled={true} />
          </Field>
          <Field label="To Department">
            <input value={f.toDepartment} onChange={set('toDepartment')} placeholder="New department" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="From Designation">
            <input value={f.fromDesignation} onChange={set('fromDesignation')} disabled={true} />
          </Field>
          <Field label="To Designation">
            <input value={f.toDesignation} onChange={set('toDesignation')} placeholder="New designation" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="From Location">
            <input value={f.fromLocation} onChange={set('fromLocation')} disabled={true} />
          </Field>
          <Field label="To Location">
            <input value={f.toLocation} onChange={set('toLocation')} placeholder="New location" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="From Manager (Employee ID)">
            <input value={f.fromManager} onChange={set('fromManager')} disabled={true} />
          </Field>
          <Field label="To Manager (Employee ID)">
            <input value={f.toManager} onChange={set('toManager')} placeholder="New manager's employee ID" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="Reason" full>
            <textarea value={f.reason} onChange={set('reason')} placeholder="Reason for transfer/department change" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create transfer'}</button>
        </div>
      </form>
    </Modal>
  );
}