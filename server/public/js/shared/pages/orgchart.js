/* Org chart from /api/org-chart — only people the server says you may see. */
import { get } from '../../core/api.js';
import { mountAsync, pageHead, esc, pill } from '../ui.js';

const node = (n, depth) => '<div style="margin-left:' + (depth ? 22 : 0) + 'px;border-left:' + (depth ? '1px solid var(--border)' : 'none') + ';padding-left:' + (depth ? 14 : 0) + 'px">' +
  '<div style="display:flex;align-items:center;gap:10px;padding:8px 0"><span class="avatar" style="width:32px;height:32px">' + esc(String(n.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('')) + '</span>' +
  '<div style="min-width:0"><b style="font-size:13px">' + esc(n.name) + '</b><div style="font-size:12px;color:var(--text-2)">' + esc([n.designation, n.department].filter(Boolean).join(' · ')) + '</div></div>' + pill(n.status) + '</div>' +
  (n.reports || []).map((c) => node(c, depth + 1)).join('') + '</div>';
export async function orgChart(ctx) {
  ctx.root.innerHTML = pageHead('Org Chart', 'Manager → HR → Employees, limited to what you are authorised to see') + '<div data-body></div>';
  const body = ctx.root.querySelector('[data-body]');
  await mountAsync(body, () => get('/api/org-chart'), (d) => { body.innerHTML = '<section class="card">' + d.roots.map((r) => node(r, 0)).join('') + '</section>'; }, { isEmpty: (d) => !d.roots || !d.roots.length, emptyMsg: 'No organisation data available.' });
}
