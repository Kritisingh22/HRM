/* ============================================================
   Offboarding — exit records with the handover checklist,
   asset return, clearance and final settlement tracker.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmpCell, EmptyState, Pill, Progress, StatRow } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { niceDate, todayISO } from '@/lib/date';
import { clampPct } from '@/lib/format';
import { calculateLastWorkingDay, getNoticePeriodOptions, type NoticePeriodOption } from '@/lib/noticePeriod';
import type { ExitRecord } from '@/types';

function statusFor(x: ExitRecord): ExitRecord['status'] {
  if (x.assetReturn === 'Completed' && x.clearance === 'Completed' && x.settlement === 'Processed') return 'Exited';
  if (x.lastDay < todayISO()) return 'Clearance Pending';
  return 'Notice Period';
}

function progressFor(x: ExitRecord, checklist: string[], items: string[]): number {
  const done = [
    x.assetReturn === 'Completed',
    x.clearance === 'Completed',
    x.settlement === 'Processed',
    ...items.map((i) => checklist.includes(i)),
  ];
  return clampPct((done.filter(Boolean).length / done.length) * 100);
}

export function OffboardingPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { canManage } = useAuth();
  const { toast } = useToast();
  const [detail, setDetail] = useState<ExitRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [empId, setEmpId] = useState('');
  const [resignDate, setResignDate] = useState(todayISO());
  const [lastDay, setLastDay] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<NoticePeriodOption>('30 days');

  // Auto-calculate last working day when resignation date or notice period changes
  const recalculateLastDay = () => {
    const calculated = calculateLastWorkingDay(resignDate, notice);
    setLastDay(calculated);
  };

  // Initialize lastDay on mount
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    recalculateLastDay();
    setInitialized(true);
  }

  const exits = useMemo(
    () => [...data.exits].sort((a, b) => (a.lastDay < b.lastDay ? 1 : -1)),
    [data.exits],
  );

  const checklistOf = (id: string) => data.exitChecklists[id] ?? [];

  const toggleItem = (x: ExitRecord, item: string) => {
    const current = checklistOf(x.id);
    const done = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
    dispatch({
      type: 'set',
      patch: { exitChecklists: { ...data.exitChecklists, [x.id]: done } },
    });
  };

  const setFlag = (x: ExitRecord, key: 'assetReturn' | 'clearance' | 'settlement', value: string) => {
    const next: ExitRecord = { ...x, [key]: value } as ExitRecord;
    const status = statusFor(next);
    dispatch({ type: 'update', collection: 'exits', id: x.id, patch: { [key]: value, status } });
    audit('Exit checklist updated', `${x.id} · ${key} → ${value}`);
    if (status === 'Exited') {
      dispatch({ type: 'update', collection: 'employees', id: x.employeeId, patch: { status: 'Resigned' } });
      notify(`${data.employees.find((e) => e.id === x.employeeId)?.name ?? x.employeeId} offboarded`);
      toast('Offboarding completed — the roster has been updated.', 'success');
    }
    setDetail((prev) => (prev && prev.id === x.id ? { ...prev, [key]: value, status } as ExitRecord : prev));
  };

  const createExit = () => {
    if (!empId) {
      toast('Pick the employee who is leaving.', 'error');
      return;
    }
    const id = nextId('EXT-', 2);
    const record: ExitRecord = {
      id,
      employeeId: empId,
      resignationDate: resignDate,
      lastDay,
      reason,
      noticePeriod: notice,
      assetReturn: 'Pending',
      clearance: 'Pending',
      settlement: 'Pending',
      status: 'Notice Period',
    };
    dispatch({ type: 'add', collection: 'exits', item: record, prepend: true });
    audit('Exit initiated', `${empId} (${id})`);
    notify(`${data.employees.find((e) => e.id === empId)?.name ?? empId} submitted a resignation`);
    toast(`Exit record ${id} created.`, 'success');
    setCreating(false);
    setReason('');
  };

  const stats = useMemo(() => {
    const due = data.exits.filter((x) => x.settlement === 'Pending' && x.lastDay <= todayISO()).length;
    return {
      active: data.exits.filter((x) => x.status !== 'Exited').length,
      assets: data.exits.filter((x) => x.assetReturn === 'Pending').length,
      clearance: data.exits.filter((x) => x.clearance === 'Pending').length,
      settlementDue: due,
      completed: data.exits.filter((x) => x.status === 'Exited').length,
    };
  }, [data.exits]);

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Offboarding</h2>
            <div className="sub">Exit records, handover checklists, asset return and final settlement</div>
          </div>
          {canManage ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} type="button">
              <Icon name="userMinus" size={14} /> Initiate exit
            </button>
          ) : null}
        </div>

        <StatRow
          items={[
            { k: 'Active exits', v: stats.active, s: 'in notice period' },
            { k: 'Assets pending', v: stats.assets },
            { k: 'Clearance pending', v: stats.clearance },
            { k: 'Settlement due', v: stats.settlementDue },
            { k: 'Completed', v: stats.completed },
          ]}
        />

        {exits.length === 0 ? (
          <EmptyState icon="userMinus" title="No exits in progress" sub="Initiate an exit to start the offboarding checklist." />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Resignation</th>
                  <th>Last day</th>
                  <th>Notice</th>
                  <th>Reason</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {exits.map((x) => {
                  const emp = data.employees.find((e) => e.id === x.employeeId);
                  return (
                    <tr key={x.id}>
                      <td>
                        <EmpCell name={emp?.name ?? x.employeeId} sub={emp?.designation ?? ''} seed={x.employeeId} />
                      </td>
                      <td className="num">{niceDate(x.resignationDate)}</td>
                      <td className="num">{niceDate(x.lastDay)}</td>
                      <td>{x.noticePeriod}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 200 }}>{x.reason || '—'}</td>
                      <td style={{ minWidth: 150 }}>
                        <Progress value={progressFor(x, checklistOf(x.id), data.exitItems)} />
                      </td>
                      <td>
                        <Pill status={x.status} />
                      </td>
                      <td>
                        <div className="act-btns">
                          <button className="btn btn-outline btn-sm" onClick={() => setDetail(x)} type="button">
                            Checklist
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-foot">
          Asset return, clearance and settlement are tracked per employee; the roster marks the person Resigned once all
          three complete.
        </div>
      </section>

      {detail ? (
        <Modal
          title={`Offboarding — ${data.employees.find((e) => e.id === detail.employeeId)?.name ?? detail.employeeId}`}
          onClose={() => setDetail(null)}
          large
          footer={
            <button className="btn btn-primary" onClick={() => setDetail(null)} type="button">
              Done
            </button>
          }
        >
          <div className="detail-grid" style={{ marginBottom: 16 }}>
            <dt>Resignation</dt>
            <dd>{niceDate(detail.resignationDate)}</dd>
            <dt>Last working day</dt>
            <dd>{niceDate(detail.lastDay)}</dd>
            <dt>Notice period</dt>
            <dd>{detail.noticePeriod}</dd>
            <dt>Reason</dt>
            <dd>{detail.reason || '—'}</dd>
            <dt>Status</dt>
            <dd>
              <Pill status={detail.status} />
            </dd>
          </div>

          <Progress value={progressFor(detail, checklistOf(detail.id), data.exitItems)} label="Offboarding progress" />

          <div className="form-2col" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="ex-assets">Asset return</label>
              <select
                id="ex-assets"
                value={detail.assetReturn}
                onChange={(e) => setFlag(detail, 'assetReturn', e.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ex-clear">Department clearance</label>
              <select id="ex-clear" value={detail.clearance} onChange={(e) => setFlag(detail, 'clearance', e.target.value)}>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ex-settle">Final settlement</label>
            <select id="ex-settle" value={detail.settlement} onChange={(e) => setFlag(detail, 'settlement', e.target.value)}>
              <option value="Pending">Pending</option>
              <option value="Processed">Processed</option>
            </select>
          </div>

          <div className="card-head" style={{ marginBottom: 6 }}>
            <div>
              <h2>Handover checklist</h2>
              <div className="sub">Shared across the exit record</div>
            </div>
          </div>
          <ul className="checklist">
            {data.exitItems.map((item) => {
              const done = checklistOf(detail.id).includes(item);
              return (
                <li key={item}>
                  <input
                    type="checkbox"
                    id={`${detail.id}-${item}`}
                    checked={done}
                    onChange={() => toggleItem(detail, item)}
                  />
                  <label htmlFor={`${detail.id}-${item}`} className={done ? 'done' : undefined} style={{ cursor: 'pointer' }}>
                    {item}
                  </label>
                </li>
              );
            })}
          </ul>
        </Modal>
      ) : null}

      {creating ? (
        <Modal
          title="Initiate an exit"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCreating(false)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={createExit} type="button">
                Create exit record
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="ex-emp">Employee</label>
            <select id="ex-emp" value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">Select an employee…</option>
              {data.employees
                .filter((e) => e.status !== 'Resigned' && e.status !== 'Terminated')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.designation}
                  </option>
                ))}
            </select>
          </div>
          <div className="form-2col">
            <div className="field">
              <label htmlFor="ex-resign">Resignation date</label>
              <input id="ex-resign" type="date" value={resignDate} onChange={(e) => { setResignDate(e.target.value); recalculateLastDay(); }} />
            </div>
            <div className="field">
              <label htmlFor="ex-last">Last working day <span className="required" style={{color: 'var(--primary)'}}> (auto-calculated)</span></label>
              <input id="ex-last" type="date" value={lastDay} readOnly style={{ background: 'var(--muted-bg)', cursor: 'not-allowed' }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ex-notice">Notice period</label>
            <select id="ex-notice" value={notice} onChange={(e) => { setNotice(e.target.value as NoticePeriodOption); recalculateLastDay(); }}>
              {getNoticePeriodOptions().map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ex-reason">Reason</label>
            <textarea id="ex-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Higher studies" />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
