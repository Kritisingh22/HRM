/* Employee To-Do: tasks belong to the signed-in employee (server-resolved). */
import { get, post, put, del } from '../../core/api.js';
import { mountAsync, pageHead, esc, fmtDate, formModal, toast, todayISO, pill } from '../ui.js';

export async function todo(ctx) {
  ctx.root.innerHTML = pageHead('To-Do', 'Your daily tasks', '<button class="btn btn-primary btn-sm" data-add>+ Add task</button>') + '<div data-body></div>';
  const body = ctx.root.querySelector('[data-body]');
  const load = () => mountAsync(body, async () => (await get('/api/todos')).todos || [], (rows) => {
    const day = todayISO();
    const today = rows.filter((t) => t.date === day), history = rows.filter((t) => t.date !== day);
    const row = (t) => '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<input type="checkbox" data-toggle="' + esc(t._id) + '" ' + (t.status === 'Completed' ? 'checked' : '') + ' aria-label="Mark complete" style="accent-color:var(--teal);width:16px;height:16px">' +
      '<div style="flex:1;min-width:0"><div style="' + (t.status === 'Completed' ? 'text-decoration:line-through;color:var(--text-2)' : '') + '">' + esc(t.title) + '</div>' + (t.notes ? '<div style="font-size:12px;color:var(--text-2)">' + esc(t.notes) + '</div>' : '') + '</div>' +
      '<span style="font-size:11px;color:var(--muted)">' + fmtDate(t.date) + '</span>' + pill(t.status) +
      '<button class="btn btn-ghost btn-sm" data-edit="' + esc(t._id) + '">Edit</button><button class="btn btn-danger-outline btn-sm" data-del="' + esc(t._id) + '">Delete</button></div>';
    const done = today.filter((t) => t.status === 'Completed').length;
    body.innerHTML = '<section class="card"><div class="card-head"><div><h2>Today</h2><div class="sub">' + done + ' of ' + today.length + ' completed</div></div></div>' +
      (today.length ? today.map(row).join('') : '<div class="empty">No tasks for today. Add your first task.</div>') + '</section>' +
      '<section class="card" style="margin-top:20px"><div class="card-head"><div><h2>Task history</h2></div></div>' + (history.length ? history.map(row).join('') : '<div class="empty">No earlier tasks.</div>') + '</section>';
    body.querySelectorAll('[data-toggle]').forEach((c) => c.addEventListener('change', async () => {
      try { await put('/api/todos/' + c.dataset.toggle, { status: c.checked ? 'Completed' : 'Pending' }); load(); } catch (e) { toast(e.message); c.checked = !c.checked; }
    }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this task?')) return;
      try { await del('/api/todos/' + b.dataset.del); toast('Task deleted'); load(); } catch (e) { toast(e.message); }
    }));
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const t = rows.find((x) => x._id === b.dataset.edit);
      formModal({ title: 'Edit task', fields: [{ name: 'title', label: 'Task', value: t.title, required: true }, { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes }],
        onSubmit: async (v) => { await put('/api/todos/' + t._id, { title: v.title, notes: v.notes }); load(); } });
    }));
  }, { isEmpty: (r) => false });
  ctx.root.querySelector('[data-add]').addEventListener('click', () => formModal({
    title: 'Add task', submitLabel: 'Add',
    fields: [{ name: 'title', label: 'Task', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }, { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true }],
    onSubmit: async (v) => { await post('/api/todos', v); toast('Task added'); load(); },
  }));
  await load();
}
