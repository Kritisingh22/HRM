'use strict';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, DataTable, Modal, Toast } from 'ui';
import { Field } from 'ui';
import { useList } from '../../../hooks/useList';
import { useToast } from 'ui';
import ConfirmDialog from '../../../portal/ConfirmDialog';

export default function HRCalendarPolicyPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/calendar-policy');

  const canWrite = hasPermission('calendar:write');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete('/api/calendar-policy/' + toDelete._id);
      toast.success('Calendar policy deleted.');
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
        <h1>Work Calendar Policy</h1>
        <span className="ws-scope">Configure work calendar and Saturday rules</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add Policy</button></div>}
      </div>

      <Card>
        <DataTable
          columns={[
            { label: 'Name', get: (r) => r.name },
            { label: 'Description', get: (r) => r.description },
            { label: 'Odd Saturdays Off', get: (r) => r.oddSaturdaysOff, render: (v) => <StatusPill value={v ? 'Yes' : 'No'} /> },
            { label: 'Working Days/Week', get: (r) => r.workingDaysPerWeek },
            { label: 'Standard Hours/Day', get: (r) => r.standardHoursPerDay },
            { label: 'Effective From', get: (r) => r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString('en-IN') : '—' },
            { label: 'Effective To', get: (r) => r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('en-IN') : '—' },
            { label: 'Status', get: (r) => r.isActive, render: (v) => <StatusPill value={v ? 'Active' : 'Inactive'} /> },
          ]}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No calendar policies yet."
        />
      </Card>

      {editing && (
        <CalendarPolicyForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(e?.message || 'Failed.')}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete calendar policy?"
        message={toDelete ? `“${toDelete.name}” will be permanently deleted.` : ''}
        confirmText={busy ? 'Working…' : 'Delete'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={remove}
      />
    </div>
  );
}

function CalendarPolicyForm({ initial, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({ ...initial, name: initial.name || '', description: initial.description || '', oddSaturdaysOff: initial.oddSaturdaysOff !== false, workingDaysPerWeek: initial.workingDaysPerWeek || 5, standardHoursPerDay: initial.standardHoursPerDay || 8.0, effectiveFrom: initial.effectiveFrom ? initial.effectiveFrom.split('T')[0] : '', effectiveTo: initial.effectiveTo ? initial.effectiveTo.split('T')[0] : '', isActive: initial.isActive !== false });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!f.name.trim()) err.name = 'Required.';
    if (!f.effectiveFrom) err.effectiveFrom = 'Required.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = { name: f.name.trim(), description: f.description.trim() || undefined, oddSaturdaysOff: f.oddSaturdaysOff, workingDaysPerWeek: Number(f.workingDaysPerWeek) || 5, standardHoursPerDay: Number(f.standardHoursPerDay) || 8.0, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || undefined, isActive: f.isActive };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/calendar-policy/' + initial._id, body);
      else await api.post('/api/calendar-policy', body);
      onSaved(isEdit ? 'Calendar policy updated.' : 'Calendar policy created.');
    } catch (e) { onError(e); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit Calendar Policy' : 'Add Calendar Policy'} onClose={() => busy ? null : onClose()}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Name" required error={fieldErr.name}><input value={f.name} onChange={set('name')} placeholder="Policy Name" disabled={isEdit} /></Field>
          <Field label="Description"><textarea value={f.description} onChange={set('description')} placeholder="Description" rows={3} /></Field>
          <Field label="Effective From" required error={fieldErr.effectiveFrom}><input type="date" value={f.effectiveFrom} onChange={set('effectiveFrom')} disabled={isEdit} /></Field>
          <Field label="Effective To"><input type="date" value={f.effectiveTo} onChange={set('effectiveTo')} /></Field>
          <Field label="Odd Saturdays Off"><select value={f.oddSaturdaysOff} onChange={set('oddSaturdaysOff')}>{[true, false].map(v => <option key={v} value={v}>{v ? 'Yes (1st, 3rd, 5th off)' : 'No (All Saturdays working)'}</option>)}</select></Field>
          <Field label="Working Days/Week" error={fieldErr.workingDaysPerWeek}><input type="number" min="1" max="6" value={f.workingDaysPerWeek} onChange={set('workingDaysPerWeek')} /></Field>
          <Field label="Standard Hours/Day" error={fieldErr.standardHoursPerDay}><input type="number" step="0.5" min="1" max="12" value={f.standardHoursPerDay} onChange={set('standardHoursPerDay')} /></Field>
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