/* Leave: balance, apply, history, calendar (own); team history + approvals (staff). */
import { get, post, put } from '../../core/api.js';
import { mountAsync, pageHead, table, pill, tabs, esc, fmtDate, personName, isMine, isStaff, formModal, toast, todayISO } from '../ui.js';

const TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'];

function calendar(el, leaves) {
  const state = { y: new Date().getFullYear(), m: new Date().getMonth() };
  const draw = () => {
    const first = new Date(state.y, state.m, 1), days = new Date(state.y, state.m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;                            // Monday-first grid
    const iso = (d) => state.y + '-' + String(state.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const on = (d) => leaves.filter((l) => ['Approved', 'Pending'].includes(l.status) && String(l.from).slice(0, 10) <= iso(d) && String(l.to).slice(0, 10) >= iso(d));
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const hit = on(d);
      const st = hit.length ? (hit.some((l) => l.status === 'Approved') ? 'var(--green-tint)' : 'var(--amber-tint)') : 'transparent';
      cells += '<div title="' + esc(hit.map((l) => l.type + ' (' + l.status + ')').join(', ')) + '" style="padding:8px 6px;border:1px solid var(--border);border-radius:8px;background:' + st + ';min-height:44px;font-size:12px"><b>' + d + '</b>' + (hit.length ? '<div style="font-size:10px;color:var(--text-2)">' + esc(hit[0].type.replace(' Leave', '')) + '</div>' : '') + '</div>';
    }
    el.innerHTML = '<div class="card-head"><div><h2>' + first.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) + '</h2><div class="sub">Green = approved · Amber = pending</div></div>' +
      '<div class="pills"><button class="pill" data-m="-1" aria-label="Previous month">‹</button><button class="pill" data-m="1" aria-label="Next month">›</button></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;font-size:11px;color:var(--text-2);margin-bottom:6px">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => '<div>' + d + '</div>').join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">' + cells + '</div>';
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { state.m += +b.dataset.m; if (state.m < 0) { state.m = 11; state.y--; } if (state.m > 11) { state.m = 0; state.y++; } draw(); }));
  };
  draw();
}

function applyModal(user, done) {
  formModal({
    title: 'Apply for leave', submitLabel: 'Submit request',
    fields: [
      { name: 'type', label: 'Leave type', type: 'select', options: TYPES, value: TYPES[0] },
      { name: 'from', label: 'From', type: 'date', value: todayISO(), required: true },
      { name: 'to', label: 'To', type: 'date', value: todayISO(), required: true },
      { name: 'half', label: 'Half day?', type: 'select', options: ['No', 'Yes'], value: 'No' },
      { name: 'approvalAuthority', label: 'Approver', type: 'select', options: user.role === 'EMPLOYEE' ? ['Manager', 'HR'] : ['Manager'], value: 'Manager' },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true },
    ],
    onSubmit: async (v) => {
      // the server attaches the request to the signed-in employee and computes the days
      await post('/api/leaves', { type: v.type, from: v.from, to: v.to, halfDay: v.half === 'Yes', reason: v.reason, approvalAuthority: v.approvalAuthority });
      toast('Leave request submitted'); done();
    },
  });
}

