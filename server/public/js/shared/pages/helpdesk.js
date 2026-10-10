/* Helpdesk. Everyone raises/tracks their own queries. HR/Manager also see the queries
 * of employees in THEIR scope (server-filtered), can respond and change status — the
 * employee is notified by the server. */
import { get, post, put } from '../../core/api.js';
import { mountAsync, pageHead, table, pill, tabs, esc, fmtDate, formModal, toast, isStaff, personName } from '../ui.js';

const CATS = ['IT', 'HR', 'Payroll', 'Facilities', 'Other'];
const STATUS = ['Open', 'In Progress', 'Resolved', 'Closed'];

function raise(done) {
  formModal({
    title: 'Raise a helpdesk query', submitLabel: 'Submit',
    fields: [{ name: 'subject', label: 'Subject', required: true }, { name: 'category', label: 'Category', type: 'select', options: CATS, value: 'Other' },
      { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'], value: 'Medium' }, { name: 'description', label: 'Description', type: 'textarea', required: true }],
    onSubmit: async (v) => { await post('/api/helpdesk', v); toast('Query submitted'); done(); },
  });
}
function detail(t, user, canManage, done) {
  const comments = (t.comments || []).map((c) => '<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">' + esc(c.text) + '<div style="font-size:11px;color:var(--muted)">' + fmtDate(c.createdAt) + '</div></div>').join('') || '<div class="empty">No responses yet.</div>';
  window.openModal('<div class="modal-head"><h3>' + esc(t.subject) + '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div><div class="modal-body">' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">' + pill(t.status) + '<span style="font-size:12px;color:var(--text-2)">' + esc(t.category) + ' · ' + esc(t.priority) + ' · ' + esc(t.ticketId) + '</span></div>' +
    '<p style="font-size:13px;color:var(--text-2);margin-bottom:12px">' + esc(t.description || '') + '</p>' + comments +
    '<div class="field" style="margin-top:12px"><label for="hdReply">Add a response</label><textarea id="hdReply" rows="2" style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:13px"></textarea></div>' +
    (canManage ? '<div class="field"><label for="hdStatus">Status</label><select id="hdStatus">' + STATUS.map((s) => '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' : '') +
    '</div><div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button><button class="btn btn-primary" id="hdSave">Save</button></div>');
  document.getElementById('hdSave').addEventListener('click', async () => {
    const body = {}; const reply = document.getElementById('hdReply').value.trim();
    if (reply) body.comment = reply;
    const st = document.getElementById('hdStatus'); if (st && st.value !== t.status) body.status = st.value;
    if (!Object.keys(body).length) { window.closeModal(); return; }
    try { await put('/api/helpdesk/' + t._id, body); toast('Updated'); window.closeModal(); done(); } catch (e) { toast(e.message); }
  });
}
export async function helpdesk(ctx) {
  ctx.root.innerHTML = '';
  const host = document.createElement('div'); ctx.root.appendChild(host);
  const mineOf = (t) => String((t.raisedBy && t.raisedBy._id) || t.raisedBy) === String(ctx.user.id);
  const section = (label, mine) => ({
    label,
    render: (el) => {
      el.innerHTML = (mine ? '<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary btn-sm" data-new>+ New query</button></div>' : '') + '<div data-body></div>';
      const body = el.querySelector('[data-body]');
      const load = () => mountAsync(body, async () => ((await get('/api/helpdesk')).tickets || []).filter((t) => mineOf(t) === mine), (rows) => {
        const cols = [{ label: 'ID', get: (t) => t.ticketId }, ...(mine ? [] : [{ label: 'Raised by', get: (t) => personName(t.raisedBy) }]),
          { label: 'Subject', get: (t) => t.subject }, { label: 'Category', get: (t) => t.category }, { label: 'Status', get: (t) => pill(t.status), html: true }, { label: 'Raised', get: (t) => fmtDate(t.createdAt) }];
        body.innerHTML = '<section class="card">' + table(cols, rows, { actions: (t, i) => '<button class="btn btn-outline btn-sm" data-i="' + i + '">Open</button>' }) + '</section>';
        body.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => detail(rows[+b.dataset.i], ctx.user, !mine && isStaff(ctx.user), load)));
      }, { isEmpty: (r) => !r.length, emptyMsg: mine ? 'You have not raised any helpdesk queries.' : 'No employee queries in your scope.' });
      const nb = el.querySelector('[data-new]'); if (nb) nb.addEventListener('click', () => raise(load));
      load();
    },
  });
  tabs(host, isStaff(ctx.user) ? [section('My Queries', true), section('Employee Queries', false)] : [section('My Queries', true)]);
}
