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
  { label: 'Employee', get: (r) => r.employee ? `${r.employee.employeeId} — ${r.employee.fullName}` : '—' },
  { label: 'Issuer', get: (r) => r.issuer },
  { label: 'Issue Date', get: (r) => r.issueDate ? new Date(r.issueDate).toLocaleDateString('en-IN') : '—' },
  { label: 'Expiry Date', get: (r) => r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('en-IN') : '—' },
  { label: 'Credential ID', get: (r) => r.credentialId || '—' },
  { label: 'Status', get: (r) => r.isActive !== false, render: (v) => <StatusPill value={v ? 'Active' : 'Inactive'} /> },
];

export default function ManagerCertificationsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/certifications');

  const canWrite = hasPermission('certifications:write');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete('/api/certifications/' + toDelete._id);
      toast.success('Certification deleted.');
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
        <h1>Team Certifications</h1>
        <span className="ws-scope">Manage team certifications</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add Certification</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No certifications yet."
        />
      </Card>

      {editing && (
        <CertificationForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(e?.message || 'Failed.')}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete certification?"
        message={toDelete ? `“${toDelete.name}” will be permanently deleted.` : ''}
        confirmText={busy ? 'Working…' : 'Delete'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={remove}
      />
    </div>
  );
}

function CertificationForm({ initial, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({ ...initial, name: initial.name || '', issuer: initial.issuer || '', issueDate: initial.issueDate ? initial.issueDate.split('T')[0] : '', expiryDate: initial.expiryDate ? initial.expiryDate.split('T')[0] : '', isActive: initial.isActive !== false });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!f.name.trim()) err.name = 'Required.';
    if (!f.issueDate) err.issueDate = 'Required.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = { name: f.name.trim(), issuer: f.issuer.trim() || undefined, issueDate: f.issueDate, expiryDate: f.expiryDate || undefined, isActive: f.isActive };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/certifications/' + initial._id, body);
      else await api.post('/api/certifications', body);
      onSaved(isEdit ? 'Certification updated.' : 'Certification created.');
    } catch (e) { onError(e); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit Certification' : 'Add Certification'} onClose={() => busy ? null : onClose()}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Name" required error={fieldErr.name}><input value={f.name} onChange={set('name')} placeholder="Certification Name" disabled={isEdit} /></Field>
          <Field label="Issuer"><input value={f.issuer} onChange={set('issuer')} placeholder="Issuing Organization" /></Field>
          <Field label="Issue Date" required error={fieldErr.issueDate}><input type="date" value={f.issueDate} onChange={set('issueDate')} /></Field>
          <Field label="Expiry Date"><input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          <Field label="Status"><select value={f.isActive} onChange={set('isActive')}><option value={true}>Active</option><option value={false}>Inactive</option></select></Field>
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}