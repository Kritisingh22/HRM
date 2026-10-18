/* ============================================================
   Helpdesk — HR support tickets. Everyone can raise; HR/Admin
   triage and resolve.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmpCell, Pill, StatRow } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDrill } from '@/lib/useDrill';
import { niceDate, todayISO } from '@/lib/date';
import type { Ticket } from '@/types';

const CATEGORIES = ['Payroll', 'Leave & Attendance', 'HR / Records', 'IT & Access', 'Facilities', 'Other'];
const STATUSES: Array<Ticket['status']> = ['Open', 'In Progress', 'Resolved'];

export function HelpdeskPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { user, canManage } = useAuth();
  const { toast } = useToast();
  const { query: seedQuery, clear } = useDrill();
  const [drill, setDrill] = useState(seedQuery);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(CATEGORIES[2]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDrill(seedQuery);
  }, [seedQuery]);

  const myId = user?.employeeId ?? '';

  const rows = useMemo(() => {
    let list = data.tickets;
    if (!canManage) list = list.filter((t) => t.by === myId);
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    if (categoryFilter !== 'all') list = list.filter((t) => t.category === categoryFilter);
    if (drill) {
      const q = drill.toLowerCase();
      list = list.filter((t) => `${t.subject} ${t.message} ${t.category}`.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data.tickets, canManage, myId, statusFilter, categoryFilter, drill]);

  const requester = (t: Ticket) => data.employees.find((e) => e.id === t.by);

  const create = () => {
    if (!subject.trim() || !message.trim()) {
      toast('Add a subject and a description.', 'error');
      return;
    }
    const id = nextId('TCK-', 3);
    dispatch({
      type: 'add',
      collection: 'tickets',
      item: { id, subject, category, message, by: myId, date: todayISO(), status: 'Open' } satisfies Ticket,
      prepend: true,
    });
    audit('Ticket raised', `${id} · ${subject}`);
    notify(`Helpdesk ticket ${id} raised: ${subject}`);
    toast(`Ticket ${id} raised — HR will pick it up shortly.`, 'success');
    setCreating(false);
    setSubject('');
    setMessage('');
    setCategory(CATEGORIES[2]);
  };

  const setStatus = (t: Ticket, status: Ticket['status']) => {
    dispatch({ type: 'update', collection: 'tickets', id: t.id, patch: { status } });
    audit('Ticket updated', `${t.id} → ${status}`);
    if (status === 'Resolved') notify(`Ticket ${t.id} resolved`);
    toast(`${t.id} → ${status}.`, 'success');
    setDetail((prev) => (prev && prev.id === t.id ? { ...prev, status } : prev));
  };

  const stats = useMemo(
    () => ({
      open: data.tickets.filter((t) => t.status === 'Open').length,
      inProgress: data.tickets.filter((t) => t.status === 'In Progress').length,
      resolved: data.tickets.filter((t) => t.status === 'Resolved').length,
    }),
    [data.tickets],
  );

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{canManage ? 'HR Helpdesk' : 'Helpdesk'}</h2>
            <div className="sub">
              {canManage ? 'Tickets raised by employees across the company' : 'Raise a ticket and track HR responses'}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} type="button">
            <Icon name="plus" size={14} /> Raise ticket
          </button>
        </div>

        <StatRow
          items={[
            { k: 'Open', v: canManage ? stats.open : rows.filter((t) => t.status === 'Open').length },
            { k: 'In progress', v: canManage ? stats.inProgress : rows.filter((t) => t.status === 'In Progress').length },
            { k: 'Resolved', v: canManage ? stats.resolved : rows.filter((t) => t.status === 'Resolved').length },
          ]}
        />

        {drill ? (
          <div style={{ marginBottom: 12 }}>
            <span className="ana-drill-note no-print">
              Search: “{drill}”
              <button onClick={() => { setDrill(''); clear(); }} type="button" aria-label="Clear search">
                ✕
              </button>
            </span>
          </div>
        ) : null}

        <div className="toolbar no-print">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category filter">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="chip">{rows.length} tickets</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty">No tickets match the current filters.</div>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Ticket</th>
                  {canManage ? <th>Raised by</th> : null}
                  <th>Category</th>
                  <th>Raised</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const who = requester(t);
                  return (
                    <tr key={t.id}>
                      <td>
                        <b>{t.subject}</b>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{t.id}</span>
                      </td>
                      {canManage ? (
                        <td>
                          <EmpCell name={who?.name ?? t.by} sub={who?.designation ?? ''} seed={t.by} />
                        </td>
                      ) : null}
                      <td>{t.category}</td>
                      <td className="num">{niceDate(t.date)}</td>
                      <td>
                        <Pill status={t.status} />
                      </td>
                      <td>
                        <div className="act-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => setDetail(t)} type="button">
                            View
                          </button>
                          {canManage && t.status === 'Open' ? (
                            <button className="btn btn-outline btn-sm" onClick={() => setStatus(t, 'In Progress')} type="button">
                              Pick up
                            </button>
                          ) : null}
                          {canManage && t.status === 'In Progress' ? (
                            <button className="btn btn-outline btn-sm" onClick={() => setStatus(t, 'Resolved')} type="button">
                              Resolve
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating ? (
        <Modal
          title="Raise a helpdesk ticket"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCreating(false)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={create} type="button">
                Submit ticket
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="tk-category">Category</label>
            <select id="tk-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tk-subject">Subject</label>
            <input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </div>
          <div className="field">
            <label htmlFor="tk-message">Description</label>
            <textarea
              id="tk-message"
              style={{ minHeight: 110 }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you need help with?"
            />
          </div>
          <div className="info-note">HR typically responds within one working day. Urgent payroll issues are prioritised.</div>
        </Modal>
      ) : null}

      {detail ? (
        <Modal
          title={`Ticket ${detail.id}`}
          onClose={() => setDetail(null)}
          footer={
            canManage ? (
              <>
                {detail.status === 'Open' ? (
                  <button className="btn btn-outline" onClick={() => setStatus(detail, 'In Progress')} type="button">
                    Pick up
                  </button>
                ) : null}
                {detail.status === 'In Progress' ? (
                  <button className="btn btn-primary" onClick={() => setStatus(detail, 'Resolved')} type="button">
                    Mark resolved
                  </button>
                ) : null}
                <button className="btn btn-ghost" onClick={() => setDetail(null)} type="button">
                  Close
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={() => setDetail(null)} type="button">
                Close
              </button>
            )
          }
        >
          <div className="detail-grid">
            <dt>Subject</dt>
            <dd>{detail.subject}</dd>
            <dt>Category</dt>
            <dd>{detail.category}</dd>
            <dt>Raised by</dt>
            <dd>{requester(detail)?.name ?? detail.by}</dd>
            <dt>Raised on</dt>
            <dd>{niceDate(detail.date)}</dd>
            <dt>Status</dt>
            <dd>
              <Pill status={detail.status} />
            </dd>
            <dt>Description</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.message}</dd>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
