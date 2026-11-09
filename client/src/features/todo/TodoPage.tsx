/* ============================================================
   My Tasks — personal to-do list. Everyone can create, view,
   complete and delete their own tasks.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Pill, StatRow } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { niceDate, todayISO } from '@/lib/date';
import type { Todo, TodoStatus } from '@/types';

export function TodoPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();

  const myId = user?.employeeId ?? '';

  const rows = useMemo(
    () =>
      [...data.todos]
        .filter((t) => t.employeeId === myId)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.todos, myId],
  );

  /* ---------- create form state ---------- */
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayISO());
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [notesErr, setNotesErr] = useState<string | null>(null);

  /* Title: single word only (no spaces), max 50 chars */
  function validateTitle(v: string): string | null {
    const trimmed = v.trim();
    if (!trimmed) return 'Task title is required.';
    if (/\s/.test(trimmed)) return 'Title must be a single word (no spaces).';
    if (trimmed.length > 50) return 'Title must be 50 characters or fewer.';
    return null;
  }

  /* Notes: max 500 chars */
  function validateNotes(v: string): string | null {
    if (v.length > 500) return 'Description must be 500 characters or fewer.';
    return null;
  }

  useEffect(() => {
    setTitleErr(validateTitle(title));
    setNotesErr(validateNotes(notes));
  }, [title, notes]);

  /* Stable close handler so the Modal's focus effect doesn't re-run
     on every keystroke (which would steal focus from the input). */
  const handleClose = useCallback(() => setCreating(false), []);

  /* Reset form values when opening the modal so inputs are always fresh. */
  const handleOpen = useCallback(() => {
    setTitle('');
    setNotes('');
    setDate(todayISO());
    setTitleErr(null);
    setNotesErr(null);
    setCreating(true);
  }, []);

  const create = () => {
    const tErr = validateTitle(title);
    const nErr = validateNotes(notes);
    setTitleErr(tErr);
    setNotesErr(nErr);
    if (tErr || nErr) return;

    const id = nextId('TD-', 3);
    const todo: Todo = {
      id,
      employeeId: myId,
      title: title.trim(),
      notes,
      date,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'add', collection: 'todos', item: todo, prepend: true });
    audit('Task created', `${id} · ${todo.title}`);
    notify(`New task: ${todo.title}`);
    toast(`Task "${todo.title}" created.`, 'success');
    setCreating(false);
    setTitle('');
    setNotes('');
    setDate(todayISO());
  };

  /* ---------- toggle status ---------- */
  const toggleStatus = (t: Todo) => {
    const next: TodoStatus = t.status === 'Pending' ? 'Completed' : 'Pending';
    dispatch({
      type: 'update',
      collection: 'todos',
      id: t.id,
      patch: {
        status: next,
        ...(next === 'Completed' ? { completedAt: new Date().toISOString() } : { completedAt: undefined }),
      },
    });
    audit('Task updated', `${t.id} → ${next}`);
    toast(`Task "${t.title}" marked ${next}.`, 'success');
  };

  /* ---------- delete ---------- */
  const remove = (t: Todo) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    dispatch({ type: 'remove', collection: 'todos', id: t.id });
    audit('Task deleted', `${t.id} · ${t.title}`);
    toast(`Task "${t.title}" deleted.`, 'success');
  };

  const stats = useMemo(
    () => ({
      pending: rows.filter((t) => t.status === 'Pending').length,
      completed: rows.filter((t) => t.status === 'Completed').length,
    }),
    [rows],
  );

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>My Tasks</h2>
            <div className="sub">Your personal to-do list — add tasks, mark them done, delete when finished.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleOpen} type="button">
            <Icon name="plus" size={14} /> New task
          </button>
        </div>

        <StatRow
          items={[
            { k: 'Pending', v: stats.pending },
            { k: 'Completed', v: stats.completed },
          ]}
        />

        {rows.length === 0 ? (
          <div className="empty">No tasks yet. Click "New task" to add one.</div>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={t.status === 'Completed' ? 'done-row' : undefined}>
                    <td>
                      <b className={t.status === 'Completed' ? 'done-text' : undefined}>{t.title}</b>
                    </td>
                    <td className="num">{t.notes || '—'}</td>
                    <td className="num">{niceDate(t.date)}</td>
                    <td>
                      <Pill status={t.status} />
                    </td>
                    <td>
                      <div className="act-btns">
                        <button
                          className={`btn btn-ghost btn-sm ${t.status === 'Pending' ? '' : 'done-text'}`}
                          onClick={() => toggleStatus(t)}
                          type="button"
                        >
                          {t.status === 'Pending' ? 'Mark done' : 'Reopen'}
                        </button>
                        <button className="btn btn-danger-outline btn-sm" onClick={() => remove(t)} type="button">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- create modal ---------- */}
      {creating ? (
        <Modal
          title="New task"
          onClose={handleClose}
          footer={
            <>
              <button className="btn btn-ghost" onClick={handleClose} type="button">
                Cancel
              </button>
              <button className="btn btn-ghost" onClick={() => {
                setTitle('');
                setNotes('');
                setDate(todayISO());
                setTitleErr(null);
                setNotesErr(null);
              }} type="button">
                Clear
              </button>
              <button className="btn btn-primary" onClick={create} type="button" disabled={!!titleErr || !!notesErr}>
                Create task
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="td-title">Task title <span className="req">*</span></label>
            <input
              id="td-title"
              maxLength="50"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Single word, max 50 chars"
              className={titleErr ? 'invalid' : ''}
            />
            {titleErr && <div className="err">{titleErr}</div>}
            <div className="field-hint">One word only. No spaces. Max 50 characters.</div>
          </div>
          <div className="field">
            <label htmlFor="td-notes">Description</label>
            <textarea
              id="td-notes"
              maxLength="500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Task description (max 500 characters)"
              style={{ minHeight: 100 }}
            />
            {notesErr && <div className="err">{notesErr}</div>}
            <div className="field-hint">Max 500 characters.</div>
            <div className="field-hint">
              Characters used: {notes.length} / 500
            </div>
          </div>
          <div className="field">
            <label htmlFor="td-date">Date</label>
            <input id="td-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}