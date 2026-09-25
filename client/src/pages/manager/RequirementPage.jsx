/* Manager Requirement Request — Manager submits hiring requirements for their team.
 *  GET    /api/requirements   (requirements:read)  → list own requests
 *  POST   /api/requirements   (requirements:write) → create request
 *  PUT    /api/requirements/:id → update/withdraw own pending request
 *  HR reviews and can create linked hiring jobs */
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

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected', 'On Hold'];

const COLS = [
  { label: 'Title', get: (r) => r.title },
  { label: 'Department', get: (r) => r.department },
  { label: 'Team', get: (r) => r.team },
  { label: 'Positions', align: 'right', get: (r) => r.requiredCount },
  { label: 'Priority', get: (r) => r.priority, render: (v) => <StatusPill value={v} /> },
  { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> },
  { label: 'Requested', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
];

const errText = (e) => e?.data?.details?.[0]
  || (e?.status === 403 ? 'You do not have permission to do that.'
    : e?.message || 'Something went wrong.');

export default function RequirementPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/requirements');

  const canWrite = hasPermission('requirements:write');
  const canRead = hasPermission('requirements:read');

  const [editing, setEditing] = useState(null);     // {} = add, {…} = edit
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function removeReq() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.del('/api/requirements/' + (toDelete._id));
      toast.success(`Requirement request “${toDelete.title}” removed.`);
      setToDelete(null);
      await reload();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  }

  const actions = (r) => (
    <>
      {r.status === 'Pending' && canWrite && <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button>}
      {r.status === 'Pending' && canWrite && <button className="ws-btn sm bad" onClick={() => setToDelete(r)}>Withdraw</button>}
      {r.linkedJob && <button className="ws-btn sm" onClick={() => window.open('/hr/recruitment', '_blank')}>View Job</button>}
    </>
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Requirement Requests</h1>
        <span className="ws-scope">Your team's hiring requests</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ New Request</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLS}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No requirement requests yet. Use “New Request” to submit your first hiring requirement."
        />
      </Card>

      {editing && (
        <RequirementForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(errText(e))}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Withdraw request?"
        message={toDelete ? `“${toDelete.title}” will be withdrawn and cannot be restored.` : ''}
        confirmText={busy ? 'Working…' : 'Withdraw'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={removeReq}
      />
    </div>
  );
}

function RequirementForm({ initial, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({
    title: initial.title || '',
    description: initial.description || '',
    department: initial.department || '',
    team: initial.team || '',
    requiredCount: initial.requiredCount || 1,
    skills: initial.skills || '',
    priority: initial.priority || 'Normal'
  });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!f.title.trim()) err.title = 'Required.';
    if (!f.department.trim()) err.department = 'Required.';
    if (!f.team.trim()) err.team = 'Required.';
    if (isNaN(Number(f.requiredCount)) || Number(f.requiredCount) < 1) err.requiredCount = 'Enter a valid number (min 1).';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      department: f.department.trim(),
      team: f.team.trim(),
      requiredCount: Number(f.requiredCount),
      skills: f.skills.trim() || undefined,
      priority: f.priority
    };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/requirements/' + initial._id, body);
      else await api.post('/api/requirements', body);
      onSaved(isEdit ? `Request “${body.title}” updated.` : `Request “${body.title}” submitted. HR has been notified.`);
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit requirement request' : 'New requirement request'} onClose={() => (busy ? null : onClose())}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Title" required error={fieldErr.title}>
            <input value={f.title} onChange={set('title')} placeholder="e.g. Senior Django Developer" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="Department" required error={fieldErr.department}>
            <input value={f.department} onChange={set('department')} placeholder="Engineering" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="Team" required error={fieldErr.team}>
            <input value={f.team} onChange={set('team')} placeholder="Backend Team" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="Positions" error={fieldErr.requiredCount}>
            <input type="number" min="1" value={f.requiredCount} onChange={set('requiredCount')} disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="Priority">
            <select value={f.priority} onChange={set('priority')} disabled={isEdit && f.status !== 'Pending'}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Skills / Requirements" full>
            <textarea value={f.skills} onChange={set('skills')} placeholder="e.g. Django, PostgreSQL, AWS, Docker" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
          <Field label="Description" full>
            <textarea value={f.description} onChange={set('description')} placeholder="Role summary, responsibilities, team context…" disabled={isEdit && f.status !== 'Pending'} />
          </Field>
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Submit request'}</button>
        </div>
      </form>
    </Modal>
  );
}