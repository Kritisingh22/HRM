/* Payroll — create & update payslips against the REAL backend/database.
 *   GET  /api/payroll          (HR: all payslips; others: own only)
 *   POST /api/payroll          (payroll:write) → create
 *   PUT  /api/payroll/:id       (payroll:write) → update
 * Net pay is computed on the SERVER (gross − deductions) and read back from the
 * response — the frontend never invents payroll figures. Duplicate period (409)
 * and deductions-exceed-gross (400) come back as friendly messages. */
import { useMemo, useState } from 'react';
import { Card } from '../../components/ui';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { Field } from '../../components/form';
import { COLUMNS } from '../../components/columns';
import { useList } from '../../hooks/useList';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { api } from '../../services/api';

const STATUSES = ['Draft', 'Approved', 'Processed', 'Paid'];
const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const num = (v) => (v === '' || v == null ? 0 : Number(v));
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const errText = (e) => e?.data?.details?.[0]
  || (e?.status === 409 ? 'A payslip for that employee and period already exists.'
    : e?.status === 403 ? 'You do not have permission to do that.'
    : e?.message || 'Something went wrong.');

export default function PayrollPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/payroll');
  const emps = useList('/api/employees');           // for the employee dropdown

  const canWrite = hasPermission('payroll:write');
  const [editing, setEditing] = useState(null);     // {} = create, {…} = edit, null = closed

  const actions = (r) => (canWrite ? <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button> : null);

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Payroll</h1>
        <span className="ws-scope">All payslips</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Create payslip</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLUMNS.payroll}
          rows={rows}
          loading={loading}
          error={error}
          actions={canWrite ? actions : undefined}
          emptyText="No payslips yet. Use “Create payslip” to add one."
        />
      </Card>

      {editing && (
        <PayslipForm
          initial={editing}
          employees={emps.rows || []}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(errText(e))}
        />
      )}
    </div>
  );
}

function PayslipForm({ initial, employees, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const d0 = initial.deductions || {};
  const [f, setF] = useState({
    employee: (initial.employee && (initial.employee._id || initial.employee)) || '',
    period: initial.period || new Date().toISOString().slice(0, 7),
    gross: initial.gross ?? '',
    pf: d0.pf ?? '', tds: d0.tds ?? '', esi: d0.esi ?? '', other: d0.other ?? '',
    status: initial.status || 'Draft',
    payDate: toDateInput(initial.payDate)
  });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const net = useMemo(() => num(f.gross) - (num(f.pf) + num(f.tds) + num(f.esi) + num(f.other)), [f]);
  const empName = (id) => { const e = employees.find((x) => x._id === id); return e ? `${e.employeeId} — ${e.fullName}` : id; };

  function validate() {
    const err = {};
    if (!f.employee) err.employee = 'Select an employee.';
    if (!f.period) err.period = 'Pick a period.';
    if (f.gross === '' || num(f.gross) < 0) err.gross = 'Enter a gross amount.';
    ['pf', 'tds', 'esi', 'other'].forEach((k) => { if (f[k] !== '' && num(f[k]) < 0) err[k] = 'Must be ≥ 0.'; });
    if (net < 0) err.gross = 'Deductions exceed gross — net cannot be negative.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const deductions = { pf: num(f.pf), tds: num(f.tds), esi: num(f.esi), other: num(f.other) };
    setBusy(true);
    try {
      if (isEdit) {
        const body = { gross: num(f.gross), status: f.status, deductions };
        if (f.payDate) body.payDate = f.payDate;
        const { payslip } = await api.put('/api/payroll/' + initial._id, body);
        onSaved(`Payslip updated — net ${money(payslip.net)}.`);
      } else {
        const body = { employee: f.employee, period: f.period, gross: num(f.gross), deductions, status: f.status };
        const { payslip } = await api.post('/api/payroll', body);
        onSaved(`Payslip created — net ${money(payslip.net)}.`);
      }
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit payslip' : 'Create payslip'} onClose={() => (busy ? null : onClose())}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Employee" required error={fieldErr.employee} full>
            {isEdit ? (
              <input value={empName(f.employee)} disabled />
            ) : (
              <select value={f.employee} onChange={set('employee')}>
                <option value="">— Select employee —</option>
                {employees.filter((e) => e.status !== 'Exited').map((e) => (
                  <option key={e._id} value={e._id}>{e.employeeId} — {e.fullName}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Period" required error={fieldErr.period} hint={isEdit ? 'Fixed once created' : 'Month this payslip covers'}>
            <input type="month" value={f.period} onChange={set('period')} disabled={isEdit} />
          </Field>
          <Field label="Gross (₹)" required error={fieldErr.gross}>
            <input type="number" min="0" value={f.gross} onChange={set('gross')} placeholder="0" />
          </Field>
          <Field label="PF" error={fieldErr.pf}><input type="number" min="0" value={f.pf} onChange={set('pf')} placeholder="0" /></Field>
          <Field label="TDS" error={fieldErr.tds}><input type="number" min="0" value={f.tds} onChange={set('tds')} placeholder="0" /></Field>
          <Field label="ESI" error={fieldErr.esi}><input type="number" min="0" value={f.esi} onChange={set('esi')} placeholder="0" /></Field>
          <Field label="Other deductions" error={fieldErr.other}><input type="number" min="0" value={f.other} onChange={set('other')} placeholder="0" /></Field>
          <Field label="Status">
            <select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </Field>
          {isEdit && <Field label="Pay date"><input type="date" value={f.payDate} onChange={set('payDate')} /></Field>}
          <Field label="Net pay (calculated)" full hint="Computed and stored by the server on save">
            <input value={money(net)} disabled className={net < 0 ? 'ws-neg' : ''} />
          </Field>
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create payslip'}</button>
        </div>
      </form>
    </Modal>
  );
}
