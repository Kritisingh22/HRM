/* Recruitment — job openings + candidate pipeline against the REAL backend/DB.
 *   GET    /api/hiring        (hiring:read)  → jobs (each with an embedded candidates[])
 *   POST   /api/hiring        (hiring:write) → create job
 *   PUT    /api/hiring/:id      (hiring:write) → edit job / update candidates
 *   DELETE /api/hiring/:id      (hiring:delete) → remove job
 * Candidates are embedded in the job, so adding a candidate or moving them through
 * a stage is a PUT of the updated candidates array; the server response is read
 * back so the pipeline always reflects the saved database state. */
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

const JOB_STATUS = ['Open', 'On Hold', 'Closed'];
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Selected', 'Rejected'];
const errText = (e) => e?.data?.details?.[0]
  || (e?.status === 409 ? 'A job with that ID already exists.'
    : e?.status === 403 ? 'You do not have permission to do that.'
    : e?.message || 'Something went wrong.');

const COLS = [
  { label: 'Job ID', get: (r) => r.jobId },
  { label: 'Role', get: (r) => r.title },
  { label: 'Department', get: (r) => r.department },
  { label: 'Location', get: (r) => r.location },
  { label: 'Openings', align: 'right', get: (r) => r.openings },
  { label: 'Candidates', align: 'right', get: (r) => (r.candidates ? r.candidates.length : 0) },
  { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> }
];

export default function RecruitmentPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/hiring');

  const canWrite = hasPermission('hiring:write');
  const canDelete = hasPermission('hiring:delete');

  const [editing, setEditing] = useState(null);     // job form (create/edit)
  const [managing, setManaging] = useState(null);   // candidates modal
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function removeJob() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.del('/api/hiring/' + (toDelete._id || toDelete.jobId));
      toast.success(`Job “${toDelete.title}” removed.`);
      setToDelete(null);
      await reload();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  }

  const actions = (r) => (
    <>
      <button className="ws-btn sm" onClick={() => setManaging(r)}>Candidates</button>
      {canWrite && <button className="ws-btn sm" onClick={() => setEditing(r)}>Edit</button>}
      {canDelete && <button className="ws-btn sm bad" onClick={() => setToDelete(r)}>Delete</button>}
    </>
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Recruitment</h1>
        <span className="ws-scope">Open roles &amp; candidates</span>
        {canWrite && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setEditing({})}>+ Add job</button></div>}
      </div>

      <Card>
        <DataTable
          columns={COLS}
          rows={rows}
          loading={loading}
          error={error}
          actions={actions}
          emptyText="No job openings yet. Use “Add job” to post the first role."
        />
      </Card>

      {editing && (
        <JobForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast.success(msg); await reload(); }}
          onError={(e) => toast.error(errText(e))}
        />
      )}

      {managing && (
        <CandidatesModal
          job={managing}
          canWrite={canWrite}
          onClose={() => setManaging(null)}
          onChanged={reload}
          toast={toast}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete job opening?"
        message={toDelete ? `“${toDelete.title}” (${toDelete.jobId}) and its candidate pipeline will be permanently removed.` : ''}
        confirmText={busy ? 'Working…' : 'Delete'}
        onCancel={() => (busy ? null : setToDelete(null))}
        onConfirm={removeJob}
      />
    </div>
  );
}

