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
  { label: 'Employee', get: (r) => r.employee ? `${r.employee.employeeId} — ${r.employee.fullName}` : '—' },
  { label: 'Department', get: (r) => r.employee?.department || '—' },
  { label: 'Basic', get: (r) => r.basic, render: (v) => '₹' + Number(v).toLocaleString('en-IN') },
  { label: 'HRA', get: (r) => r.hra, render: (v) => '₹' + Number(v).toLocaleString('en-IN') },
  { label: 'Effective From', get: (r) => r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString('en-IN') : '—' },
  { label: 'Effective To', get: (r) => r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('en-IN') : '—' },
  { label: 'Status', get: (r) => r.isActive, render: (v) => <StatusPill value={v ? 'Active' : 'Inactive'} /> },
];

export default function HRSalaryStructuresPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/salary-structures');

  const canWrite = hasPermission('salaryStructures:write');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete('/api/salary-structures/' + toDelete._id);
      toast.success('Salary structure deactivated.');
      setToDelete(null);
      await reload();
    } catch (e) { toast.error(e?.message || 'Failed to deactivate.'); }
    finally { setBusy(false); }
  }

  const actions = (r) => (
    <>
      {canWrite && <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button>}
      {canWrite && r.isActive && <button className="ws-btn sm bad" onClick={() => setToDelete(r)}>Deactivate</button>}
    </>
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Salary Structures</h1>
        <span className="ws-scope">Manage employee salary structures</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add Salary Structure</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No salary structures yet."
        />
      </Card>

      {editing && (
        <SalaryStructureForm
          initial={editing}
          employees={rows.map(r => r.employee).filter(Boolean)}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(e?.message || 'Failed.')}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Deactivate salary structure?"
        message={toDelete ? `Salary structure for ${toDelete.employee?.fullName} will be deactivated.` : ''}
        confirmText={busy ? 'Working…' : 'Deactivate'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={async () => { setBusy(true); try { await api.delete('/api/salary-structures/' + toDelete._id); toast.success('Deactivated.'); setToDelete(null); await reload(); } catch (e) { toast.error(e?.message || 'Failed.'); } finally { setBusy(false); } }}
      />
    </div>
  );
}

function SalaryStructureForm({ initial, employees, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({
    employee: initial.employee?._id || initial.employee || '',
    basic: initial.basic || 0,
    hra: initial.hra || 0,
    allowances: initial.allowances || {},
    deductions: initial.deductions || {},
    effectiveFrom: initial.effectiveFrom ? initial.effectiveFrom.split('T')[0] : '',
    effectiveTo: initial.effectiveTo ? initial.effectiveTo.split('T')[0] : '',
    isActive: initial.isActive !== false,
  });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function handleAllowancesChange(e) {
    try { setF(s => ({ ...s, allowances: JSON.parse(e.target.value) })); } catch { }
  }

  function handleDeductionsChange(e) {
    try { setF(s => ({ ...s, deductions: JSON.parse(e.target.value) })); } catch { }
  }

  function validate() {
    const err = {};
    if (!f.employee) err.employee = 'Required.';
    if (!f.effectiveFrom) err.effectiveFrom = 'Required.';
    if (f.basic === '' || Number(f.basic) < 0) err.basic = 'Enter a valid amount.';
    if (f.hra === '' || Number(f.hra) < 0) err.hra = 'Enter a valid amount.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {
      employee: f.employee,
      basic: Number(f.basic) || 0,
      hra: Number(f.hra) || 0,
      allowances: f.allowances || {},
      deductions: f.deductions || {},
      effectiveFrom: f.effectiveFrom,
      effectiveTo: f.effectiveTo || undefined,
      isActive: f.isActive,
    };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/salary-structures/' + initial._id, body);
      else await api.post('/api/salary-structures', body);
      onSaved(isEdit ? 'Salary structure updated.' : 'Salary structure created.');
    } catch (e) { onError(e); setBusy(false); }
  }

  const allowanceKeys = Object.keys(initial?.allowances || {});
  const deductionKeys = Object.keys(initial?.deductions || {});

  return (
    <Modal open title={isEdit ? 'Edit Salary Structure' : 'Add Salary Structure'} onClose={() => busy ? null : onClose()}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Employee" required error={fieldErr.employee}>
            <select value={f.employee} onChange={set('employee')}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.employeeId} — {e.fullName}</option>)}
            </select>
          </Field>
          <Field label="Basic" required error={fieldErr.basic}><input type="number" min="0" step="100" value={f.basic} onChange={set('basic')} placeholder="0" /></Field>
          <Field label="HRA" error={fieldErr.hra}><input type="number" min="0" step="100" value={f.hra} onChange={set('hra')} placeholder="0" /></Field>
          <Field label="Allowances (JSON)"><textarea value={JSON.stringify(f.allowances, null, 2)} onChange={handleAllowancesChange} placeholder='{"transport": 5000, "medical": 2000}' rows={3} /></Field>
          <Field label="Deductions (JSON)"><textarea value={JSON.stringify(f.deductions, null, 2)} onChange={handleDeductionsChange} placeholder='{"pf": 1800, "tds": 5000}' rows={3} /></Field>
          <Field label="Effective From" required error={fieldErr.effectiveFrom}><input type="date" value={f.effectiveFrom} onChange={set('effectiveFrom')} disabled={isEdit} /></Field>
          <Field label="Effective To" error={fieldErr.effectiveTo}><input type="date" value={f.effectiveTo} onChange={set('effectiveTo')} /></Field>
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