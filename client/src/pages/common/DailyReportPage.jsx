/* DailyReportPage — role-aware daily task tracker.
 *  - EMPLOYEE: create/submit own reports, view own history, edit drafts
 *  - MANAGER: view team reports, review submitted reports, monitor pending/missing
 *  - HR/ADMIN/SUPER_ADMIN: view all reports, review any, monitor org-wide */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, personName, personId } from '../../components/ui';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const todayStr = () => new Date().toISOString().split('T')[0];
const errText = (e) => e?.data?.details?.[0] || e?.message || 'Something went wrong.';

const STATUS_OPTIONS = ['Draft', 'Submitted', 'Reviewed', 'Overdue'];

export default function DailyReportPage({ title, scopeNote }) {
  const { user } = useAuth();
  const toast = useToast();
  const isEmployee = user?.role === 'EMPLOYEE';
  const isManager = user?.role === 'MANAGER';
  const isHR = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const canReview = isManager || isHR;

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [summary, setSummary] = useState(null);
  const [missingCount, setMissingCount] = useState(0);

  // Form state
  const [form, setForm] = useState({
    date: todayStr(),
    tasksCompleted: '',
    workDescription: '',
    pendingWork: '',
    blockers: '',
    remarks: '',
    status: 'Draft',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set('date', dateFilter);
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get('/api/daily-reports?' + params.toString());
      setRows(data.reports || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await api.get('/api/daily-reports/summary');
      setSummary(data.summary);
    } catch (e) {
      // ignore
    }
  }, []);

  const loadMissing = useCallback(async () => {
    if (!canReview) return;
    try {
      const data = await api.get('/api/daily-reports/missing');
      setMissingCount(data.count);
    } catch (e) {
      // ignore
    }
  }, [canReview]);

  useEffect(() => { load(); loadSummary(); loadMissing(); }, [load, loadSummary, loadMissing]);

  async function act(id, status, label) {
    setBusyId(id);
    try {
      await api.put('/api/daily-reports/' + id, { status });
      toast.success(label);
      load();
      loadSummary();
    } catch (e) {
      setBusyId(null);
      toast.error(errText(e));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.tasksCompleted.trim() && !form.workDescription.trim()) {
      return toast.error('Please add at least tasks completed or work description.');
    }
    setBusyId('form');
    try {
      const body = { ...form, date: form.date };
      await api.post('/api/daily-reports', body);
      toast.success(editing ? 'Report updated.' : 'Report submitted.');
      setShowForm(false);
      setEditing(null);
      setForm({ date: todayStr(), tasksCompleted: '', workDescription: '', pendingWork: '', blockers: '', remarks: '', status: 'Draft' });
      load();
      loadSummary();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusyId(null);
    }
  }

  function startNew() {
    setEditing(null);
    setForm({ date: todayStr(), tasksCompleted: '', workDescription: '', pendingWork: '', blockers: '', remarks: '', status: 'Draft' });
    setShowForm(true);
  }

  function editReport(r) {
    setEditing(r);
    setForm({
      date: r.date?.split('T')[0] || todayStr(),
      tasksCompleted: r.tasksCompleted || '',
      workDescription: r.workDescription || '',
      pendingWork: r.pendingWork || '',
      blockers: r.blockers || '',
      remarks: r.remarks || '',
      status: r.status,
    });
    setShowForm(true);
  }

  async function sendReminders() {
    try {
      const res = await api.post('/api/daily-reports/send-reminders', { date: dateFilter || todayStr() });
      toast.success(`Reminders sent: ${res.remindersSent}`);
    } catch (e) {
      toast.error(errText(e));
    }
  }

  if (error) return <ErrorNote error={error} onRetry={load} />;

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>{title || 'Daily Reports'}</h1>
        {scopeNote && <span className="ws-scope">{scopeNote}</span>}
        {!isEmployee && (
          <div className="ws-page-actions">
            {canReview && missingCount > 0 && (
              <button className="ws-btn amber" onClick={sendReminders}>
                ⚠ {missingCount} Missing — Send Reminders
              </button>
            )}
            {isEmployee && <button className="ws-btn primary" onClick={startNew}>+ New Report</button>}
            {isHR && <button className="ws-btn" onClick={startNew}>+ Add Report</button>}
          </div>
        )}
      </div>

      {/* Summary Cards for Manager/HR */}
      {canReview && summary && (
        <div className="ws-stats" style={{ marginBottom: 16 }}>
          <div className="ws-stat">
            <div className="ws-stat-label">Total Reports</div>
            <div className="ws-stat-value">{summary.total}</div>
          </div>
          <div className="ws-stat">
            <div className="ws-stat-label">Submitted</div>
            <div className="ws-stat-value" style={{ color: '#3b82f6' }}>{summary.submitted}</div>
          </div>
          <div className="ws-stat">
            <div className="ws-stat-label">Reviewed</div>
            <div className="ws-stat-value" style={{ color: '#22c55e' }}>{summary.reviewed}</div>
          </div>
          <div className="ws-stat">
            <div className="ws-stat-label">Draft</div>
            <div className="ws-stat-value" style={{ color: '#f59e0b' }}>{summary.draft}</div>
          </div>
          <div className="ws-stat">
            <div className="ws-stat-label">Overdue</div>
            <div className="ws-stat-value" style={{ color: '#ef4444' }}>{summary.overdue}</div>
          </div>
          <div className="ws-stat">
            <div className="ws-stat-label">Missing</div>
            <div className="ws-stat-value" style={{ color: '#ef4444' }}>{missingCount}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card sub="Filters">
        <div className="ws-form-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="ws-field" style={{ minWidth: 180 }}>
            <label className="ws-field-label">Date</label>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div className="ws-field" style={{ minWidth: 150 }}>
            <label className="ws-field-label">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="ws-btn" onClick={() => { setDateFilter(''); setStatusFilter(''); }}>Clear</button>
        </div>
      </Card>

      {/* Create/Edit Form for Employee */}
      {isEmployee && showForm && (
        <Card title={editing ? 'Edit Daily Report' : 'Submit Daily Report'} sub={editing ? `Editing report for ${fmtDate(editing.date)}` : `Date: ${fmtDate(selectedDate)}`}>
          <form onSubmit={handleSubmit}>
            <div className="ws-form-grid">
              <div className="ws-field">
                <label className="ws-field-label">Date <em>*</em></label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} disabled={editing} required />
              </div>
              <div className="ws-field full">
                <label className="ws-field-label">Tasks Completed <em>*</em></label>
                <textarea value={form.tasksCompleted} onChange={(e) => setForm({ ...form, tasksCompleted: e.target.value })} placeholder="List tasks you completed today..." rows={3} required />
              </div>
              <div className="ws-field full">
                <label className="ws-field-label">Work Description</label>
                <textarea value={form.workDescription} onChange={(e) => setForm({ ...form, workDescription: e.target.value })} placeholder="Describe your work in detail..." rows={3} />
              </div>
              <div className="ws-field full">
                <label className="ws-field-label">Pending Work</label>
                <textarea value={form.pendingWork} onChange={(e) => setForm({ ...form, pendingWork: e.target.value })} placeholder="Tasks that need to be carried forward..." rows={2} />
              </div>
              <div className="ws-field full">
                <label className="ws-field-label">Blockers / Issues</label>
                <textarea value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} placeholder="Any blockers, dependencies, or issues..." rows={2} />
              </div>
              <div className="ws-field full">
                <label className="ws-field-label">Remarks</label>
                <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Additional notes..." rows={2} />
              </div>
              {!editing && (
                <div className="ws-field">
                  <label className="ws-field-label">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="Draft">Save as Draft</option>
                    <option value="Submitted">Submit</option>
                  </select>
                </div>
              )}
            </div>
            <div className="ws-modal-actions">
              <button type="button" className="ws-btn" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
              <button type="submit" className="ws-btn primary" disabled={busyId === 'form'}>{busyId === 'form' ? 'Saving…' : editing ? 'Update Report' : (form.status === 'Submitted' ? 'Submit Report' : 'Save Draft')}</button>
            </div>
          </form>
        </Card>
      )}

      {/* Reports Table */}
      <Card title={isEmployee ? 'My Daily Reports' : canReview ? 'Team Daily Reports' : 'Daily Reports'} sub={isEmployee ? 'Your submitted reports' : canReview ? 'Review and monitor team reports' : 'All reports'}>
        {loading ? <Spinner /> : rows === null ? null : rows.length === 0 ? <EmptyState>No daily reports found for the selected filters.</EmptyState> : (
          <div className="ws-tablewrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {!isEmployee && <th>Employee</th>}
                  {!isEmployee && <th>Department</th>}
                  <th>Status</th>
                  <th>Tasks Completed</th>
                  <th>Pending Work</th>
                  <th>Blockers</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOwn = personId(r.employee) === user?.employeeId;
                  const isDraft = r.status === 'Draft';
                  const isSubmitted = r.status === 'Submitted';
                  const isReviewed = r.status === 'Reviewed';
                  const isOverdue = r.status === 'Overdue';
                  const busy = busyId === r._id;

                  return (
                    <tr key={r._id}>
                      <td>{fmtDate(r.date)}</td>
                      {!isEmployee && <td>{personName(r.employee)}</td>}
                      {!isEmployee && <td>{r.employee?.department || '—'}</td>}
                      <td><StatusPill value={r.status} /></td>
                      <td style={{ maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.tasksCompleted || <span className="ws-muted">—</span>}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pendingWork || <span className="ws-muted">—</span>}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.blockers || <span className="ws-muted">—</span>}</td>
                      <td className="r">
                        <span className="ws-actions">
                          {isDraft && isOwn && (
                            <>
                              <button className="ws-btn sm" disabled={busy} onClick={() => editReport(r)}>Edit</button>
                              <button className="ws-btn sm ok" disabled={busy} onClick={() => act(r._id, 'Submitted', 'Report submitted for review.')}>Submit</button>
                            </>
                          )}
                          {isSubmitted && canReview && !isOwn && (
                            <>
                              <button className="ws-btn sm ok" disabled={busy} onClick={() => act(r._id, 'Reviewed', 'Report reviewed.')}>Review</button>
                            </>
                          )}
                          {isReviewed && <span className="ws-muted">Reviewed</span>}
                          {isOverdue && <span className="ws-pill bad">Overdue</span>}
                          {!canReview && !isOwn && !isDraft && <span className="ws-muted">—</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}