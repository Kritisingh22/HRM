/* Shared view helpers. Everything here emits markup using the portal's EXISTING CSS
 * classes (card, card-head, kpi, pill-status, table, empty, btn, field, modal …) so
 * the look is identical to the rest of the app. No new CSS is introduced. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? esc(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
export const money = (n) => (typeof n === 'number' ? '₹' + n.toLocaleString('en-IN') : '—');
export const personName = (p) => (p && typeof p === 'object' ? p.fullName || p.name || p.employeeId || '—' : p || '—');
export const ico = (name, size) => (typeof window.icon === 'function' ? window.icon(name, size) : '');
export const toast = (m) => { if (typeof window.toast === 'function') window.toast(m); };

const ST = {
  approved: 'st-approved', present: 'st-approved', completed: 'st-approved', resolved: 'st-approved', closed: 'st-approved',
  active: 'st-approved', paid: 'st-approved', reviewed: 'st-approved', done: 'st-approved', processed: 'st-approved',
  pending: 'st-pending', open: 'st-pending', 'in progress': 'st-pending', draft: 'st-pending', submitted: 'st-pending',
  processing: 'st-pending', 'on leave': 'st-pending', late: 'st-pending', 'half day': 'st-pending',
  rejected: 'st-rejected', absent: 'st-rejected', overdue: 'st-rejected', cancelled: 'st-rejected', exited: 'st-rejected',
};
export const pill = (v) =>
  v ? '<span class="pill-status ' + (ST[String(v).toLowerCase()] || 'st-pending') + '">' + esc(v) + '</span>' : '—';

export const pageHead = (title, sub, actions) =>
  '<div class="hr-plus-head"><div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
  '</div><div>' + (actions || '') + '</div></div>';

export const card = (title, sub, body, actions) =>
  '<section class="card"><div class="card-head"><div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
  '</div>' + (actions || '') + '</div>' + body + '</section>';

export function kpi(k) {
  return '<button class="card kpi span3" data-goto="' + esc(k.goto || '') + '" aria-label="' + esc(k.label) + '">' +
    '<span style="min-width:0;text-align:left"><span class="label" style="display:block">' + esc(k.label) + '</span>' +
    '<span class="value" style="display:block">' + esc(k.value ?? '—') + '</span>' +
    '<span class="delta" style="color:' + (k.subColor || 'var(--text-2)') + '">' + esc(k.sub || '') + '</span></span>' +
    '<span class="chipbox" style="background:' + (k.tint || 'var(--teal-tint)') + ';color:' + (k.color || 'var(--teal)') + '">' +
    ico(k.icon || 'dashboard', 20) + '</span></button>';
}
export const kpiGrid = (items) => '<div class="grid" style="margin-bottom:20px">' + items.map(kpi).join('') + '</div>';

/* columns: [{label, get:(row)=>value, html?:true, align?:'right'}] */
export function table(columns, rows, { rowAttrs, actions } = {}) {
  const head = columns.map((c) => '<th' + (c.align === 'right' ? ' class="num"' : '') + '>' + esc(c.label) + '</th>').join('') + (actions ? '<th></th>' : '');
  const body = rows.map((r, i) =>
    '<tr' + (rowAttrs ? ' ' + rowAttrs(r, i) : '') + '>' +
    columns.map((c) => {
      const v = c.get(r);
      return '<td' + (c.align === 'right' ? ' class="num"' : '') + '>' + (c.html ? (v ?? '—') : esc(v ?? '—')) + '</td>';
    }).join('') + (actions ? '<td>' + actions(r, i) + '</td>' : '') + '</tr>').join('');
  return '<div class="table-scroll"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

/* ---- the seven required UI states ---- */
export const loadingBox = () => '<div class="card"><div class="empty" role="status" aria-live="polite">Loading…</div></div>';
export const emptyBox = (msg) => '<div class="card"><div class="empty">' + esc(msg || 'Nothing to show yet.') + '</div></div>';
export function errorBox(err) {
  let msg = err && err.message ? err.message : 'Something went wrong.';
  let title = 'Something went wrong';
  if (err && err.network) title = 'Network problem';
  else if (err && err.status === 401) title = 'Session expired';
  else if (err && err.status === 403) title = 'Access denied';
  const retry = err && err.status !== 403 ? '<div style="margin-top:12px"><button class="btn btn-outline btn-sm" data-retry="1">Try again</button></div>' : '';
  return '<div class="card"><div class="empty" role="alert"><b style="display:block;color:var(--text);margin-bottom:4px">' + esc(title) + '</b>' + esc(msg) + retry + '</div></div>';
}

/* Load → render with loading / empty / error handling and a retry hook. */
export async function mountAsync(root, loader, render, { isEmpty, emptyMsg } = {}) {
  const run = async () => {
    root.innerHTML = loadingBox();
    try {
      const data = await loader();
      if (isEmpty && isEmpty(data)) { root.innerHTML = emptyBox(emptyMsg); return; }
      root.innerHTML = '';
      render(data, run);
    } catch (e) {
      root.innerHTML = errorBox(e);
      const b = root.querySelector('[data-retry]');
      if (b) b.addEventListener('click', run);
    }
  };
  await run();
}

/* ---- modal form built on the portal's own openModal/closeModal ---- */
export function formModal({ title, fields, submitLabel = 'Save', onSubmit }) {
  const fhtml = fields.map((f) => {
    const id = 'fm_' + f.name;
    let input;
    if (f.type === 'select') input = '<select id="' + id + '">' + f.options.map((o) => '<option' + (o === f.value ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    else if (f.type === 'textarea') input = '<textarea id="' + id + '" rows="3" style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:13px">' + esc(f.value || '') + '</textarea>';
    else input = '<input id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(f.value || '') + '" autocomplete="off">';
    return '<div class="field" id="ff_' + f.name + '"><label for="' + id + '">' + esc(f.label) + '</label>' + input + '<div class="err">' + esc(f.error || 'This field is required.') + '</div></div>';
  }).join('');
  window.openModal(
    '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
    '<div class="modal-body">' + fhtml + '<div class="err" id="fm_formerr" style="display:none;color:var(--red);font-size:12px"></div></div>' +
    '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button><button class="btn btn-primary" id="fm_submit">' + esc(submitLabel) + '</button></div>');
  const btn = document.getElementById('fm_submit');
  btn.addEventListener('click', async () => {
    const values = {};
    let ok = true;
    fields.forEach((f) => {
      const v = document.getElementById('fm_' + f.name).value.trim();
      values[f.name] = v;
      const bad = f.required && !v;
      document.getElementById('ff_' + f.name).classList.toggle('invalid', bad);
      if (bad) ok = false;
    });
    if (!ok) return;
    btn.disabled = true;
    const ferr = document.getElementById('fm_formerr');
    ferr.style.display = 'none';
    try {
      await onSubmit(values);
      window.closeModal();
    } catch (e) {
      ferr.textContent = e.message || 'Could not save.';
      ferr.style.display = 'block';
      btn.disabled = false;
    }
  });
}
export const go = (path) => window.dispatchEvent(new CustomEvent('hrm:navigate', { detail: path }));

/* Tab strip using the portal's own .pills/.pill look. sections: [{label, render(el)}] */
export function tabs(root, sections) {
  if (sections.length === 1) { sections[0].render(root); return; }
  root.innerHTML = '<div class="pills" role="tablist" style="margin-bottom:16px"></div><div data-tabbody></div>';
  const bar = root.querySelector('.pills');
  const body = root.querySelector('[data-tabbody]');
  const show = (i) => {
    bar.querySelectorAll('.pill').forEach((b, j) => { b.classList.toggle('active', i === j); b.setAttribute('aria-pressed', i === j ? 'true' : 'false'); });
    body.innerHTML = '';
    sections[i].render(body);
  };
  sections.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'pill'; b.textContent = s.label; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => show(i));
    bar.appendChild(b);
  });
  show(0);
}
/* True when a populated `employee` field on a record is the signed-in user. */
export const isMine = (row, user, key = 'employee') => {
  const e = row && row[key];
  if (!e) return false;
  return (typeof e === 'object' ? e.employeeId : e) === user.employeeId;
};
export const isStaff = (user) => user.role !== 'EMPLOYEE';
export const todayISO = () => new Date().toISOString().slice(0, 10);
