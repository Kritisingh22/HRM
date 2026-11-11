'use strict';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, DataTable, Modal, Toast } from 'ui';
import { Field } from 'ui';
import { useList } from '../../../hooks/useList';
import { useToast } from 'ui';
import ConfirmDialog from '../../../portal/ConfirmDialog';

const COLUMNS = [
  { label: 'Name', get: (r) => r.name },
  { label: 'Description', get: (r) => r.description },
  { label: 'Default Entitlement', get: (r) => r.defaultEntitlement || 0, render: (v) => v + ' days' },
  { label: 'Status', get: (r) => r.isActive, render: (v) => <StatusPill value={v ? 'Active' : 'Inactive'} /> },
];

export default function HRLeaveTypesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/leave-types');

  const canWrite = hasPermission('leaveTypes:write');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete('/api/leave-types/' + toDelete._id);
      toast.success('Leave type deleted.');
      setToDelete(null);
      await reload();
    } catch (e) { toast.error(e?.message || 'Failed.'); }
    finally { setBusy(false); }
  }

  const actions = (r) => (
    <>
      {canWrite && <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button>}
      {canWrite && <button className="ws-btn sm bad" onClick={() => setToDelete(r)}>Delete</button>}
    </>
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Leave Types</h1>
        <span className="ws-scope">Manage leave types and entitlements</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add Leave Type</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No leave types yet."
        />
      </Card>

      {editing && (
        <LeaveTypeForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(e?.message || 'Failed.')}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete leave type?"
        message={toDelete ? `“${toDelete.name}” will be permanently deleted.` : ''}
        confirmText={busy ? 'Working…' : 'Delete'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={remove}
      />
    </div>
  );
}

function LeaveTypeForm({ initial, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({ ...initial, name: initial.name || '', description: initial.description || '', defaultEntitlement: initial.defaultEntitlement || 0, isActive: initial.isActive !== false });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!f.name.trim()) err.name = 'Required.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = { name: f.name.trim(), description: f.description.trim() || undefined, defaultEntitlement: Number(f.defaultEntitlement) || 0, isActive: f.isActive };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/leave-types/' + initial._id, body);
      else await api.post('/api/leave-types', body);
      onSaved(isEdit ? 'Leave type updated.' : 'Leave type created.');
    } catch (e) { onError(e); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit Leave Type' : 'Add Leave Type'} onClose={() => busy ? null : onClose()}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Name" required error={fieldErr.name}><input value={f.name} onChange={set('name')} placeholder="e.g. Sick Leave" disabled={isEdit} /></Field>
          <Field label="Description"><textarea value={f.description} onChange={set('description')} placeholder="Description" rows={3} /></Field>
          <Field label="Default Entitlement (days)" error={fieldErr.defaultEntitlement}><input type="number" min="0" step="0.5" value={f.defaultEntitlement} onChange={set('defaultEntitlement')} placeholder="0" /></Field>
          <Field label="Status"><select value={f.isActive} onChange={set('isActive')}>{[true, false].map(v => <option key={v} value={v}>{v ? 'Active' : 'Inactive'}</option>)}</select></Field>
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}