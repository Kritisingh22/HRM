/* ============================================================
   FloatingActions — Export CSV (first visible table) and the
   What's New card, both pinned above the content.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { exportTable } from '@/lib/csv';

const NEWS: Array<{ title: string; body: string }> = [
  {
    title: 'Role-based portals',
    body: 'Sign in as HR Admin, Manager or Employee — the sidebar, salary data and actions adapt to each role.',
  },
  {
    title: 'Leave & attendance calendar',
    body: 'A real month grid with holidays, approval states and a one-click leave application with working-day validation.',
  },
  {
    title: 'Payroll in-hand only',
    body: 'Monthly payroll runs, payslips with an earnings/deductions split, salary structure and history — no CTC noise.',
  },
  {
    title: 'Analytics you can drill into',
    body: 'Filter by department, period and status, click any bar to drill in, then export the detail table to CSV.',
  },
  {
    title: 'Workspace extras',
    body: 'My Profile self-service, Notice Board, HR Helpdesk, Leave Approvals, Org Chart and Offboarding checklists.',
  },
];

export function FloatingActions() {
  const { toast } = useToast();
  const [news, setNews] = useState(false);

  const exportCurrent = () => {
    const table = Array.from(document.querySelectorAll<HTMLTableElement>('table.data')).find(
      (t) => t.offsetParent !== null,
    );
    if (!table) {
      toast('Open a table view (Employees, Payroll, Reports…) to export it.', 'error');
      return;
    }
    exportTable(table, `cyethack_export_${new Date().toISOString().slice(0, 10)}`);
    toast('CSV exported for the table on screen.', 'success');
  };

  return (
    <>
      <div className="floating-actions">
        <button onClick={exportCurrent} type="button" title="Export the visible table as CSV">
          <Icon name="download" size={14} /> Export CSV
        </button>
        <button onClick={() => setNews(true)} type="button" title="What's new in this portal">
          <Icon name="sparkles" size={14} /> What&apos;s new
        </button>
      </div>
      {news ? (
        <Modal title="What's new in the portal" onClose={() => setNews(false)} large>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {NEWS.map((item) => (
              <div key={item.title} className="ann">
                <b>{item.title}</b>
                <p style={{ whiteSpace: 'normal' }}>{item.body}</p>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
