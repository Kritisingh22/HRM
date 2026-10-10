/* Offboarding for authorised employees: list, initiate, tick clearance, update status. */
import { get, post, put } from '../../core/api.js';
import { mountAsync, pageHead, table, pill, esc, fmtDate, personName, formModal, toast } from '../ui.js';

const REASONS = ['Resignation', 'Termination', 'End of Contract', 'Retirement', 'Other'];
const STATUS = ['Initiated', 'In Progress', 'Cleared', 'Completed'];
export async function offboarding(ctx) {
  ctx.root.innerHTML = pageHead('Offboarding', 'Exits for employees in your scope', '<button class="btn btn-primary btn-sm" data-new>+ Initiate offboarding</button>') + '<div data-body></div>';
  const body = ctx.root.querySelector('[data-body]');
  const load = () => mountAsync(body, async () => (await get('/api/offboarding')).offboarding || [], (rows) => {
    body.innerHTML = '<section class="card">' + table([{ label: 'Employee', get: (r) => personName(r.employee) }, { label: 'Reason', get: (r) => r.reason }, { label: 'Last working day', get: (r) => fmtDate(r.lastWorkingDate) },
      { label: 'Clearance', get: (r) => (r.clearance || []).filter((c) => c.done).length + ' / ' + (r.clearance || []).length }, { label: 'Status', get: (r) => pill(r.status), html: true }], rows,
      { actions: (r, i) => '<button class="btn btn-outline btn-sm" data-i="' + i + '">Manage</button>' }) + '</section>';
    body.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const r = rows[+b.dataset.i];
      window.openModal('<div class="modal-head"><h3>Offboarding · ' + esc(personName(r.employee)) + '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div><div class="modal-body">' +
        (r.clearance || []).map((c) => '<label style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><input type="checkbox" data-c="' + esc(c._id) + '" ' + (c.done ? 'checked' : '') + ' style="accent-color:var(--teal)"> ' + esc(c.item) + '</label>').join('') +
        '<div class="field" style="margin-top:12px"><label for="obSt">Status</label><select id="obSt">' + STATUS.map((s) => '<option' + (s === r.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div></div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button><button class="btn btn-primary" id="obSave">Save</button></div>');
      document.getElementById('obSave').addEventListener('click', async () => {
        const clearance = (r.clearance || []).map((c) => ({ _id: c._id, item: c.item, done: document.querySelector('[data-c="' + c._id + '"]').checked }));
        try { await put('/api/offboarding/' + r._id, { clearance, status: document.getElementById('obSt').value }); toast('Offboarding updated'); window.closeModal(); load(); } catch (e) { toast(e.message); }
      });
    }));
  }, { isEmpty: (r) => !r.length, emptyMsg: 'No offboarding cases in your scope.' });
  ctx.root.querySelector('[data-new]').addEventListener('click', async () => {
    let emps = [];
    try { emps = (await get('/api/employees')).employees || []; } catch (e) { return toast(e.message); }
    emps = emps.filter((e) => e.employeeId !== ctx.user.employeeId && e.status !== 'Exited');
    if (!emps.length) return toast('No employees available in your scope.');
    formModal({ title: 'Initiate offboarding', submitLabel: 'Initiate',
      fields: [{ name: 'emp', label: 'Employee', type: 'select', options: emps.map((e) => e.employeeId + ' — ' + e.fullName), value: '' }, { name: 'reason', label: 'Reason', type: 'select', options: REASONS, value: REASONS[0] }, { name: 'lastWorkingDate', label: 'Last working day', type: 'date', required: true }],
      onSubmit: async (v) => { const e = emps.find((x) => v.emp.startsWith(x.employeeId + ' ')); await post('/api/offboarding', { employee: e._id, reason: v.reason, lastWorkingDate: v.lastWorkingDate }); toast('Offboarding initiated'); load(); } });
  });
  await load();
}