function JobForm({ initial, onClose, onSaved, onError }) {
  const isEdit = !!initial._id;
  const [f, setF] = useState({
    jobId: initial.jobId || '', title: initial.title || '', department: initial.department || '',
    location: initial.location || '', openings: initial.openings ?? 1, status: initial.status || 'Open',
    description: initial.description || ''
  });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!f.jobId.trim()) err.jobId = 'Required.';
    if (!f.title.trim()) err.title = 'Required.';
    if (f.openings !== '' && (isNaN(Number(f.openings)) || Number(f.openings) < 0)) err.openings = 'Enter a valid number.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {
      jobId: f.jobId.trim(), title: f.title.trim(), department: f.department.trim() || undefined,
      location: f.location.trim() || undefined, openings: Number(f.openings) || 0,
      status: f.status, description: f.description.trim() || undefined
    };
    setBusy(true);
    try {
      if (isEdit) await api.put('/api/hiring/' + (initial._id || initial.jobId), body);
      else await api.post('/api/hiring', body);
      onSaved(isEdit ? `Job “${body.title}” updated.` : `Job “${body.title}” posted.`);
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal open title={isEdit ? 'Edit job opening' : 'Add job opening'} onClose={() => (busy ? null : onClose())}>
      <form onSubmit={submit}>
        <div className="ws-form-grid">
          <Field label="Job ID" required error={fieldErr.jobId} hint={isEdit ? 'Fixed identifier' : 'e.g. JOB-105'}>
            <input value={f.jobId} onChange={set('jobId')} disabled={isEdit} placeholder="JOB-105" />
          </Field>
          <Field label="Role title" required error={fieldErr.title}>
            <input value={f.title} onChange={set('title')} placeholder="Security Engineer" />
          </Field>
          <Field label="Department"><input value={f.department} onChange={set('department')} placeholder="Engineering" /></Field>
          <Field label="Location"><input value={f.location} onChange={set('location')} placeholder="Noida / Remote" /></Field>
          <Field label="Openings" error={fieldErr.openings}><input type="number" min="0" value={f.openings} onChange={set('openings')} /></Field>
          <Field label="Status">
            <select value={f.status} onChange={set('status')}>{JOB_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </Field>
          <Field label="Description" full>
            <textarea value={f.description} onChange={set('description')} placeholder="Role summary, responsibilities, requirements…" />
          </Field>
        </div>
        <div className="ws-modal-actions">
          <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Post job'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CandidatesModal({ job, canWrite, onClose, onChanged, toast }) {
  const [cands, setCands] = useState(job.candidates || []);
  const [nc, setNc] = useState({ name: '', email: '', source: '', stage: 'Applied' });
  const [busy, setBusy] = useState(false);
  const [ncErr, setNcErr] = useState('');
  const setN = (k) => (e) => setNc((s) => ({ ...s, [k]: e.target.value }));

  const sanitize = (arr) => arr.map((c) => ({ ...(c._id ? { _id: c._id } : {}), name: c.name, email: c.email, stage: c.stage, source: c.source }));

  async function persist(nextCands, successMsg) {
    setBusy(true);
    try {
      const { job: saved } = await api.put('/api/hiring/' + (job._id || job.jobId), { candidates: sanitize(nextCands) });
      setCands(saved.candidates || []);
      toast.success(successMsg);
      onChanged();
      return true;
    } catch (e) {
      toast.error(e?.data?.details?.[0] || (e?.status === 403 ? 'You do not have permission to do that.' : e?.message || 'Could not save.'));
      return false;
    } finally { setBusy(false); }
  }

  async function addCandidate(e) {
    e.preventDefault();
    if (!nc.name.trim()) return setNcErr('Candidate name is required.');
    if (nc.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nc.email)) return setNcErr('Enter a valid email.');
    setNcErr('');
    const ok = await persist([...cands, { name: nc.name.trim(), email: nc.email.trim(), source: nc.source.trim(), stage: nc.stage }], `${nc.name.trim()} added to the pipeline.`);
    if (ok) setNc({ name: '', email: '', source: '', stage: 'Applied' });
  }

  async function changeStage(idx, stage) {
    const next = cands.map((c, i) => (i === idx ? { ...c, stage } : c));
    setCands(next); // optimistic; corrected from the server response
    await persist(next, `${cands[idx].name} moved to “${stage}”.`);
  }

  async function removeCandidate(idx) {
    const name = cands[idx].name;
    await persist(cands.filter((_, i) => i !== idx), `${name} removed from the pipeline.`);
  }

  return (
    <Modal open size="xl" title={`Candidates — ${job.title}`} onClose={() => (busy ? null : onClose())}>
      <p className="ws-card-sub" style={{ marginTop: -6 }}>{job.jobId} · {job.department || '—'} · {cands.length} candidate{cands.length === 1 ? '' : 's'}</p>

      <div className="ws-tablewrap">
        <table className="ws-table">
          <thead><tr><th>Name</th><th>Email</th><th>Source</th><th>Stage</th>{canWrite && <th className="r">Action</th>}</tr></thead>
          <tbody>
            {cands.length === 0 ? (
              <tr><td colSpan={canWrite ? 5 : 4}><div className="ws-state ws-empty">No candidates yet.</div></td></tr>
            ) : cands.map((c, i) => (
              <tr key={c._id || i}>
                <td>{c.name}</td>
                <td>{c.email || <span className="ws-muted">—</span>}</td>
                <td>{c.source || <span className="ws-muted">—</span>}</td>
                <td>
                  {canWrite ? (
                    <select value={c.stage} disabled={busy} onChange={(e) => changeStage(i, e.target.value)} style={{ height: 30, width: 'auto' }}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <StatusPill value={c.stage} />}
                </td>
                {canWrite && <td className="r"><button className="ws-btn sm bad" disabled={busy} onClick={() => removeCandidate(i)}>Remove</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <>
          <div className="ws-subhead">Add candidate</div>
          <form onSubmit={addCandidate} className="ws-form-grid">
            <Field label="Name" required error={ncErr && !nc.name.trim() ? ncErr : ''}>
              <input value={nc.name} onChange={setN('name')} placeholder="Candidate name" />
            </Field>
            <Field label="Email" error={ncErr && nc.name.trim() ? ncErr : ''}>
              <input value={nc.email} onChange={setN('email')} placeholder="name@email.com" />
            </Field>
            <Field label="Source"><input value={nc.source} onChange={setN('source')} placeholder="LinkedIn / Referral" /></Field>
            <Field label="Stage">
              <select value={nc.stage} onChange={setN('stage')}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </Field>
            <div className="ws-field full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Add candidate'}</button>
            </div>
          </form>
        </>
      )}

      <div className="ws-modal-actions">
        <button type="button" className="ws-btn" onClick={onClose} disabled={busy}>Done</button>
      </div>
    </Modal>
  );
}
