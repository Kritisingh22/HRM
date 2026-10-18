/* ============================================================
   Notice Board — company announcements, pinned first.
   HR/Admin publish and edit; everyone reads.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, StatRow } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDrill } from '@/lib/useDrill';
import { niceDate, todayISO } from '@/lib/date';
import type { Announcement } from '@/types';

export function NoticeBoardPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { user, canManage } = useAuth();
  const { toast } = useToast();
  const { query: seedQuery, clear } = useDrill();
  const [drill, setDrill] = useState(seedQuery);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    setDrill(seedQuery);
  }, [seedQuery]);

  const announcements = useMemo(() => {
    let list = [...data.announcements];
    if (drill) {
      const q = drill.toLowerCase();
      list = list.filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.date < b.date ? 1 : -1;
    });
  }, [data.announcements, drill]);

  const openCreate = () => {
    setTitle('');
    setBody('');
    setPinned(false);
    setCreating(true);
  };

  const openEdit = (a: Announcement) => {
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    setEditing(a);
  };

  const save = () => {
    if (!title.trim() || !body.trim()) {
      toast('Give the announcement a title and a body.', 'error');
      return;
    }
    if (editing) {
      dispatch({ type: 'update', collection: 'announcements', id: editing.id, patch: { title, body, pinned } });
      audit('Announcement updated', `${title}`);
      toast('Announcement updated.', 'success');
    } else {
      const id = nextId('ANN-', 2);
      const record: Announcement = {
        id,
        title,
        body,
        author: user?.role === 'HR' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? 'HR' : (user?.department ?? 'HR'),
        date: todayISO(),
        pinned,
      };
      dispatch({ type: 'add', collection: 'announcements', item: record, prepend: true });
      audit('Announcement published', title);
      notify(`New announcement: ${title}`);
      toast('Announcement published to the board.', 'success');
    }
    setCreating(false);
    setEditing(null);
  };

  const remove = (a: Announcement) => {
    dispatch({ type: 'remove', collection: 'announcements', id: a.id });
    audit('Announcement deleted', a.title);
    toast('Announcement removed.', 'info');
    setEditing(null);
  };

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Notice Board</h2>
            <div className="sub">Official announcements from HR, Admin and department heads</div>
          </div>
          <div className="tools">
            {canManage ? (
              <button className="btn btn-primary btn-sm" onClick={openCreate} type="button">
                <Icon name="plus" size={14} /> New announcement
              </button>
            ) : null}
          </div>
        </div>

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

        <StatRow
          items={[
            { k: 'Announcements', v: data.announcements.length },
            { k: 'Pinned', v: data.announcements.filter((a) => a.pinned).length },
            { k: 'This month', v: data.announcements.filter((a) => a.date.slice(0, 7) === todayISO().slice(0, 7)).length },
          ]}
        />

        {announcements.length === 0 ? (
          <EmptyState icon="megaphone" title="Nothing posted yet" sub="Announcements from HR will show up here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {announcements.map((a) => (
              <div key={a.id} className="ann" style={{ position: 'relative' }}>
                <b>
                  {a.pinned ? (
                    <span style={{ color: 'var(--teal-bright)', marginRight: 6, display: 'inline-flex', verticalAlign: -2 }}>
                      <Icon name="pin" size={14} />
                    </span>
                  ) : null}
                  {a.title}
                </b>
                <p style={{ whiteSpace: 'normal' }}>{a.body}</p>
                <span className="meta">
                  {a.author} · {niceDate(a.date)}
                </span>
                {canManage ? (
                  <div className="act-btns no-print" style={{ position: 'absolute', top: 14, right: 14 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(a)} type="button">
                      Edit
                    </button>
                    <button className="btn btn-danger-outline btn-sm" onClick={() => remove(a)} type="button">
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {creating || editing ? (
        <Modal
          title={editing ? 'Edit announcement' : 'New announcement'}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save} type="button">
                {editing ? 'Save changes' : 'Publish'}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="ann-title">Title</label>
            <input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Revised leave policy" />
          </div>
          <div className="field">
            <label htmlFor="ann-body">Message</label>
            <textarea
              id="ann-body"
              style={{ minHeight: 120 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What should everyone know?"
            />
          </div>
          <label className="check-row" htmlFor="ann-pinned">
            <input id="ann-pinned" type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pin this announcement to the top of the board
          </label>
        </Modal>
      ) : null}
    </div>
  );
}