export async function leave(ctx) {
  ctx.root.innerHTML = '';
  const host = document.createElement('div'); ctx.root.appendChild(host);
  const defs = [{
    label: isStaff(ctx.user) ? 'My Leave' : 'Leave',
    render: (el) => {
      el.innerHTML = '<div data-bal></div><div style="display:flex;justify-content:flex-end;margin:4px 0 12px"><button class="btn btn-primary btn-sm" data-apply>+ Apply Leave</button></div><section class="card" data-cal></section><div data-hist style="margin-top:20px"></div>';
      const reload = () => {
        mountAsync(el.querySelector('[data-bal]'), () => get('/api/leaves/balance'), (d) => {
          const box = el.querySelector('[data-bal]');
          box.innerHTML = '<div class="grid" style="margin-bottom:12px">' + d.balances.filter((b) => b.total !== null).map((b) =>
            '<div class="card span3"><div style="font-size:13px;color:var(--text-2)">' + esc(b.type) + '</div><div style="font-family:var(--mono);font-size:24px;font-weight:600;margin:4px 0">' + b.remaining + ' <span style="font-size:12px;color:var(--text-2)">left of ' + b.total + '</span></div><div style="font-size:12px;color:var(--text-2)">' + b.used + ' used · ' + b.pending + ' pending</div></div>').join('') + '</div>';
        });
        mountAsync(el.querySelector('[data-hist]'), async () => filterMine((await get('/api/leaves')).leaves || []), (rows) => {
          calendar(el.querySelector('[data-cal]'), rows);
          const groups = ['Pending', 'Approved', 'Rejected'];
          el.querySelector('[data-hist]').innerHTML = '<section class="card"><div class="card-head"><div><h2>My leave history</h2><div class="sub">' + groups.map((g) => rows.filter((r) => r.status === g).length + ' ' + g.toLowerCase()).join(' · ') + '</div></div></div>' +
            table([{ label: 'Type', get: (r) => r.type }, { label: 'From', get: (r) => fmtDate(r.from) }, { label: 'To', get: (r) => fmtDate(r.to) }, { label: 'Days', align: 'right', get: (r) => r.days }, { label: 'Status', get: (r) => pill(r.status), html: true }, { label: 'Remarks', get: (r) => r.managerNote || '—' }], rows,
              { actions: (r, i) => r.status === 'Pending' ? '<button class="btn btn-danger-outline btn-sm" data-cancel="' + i + '">Cancel</button>' : '' }) + '</section>';
          el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
            try { await put('/api/leaves/' + rows[+b.dataset.cancel]._id, { status: 'Cancelled' }); toast('Request cancelled'); reload(); } catch (e) { toast(e.message); }
          }));
        }, { isEmpty: (r) => !r.length, emptyMsg: 'No leave requests yet.' });
      };
      const filterMine = (rows) => rows.filter((r) => isMine(r, ctx.user));
      el.querySelector('[data-apply]').addEventListener('click', () => applyModal(ctx.user, reload));
      reload();
    },
  }];
  if (isStaff(ctx.user)) defs.push({
    label: 'Employee Leave',
    render: (el) => mountAsync(el, async () => ((await get('/api/leaves')).leaves || []).filter((r) => !isMine(r, ctx.user)), (rows) => {
      el.innerHTML = '<section class="card">' + table([{ label: 'Employee', get: (r) => personName(r.employee) }, { label: 'Type', get: (r) => r.type }, { label: 'From', get: (r) => fmtDate(r.from) }, { label: 'To', get: (r) => fmtDate(r.to) }, { label: 'Days', align: 'right', get: (r) => r.days }, { label: 'Status', get: (r) => pill(r.status), html: true }], rows) + '</section>';
    }, { isEmpty: (r) => !r.length, emptyMsg: 'No leave requests from employees in your scope.' }),
  });
  tabs(host, defs);
}

export async function leaveApprovals(ctx) {
  ctx.root.innerHTML = '';
  const el = document.createElement('div'); ctx.root.appendChild(el);
  const load = () => mountAsync(el, async () => ((await get('/api/leaves')).leaves || []).filter((r) => !isMine(r, ctx.user)), (rows) => {
    const pending = rows.filter((r) => r.status === 'Pending');
    const decided = rows.filter((r) => r.status !== 'Pending');
    const cols = [{ label: 'Employee', get: (r) => personName(r.employee) }, { label: 'Type', get: (r) => r.type }, { label: 'From', get: (r) => fmtDate(r.from) }, { label: 'To', get: (r) => fmtDate(r.to) }, { label: 'Days', align: 'right', get: (r) => r.days }, { label: 'Reason', get: (r) => r.reason || '—' }];
    el.innerHTML = '<section class="card"><div class="card-head"><div><h2>Pending approvals</h2><div class="sub">' + pending.length + ' awaiting your decision</div></div></div>' +
      (pending.length ? table(cols, pending, { actions: (r, i) => '<button class="btn btn-outline btn-sm" data-act="Approved" data-i="' + i + '">Approve</button> <button class="btn btn-danger-outline btn-sm" data-act="Rejected" data-i="' + i + '">Reject</button>' }) : '<div class="empty">No leave requests are waiting for approval.</div>') +
      '</section><section class="card" style="margin-top:20px"><div class="card-head"><div><h2>Decided</h2></div></div>' +
      (decided.length ? table([...cols.slice(0, 5), { label: 'Status', get: (r) => pill(r.status), html: true }, { label: 'Remarks', get: (r) => r.managerNote || '—' }], decided) : '<div class="empty">No decided requests yet.</div>') + '</section>';
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const r = pending[+b.dataset.i], status = b.dataset.act;
      formModal({
        title: status === 'Approved' ? 'Approve leave' : 'Reject leave', submitLabel: status === 'Approved' ? 'Approve' : 'Reject',
        fields: [{ name: 'note', label: 'Remarks (optional)', type: 'textarea' }],
        onSubmit: async (v) => { await put('/api/leaves/' + r._id, { status, managerNote: v.note }); toast('Leave ' + status.toLowerCase()); load(); },
      });
    }));
  }, { isEmpty: (r) => !r.length, emptyMsg: 'No leave requests from employees in your scope.' });
  await load();
}
