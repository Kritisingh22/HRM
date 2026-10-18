/* ============================================================
   My Profile — the self-service page every role shares.

   Personal & job details, contact editing, this month's
   attendance, leave balance and personal documents.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState, Pill, Progress } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { deptName, empName } from '@/lib/lookups';
import { ATTENDANCE_META, attendanceOn, monthSummary } from '@/lib/attendance';
import { daysInMonth, isWeekend, niceDate, pad, shortDate, todayISO, yearsSince } from '@/lib/date';
import { accuracyText, capturedText, coordText, GEO_KIND_LABELS, mapsUrl } from '@/lib/geo';
import { clampPct, money, pct } from '@/lib/format';
import { PROFESSIONAL_TAX, salaryBreakdown } from '@/lib/payroll';

export function ProfilePage() {
  const { data, dispatch, audit } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [emergency, setEmergency] = useState('');
  const [blood, setBlood] = useState('');

  const me = useMemo(() => {
    const byId = user?.employeeId ? data.employees.find((e) => e.id === user.employeeId) : null;
    return byId;
  }, [data.employees, user?.employeeId]);

  const ctx = useMemo(
    () => ({ holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides }),
    [data.holidays, data.leaveRequests, data.attendanceOverrides],
  );

  const now = new Date();
  const summary = useMemo(
    () => (me ? monthSummary(me.id, now.getFullYear(), now.getMonth(), ctx) : null),
    [me, ctx],
  );

  const recentDays = useMemo(() => {
    if (!me) return [];
    const out: Array<{ iso: string; status: string; color: string; checkIn?: string; checkOut?: string }> = [];
    const total = daysInMonth(now.getFullYear(), now.getMonth());
    for (let d = total; d >= 1 && out.length < 6; d--) {
      const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(d)}`;
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      if (isWeekend(date) || iso >= todayISO()) continue;
      const att = attendanceOn(me.id, iso, ctx);
      if (!att) continue;
      out.push({
        iso,
        status: ATTENDANCE_META[att.status].label,
        color: ATTENDANCE_META[att.status].color,
        checkIn: att.checkIn,
        checkOut: att.checkOut,
      });
    }
    return out;
  }, [me, ctx, now]);

  const myDocs = useMemo(() => (me ? data.documents.filter((d) => d.owner === me.id) : []), [data.documents, me]);
  const myRequests = useMemo(
    () => (me ? data.leaveRequests.filter((r) => r.employeeId === me.id).sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1)).slice(0, 5) : []),
    [data.leaveRequests, me],
  );

  const myLog = useMemo(
    () =>
      data.locationLog
        .filter((l) => (user?.employeeId && l.employeeId === user.employeeId) || (user?.email && l.email === user.email))
        .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))
        .slice(0, 12),
    [data.locationLog, user?.employeeId, user?.email],
  );

  if (!me) {
    return (
      <div className="grid">
        <section className="card span12">
          <EmptyState icon="user" title="No employee record" sub="This login is not linked to a roster record." />
        </section>
      </div>
    );
  }

  const breakdown = salaryBreakdown(me.salary);

  const openEdit = () => {
    setPhone(me.phone);
    setAddress(me.address ?? '');
    setEmergency(me.emergency ?? '');
    setBlood(me.bloodGroup ?? '');
    setEditing(true);
  };

  const save = () => {
    dispatch({
      type: 'update',
      collection: 'employees',
      id: me.id,
      patch: { phone, address, emergency, bloodGroup: blood },
    });
    audit('Profile updated', me.id);
    toast('Profile details saved.', 'success');
    setEditing(false);
  };

  return (
    <div className="grid">
      {/* ---------- identity ---------- */}
      <section className="card span4">
        <div className="card-head">
          <div>
            <h2>My Profile</h2>
            <div className="sub">Personal and contact details</div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={openEdit} type="button">
            <Icon name="edit" size={13} /> Edit
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Avatar name={me.name} seed={me.id} size={36} />
          <div>
            <b style={{ fontSize: 16, display: 'block' }}>{me.name}</b>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{me.designation}</span>
            <div style={{ marginTop: 6 }}>
              <Pill status={me.status} />
            </div>
          </div>
        </div>
        <div className="detail-grid">
          <dt>Employee ID</dt>
          <dd className="num">{me.id}</dd>
          <dt>Email</dt>
          <dd>{me.email}</dd>
          <dt>Phone</dt>
          <dd>{me.phone}</dd>
          <dt>Location</dt>
          <dd>{me.location}</dd>
          <dt>Address</dt>
          <dd>{me.address ?? '—'}</dd>
          <dt>Emergency contact</dt>
          <dd>{me.emergency ?? '—'}</dd>
          <dt>Blood group</dt>
          <dd>{me.bloodGroup ?? '—'}</dd>
          <dt>Date of birth</dt>
          <dd>{niceDate(me.dob)}</dd>
        </div>
      </section>

      {/* ---------- job ---------- */}
      <section className="card span4">
        <div className="card-head">
          <div>
            <h2>Job details</h2>
            <div className="sub">Employment record</div>
          </div>
        </div>
        <div className="detail-grid">
          <dt>Department</dt>
          <dd>{deptName(data.departments, me.dept)}</dd>
          <dt>Designation</dt>
          <dd>{me.designation}</dd>
          <dt>Reports to</dt>
          <dd>{empName(data.employees, me.manager)}</dd>
          <dt>Employment type</dt>
          <dd>{me.employmentType}</dd>
          <dt>Joined</dt>
          <dd>
            {niceDate(me.joining)} · {yearsSince(me.joining)} yrs
          </dd>
          <dt>Experience</dt>
          <dd>{me.experience}</dd>
          <dt>Grade</dt>
          <dd>{me.grade}</dd>
          <dt>Monthly in-hand</dt>
          <dd className="num">{money(me.salary)}</dd>
        </div>
        <div className="info-note" style={{ marginTop: 14 }}>
          Basic {money(breakdown.basic)} · HRA {money(breakdown.hra)} · Conveyance {money(breakdown.conv)} · Special{' '}
          {money(breakdown.special)} · professional tax {money(PROFESSIONAL_TAX)}.
        </div>
      </section>

      {/* ---------- leave balance ---------- */}
      <section className="card span4">
        <div className="card-head">
          <div>
            <h2>Leave balance</h2>
            <div className="sub">Effective this year</div>
          </div>
        </div>
        <div className="cal-statgrid">
          <span className="stat">
            Casual <b>{data.leaveBalance.casual}</b>
          </span>
          <span className="stat">
            Sick <b>{data.leaveBalance.sick}</b>
          </span>
          <span className="stat">
            Paid / Earned <b>{data.leaveBalance.paidEarned}</b>
          </span>
          <span className="stat">
            Used <b>{data.leaveBalance.used}</b>
          </span>
          <span className="stat">
            Available <b>{data.leaveBalance.total - data.leaveBalance.used}</b>
          </span>
          <span className="stat">
            Entitled <b>{data.leaveBalance.total}</b>
          </span>
        </div>
        <Progress label="Balance used" value={clampPct((data.leaveBalance.used / Math.max(1, data.leaveBalance.total)) * 100)} />
        <div className="detail-grid" style={{ marginTop: 6 }}>
          <dt>My pending requests</dt>
          <dd>{data.leaveRequests.filter((r) => r.employeeId === me.id && r.status === 'Pending').length}</dd>
          <dt>Approved this year</dt>
          <dd>{data.leaveRequests.filter((r) => r.employeeId === me.id && r.status === 'Approved').length}</dd>
        </div>
      </section>

      {/* ---------- attendance + documents + requests ---------- */}
      <section className="card span6">
        <div className="card-head">
          <div>
            <h2>This month's attendance</h2>
            <div className="sub">{summary ? `${summary.elapsed} of ${summary.working} working days elapsed` : '—'}</div>
          </div>
          {summary ? <span className="chip">{summary.pct === null ? '—' : `${summary.pct}%`}</span> : null}
        </div>
        {summary ? (
          <>
            <div className="cal-statgrid">
              <span className="stat">
                Present <b>{summary.present}</b>
              </span>
              <span className="stat">
                WFH <b>{summary.wfh}</b>
              </span>
              <span className="stat">
                Half days <b>{summary.half}</b>
              </span>
              <span className="stat">
                Leave <b>{summary.leave}</b>
              </span>
              <span className="stat">
                Absent <b>{summary.absent}</b>
              </span>
              <span className="stat">
                Working days <b>{summary.working}</b>
              </span>
            </div>
            <Progress label="Attendance rate" value={summary.pct ?? 0} />
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Recent day</th>
                    <th>Status</th>
                    <th>Check in</th>
                    <th>Check out</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDays.map((d) => (
                    <tr key={d.iso}>
                      <td className="num">{shortDate(d.iso)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <span className="cal-dot" style={{ background: d.color }} />
                          {d.status}
                        </span>
                      </td>
                      <td className="num">{d.checkIn ?? '—'}</td>
                      <td className="num">{d.checkOut ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="card span6">
        <div className="card-head">
          <div>
            <h2>My documents</h2>
            <div className="sub">Documents HR has on file against your record</div>
          </div>
          <span className="chip">{myDocs.length}</span>
        </div>
        {myDocs.length === 0 ? (
          <EmptyState icon="fileText" title="No documents yet" sub="Letters and certificates shared by HR will appear here." />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myDocs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b>{d.name}</b>
                    </td>
                    <td>{d.type}</td>
                    <td className="num">{niceDate(d.uploaded)}</td>
                    <td>
                      <Pill status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-head" style={{ marginTop: 22 }}>
          <div>
            <h2>My leave requests</h2>
            <div className="sub">Latest five applications</div>
          </div>
        </div>
        {myRequests.length === 0 ? (
          <EmptyState icon="calendar" title="No requests yet" sub="Apply for leave from the Leave page." />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.type}</td>
                    <td className="num">{r.from === r.to ? niceDate(r.from) : `${niceDate(r.from)} – ${niceDate(r.to)}`}</td>
                    <td className="num">{r.days}</td>
                    <td>
                      <Pill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-foot">
          {pct(myRequests.filter((r) => r.status === 'Approved').length, Math.max(1, myRequests.length))}% of recent requests
          approved · payslips live under Payroll.
        </div>
      </section>

      {/* ---------- sign-in & check-in locations ---------- */}
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Sign-in &amp; check-in locations</h2>
            <div className="sub">
              Captured once per action, only when your browser allows location — never tracked in the background
            </div>
          </div>
          <span className="chip">{myLog.length}</span>
        </div>
        {myLog.length === 0 ? (
          <EmptyState
            icon="mapPin"
            title="No location records yet"
            sub="They appear here after a sign-in or check-in when your browser allows location."
          />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>When</th>
                  <th>Location</th>
                  <th>Accuracy</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {myLog.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Pill status={GEO_KIND_LABELS[l.kind]} />
                    </td>
                    <td className="num">{capturedText(l.capturedAt)}</td>
                    <td>
                      <a className="link" href={mapsUrl(l)} target="_blank" rel="noreferrer">
                        <span className="num">{coordText(l)}</span>
                      </a>
                    </td>
                    <td className="num">{accuracyText(l)}</td>
                    <td className="num">{l.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-foot">
          Only latitude, longitude, accuracy, a capture timestamp and an action reference are stored — nothing else, and only
          for the actions listed here.
        </div>
      </section>

      {editing ? (
        <Modal
          title="Edit my details"
          onClose={() => setEditing(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save} type="button">
                Save details
              </button>
            </>
          }
        >
          <div className="form-2col">
            <div className="field">
              <label htmlFor="pf-phone">Phone</label>
              <input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pf-blood">Blood group</label>
              <input id="pf-blood" value={blood} onChange={(e) => setBlood(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pf-address">Address</label>
            <input id="pf-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House, street, city" />
          </div>
          <div className="field">
            <label htmlFor="pf-emergency">Emergency contact</label>
            <input id="pf-emergency" value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="Name · phone" />
          </div>
          <div className="info-note">
            Name, department and salary changes are managed by HR — raise a helpdesk ticket if something looks wrong.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
