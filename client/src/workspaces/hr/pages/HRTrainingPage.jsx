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
  { label: 'Title', get: (r) => r.title },
  { label: 'Category', get: (r) => r.category },
  { label: 'Duration (hrs)', get: (r) => r.durationHours },
  { label: 'Mandatory', get: (r) => r.isMandatory, render: (v) => v ? 'Yes' : 'No' },
  { label: 'Validity (months)', get: (r) => r.validityMonths || '—' },
  { label: 'Status', get: (r) => r.isActive, render: (v) => <StatusPill value={v ? 'Active' : 'Inactive'} /> },
];

export default function HRTrainingPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/training');

  const canWrite = hasPermission('trainings:write');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete('/api/training/' + toDelete._id);
      toast.success('Training deleted.');
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
        <h1>Training Programs</h1>
        <span className="ws-scope">Manage training programs</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add Training</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No training programs yet."
        />
      </Card>

      {editing && (
        <TrainingForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(e?.message || 'Failed.')}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete training?"
        message={toDelete ? `“${toDelete.title}” will be permanently deleted.` : ''}
        confirmText={busy ? 'Working…' : 'Delete'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={remove}
      />
    </div>
  );
}

function TrainingForm({ initial, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({ ...initial, title: initial.title || '', description: initial.description || '', category: initial.category || '', durationHours: initial.durationHours || 0, isMandatory: initial.isMandatory || false, validityMonths: initial.validityMonths || '', isActive: initial.isActive !== false });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!f.title.trim()) err.title = 'Required.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = { title: f.title.trim(), description: f.description.trim() || undefined, category: f.category.trim() || undefined, durationHours: Number(f.durationHours) || 0, isMandatory: f.isMandatory, validityMonths: f.validityMonths ? Number(f.validityMonths) : undefined, isActive: f.isActive };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/training/' + initial._id, body);
      else await api.post('/api/training', body);
      onSaved(isEdit ? 'Training updated.' : 'Training created.');
    } catch (e) { onError(e); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit Training' : 'Add Training'} onClose={() => busy ? null : onClose()}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Title" required error={fieldErr.title}><input value={f.title} onChange={set('title')} placeholder="Training Title" disabled={isEdit} /></Field>
          <Field label="Category"><input value={f.category} onChange={set('category')} placeholder="Category" /></Field>
          <Field label="Duration (hrs)" error={fieldErr.durationHours}><input type="number" min="0" value={f.durationHours} onChange={set('durationHours')} placeholder="0" /></Field>
          <Field label="Mandatory"><select value={f.isMandatory} onChange={set('isMandatory')}>{[true, false].map(v => <option key={v} value={v}>{v ? 'Yes' : 'No'}</option>)}</select></Field>
          <Field label="Validity (months)"><input type="number" min="1" value={f.validityMonths} onChange={set('validityMonths')} placeholder="Optional" /></Field>
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