/* Documents: "Personal" (the employee's own) and "Company" (shared). Staff also get
 * "Employee Documents" for people in their scope — the server decides what is returned. */
import { get, post, download } from '../../core/api.js';
import { mountAsync, table, pill, tabs, esc, fmtDate, personName, isMine, isStaff, formModal, toast } from '../ui.js';

const PERSONAL = ['Personal Document', 'ID Proof', 'Certificate', 'Contract', 'Payslip'];
const isCompany = (d) => d.visibility === 'all' || ['Policy', 'Company Document', 'HR Manual', 'Circular Document'].includes(d.category);

function list(el, rows, { owner } = {}) {
  el.innerHTML = '<section class="card">' + table([
    { label: 'Document', get: (d) => d.title }, ...(owner ? [{ label: 'Owner', get: (d) => personName(d.owner) }] : []),
    { label: 'Category', get: (d) => d.category }, { label: 'Uploaded', get: (d) => fmtDate(d.createdAt) },
  ], rows, { actions: (d, i) => '<button class="btn btn-outline btn-sm" data-dl="' + i + '">Download</button>' }) + '</section>';
  el.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
    const d = rows[+b.dataset.dl];
    try { await download('/api/documents/' + d._id + '/download', d.originalName || d.title); } catch (e) { toast(e.message); }
  }));
}
function uploadModal(done) {
  window.openModal('<div class="modal-head"><h3>Upload document</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div><div class="modal-body">' +
    '<div class="field"><label for="udTitle">Title</label><input id="udTitle" type="text"></div>' +
    '<div class="field"><label for="udCat">Category</label><select id="udCat">' + PERSONAL.map((c) => '<option>' + c + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="udFile">File</label><input id="udFile" type="file"></div><div id="udErr" style="display:none;color:var(--red);font-size:12px"></div></div>' +
    '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button><button class="btn btn-primary" id="udGo">Upload</button></div>');
  document.getElementById('udGo').addEventListener('click', async () => {
    const f = document.getElementById('udFile').files[0], err = document.getElementById('udErr');
    if (!f) { err.textContent = 'Choose a file to upload.'; err.style.display = 'block'; return; }
    const fd = new FormData();
    fd.append('file', f); fd.append('title', document.getElementById('udTitle').value || f.name);
    fd.append('category', document.getElementById('udCat').value); fd.append('visibility', 'private');   // owner is set by the server
    try { await post('/api/documents', fd); toast('Document uploaded'); window.closeModal(); done(); } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  });
}
export async function documents(ctx) {
  ctx.root.innerHTML = '';
  const host = document.createElement('div'); ctx.root.appendChild(host);
  const all = () => get('/api/documents').then((d) => d.documents || []);
  const defs = [
    { label: isStaff(ctx.user) ? 'My Documents' : 'Personal Documents', render: (el) => {
      el.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary btn-sm" data-up>+ Upload</button></div><div data-body></div>';
      const body = el.querySelector('[data-body]');
      const load = () => mountAsync(body, async () => (await all()).filter((d) => !isCompany(d) && isMine(d, ctx.user, 'owner')), (rows) => list(body, rows), { isEmpty: (r) => !r.length, emptyMsg: 'You have no personal documents yet.' });
      el.querySelector('[data-up]').addEventListener('click', () => uploadModal(load));
      load();
    } },
    { label: 'Company Documents', render: (el) => mountAsync(el, async () => (await all()).filter(isCompany), (rows) => list(el, rows), { isEmpty: (r) => !r.length, emptyMsg: 'No company documents have been shared.' }) },
  ];
  if (isStaff(ctx.user)) defs.push({ label: 'Employee Documents', render: (el) => mountAsync(el, async () => (await all()).filter((d) => !isCompany(d) && !isMine(d, ctx.user, 'owner')), (rows) => list(el, rows, { owner: true }), { isEmpty: (r) => !r.length, emptyMsg: 'No employee documents are available in your scope.' }) });
  tabs(host, defs);
}
