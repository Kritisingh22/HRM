/* Notice board: everyone reads; staff with notices:write (HR, Manager) publish. */
import { get, post, put, del } from '../../core/api.js';
import { mountAsync, pageHead, esc, fmtDate, formModal, toast, isStaff, personName } from '../ui.js';

export async function notices(ctx) {
  const canPublish = isStaff(ctx.user);
  ctx.root.innerHTML = pageHead('Notice Board', 'Company announcements', canPublish ? '<button class="btn btn-primary btn-sm" data-new>+ New notice</button>' : '') + '<div data-body></div>';
  const body = ctx.root.querySelector('[data-body]');
  const form = (n) => formModal({
    title: n ? 'Edit notice' : 'New notice', submitLabel: n ? 'Save' : 'Publish',
    fields: [{ name: 'title', label: 'Title', value: n && n.title, required: true }, { name: 'body', label: 'Message', type: 'textarea', value: n && n.body, required: true },
      { name: 'audience', label: 'Audience', type: 'select', options: ['all', 'managers', 'hr'], value: (n && n.audience) || 'all' },
      { name: 'status', label: 'Status', type: 'select', options: ['Published', 'Draft'], value: (n && n.status) || 'Published' }],
    onSubmit: async (v) => { n ? await put('/api/notices/' + n._id, v) : await post('/api/notices', v); toast('Notice saved'); load(); },
  });
  const load = () => mountAsync(body, async () => (await get('/api/notices')).notices || [], (rows) => {
    body.innerHTML = rows.map((n, i) => '<div class="hr-plus-notice' + (n.pinned ? ' hr-plus-pin' : '') + '"><h3>' + esc(n.title) + (n.pinned ? ' <span class="hr-plus-pinchip">Pinned</span>' : '') +
      (n.status === 'Draft' ? ' <span class="hr-plus-pinchip">Draft</span>' : '') + '</h3><p>' + esc(n.body) + '</p><div class="meta"><span>' + fmtDate(n.publishedAt || n.createdAt) + '</span><span>' + esc(personName(n.author)) + '</span>' +
      (canPublish ? '<span class="hr-plus-notice-actions"><button class="btn btn-ghost btn-sm" data-edit="' + i + '">Edit</button><button class="btn btn-danger-outline btn-sm" data-del="' + i + '">Delete</button></span>' : '') + '</div></div>').join('');
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => form(rows[+b.dataset.edit])));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this notice?')) return;
      try { await del('/api/notices/' + rows[+b.dataset.del]._id); toast('Notice deleted'); load(); } catch (e) { toast(e.message); }
    }));
  }, { isEmpty: (r) => !r.length, emptyMsg: 'No notices have been published.' });
  const nb = ctx.root.querySelector('[data-new]'); if (nb) nb.addEventListener('click', () => form(null));
  await load();
}
