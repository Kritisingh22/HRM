/* Payslip Detail — view a single payslip with company branding, print and save as PDF.
 * Fetches from /api/payroll/:id/payslip which is scoped by the backend:
 *  • Employee: can only view their own payslips
 *  • Manager: can view team's payslips (handled by backend)
 *  • HR/Admin: can view all payslips
 * The backend enforces ownership — employee can never access another's payslip. */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/api';
import { Card, Spinner, ErrorNote, EmptyState } from '../../components/ui';

const money = (n) => (typeof n === 'number' ? '₹' + n.toLocaleString('en-IN') : '—');
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function PayslipDetailPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [payslip, setPayslip] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.get('/api/payroll/' + id + '/payslip')
      .then((data) => {
        if (!alive) return;
        setPayslip(data.payslip);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [id]);

  function handlePrint(saveAsPdf = false) {
    if (!payslip) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print or save the payslip.');
      return;
    }
    printWindow.document.write(renderPayslip(payslip));
    printWindow.document.close();
    if (saveAsPdf) {
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    } else {
      setTimeout(() => printWindow.print(), 300);
    }
  }

  if (loading) return <div className="ws-page"><h1>Payslip</h1><Spinner /></div>;
  if (error) return <div className="ws-page"><h1>Payslip</h1><ErrorNote error={error} /></div>;
  if (!payslip) return <div className="ws-page"><h1>Payslip</h1><EmptyState>Payslip not found.</EmptyState></div>;

  const emp = payslip.employee || {};
  const payment = payslip.payment || {};

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Payslip — {payslip.period}</h1>
        <span className="ws-scope">{emp.employeeId ? emp.employeeId + ' — ' + emp.fullName : 'Employee'}</span>
      </div>

      <div className="ws-page-actions" style={{ marginBottom: '16px' }}>
        <button className="ws-btn" onClick={() => navigate(-1)}>← Back</button>
        <button className="ws-btn" onClick={() => handlePrint(false)}>Print</button>
        <button className="ws-btn primary" onClick={() => handlePrint(true)}>Save as PDF</button>
      </div>

      <Card className="payslip-card">
        <div className="hr-real-payslip">
          {/* Header */}
          <div className="hr-real-ps-head">
            <div style={{ flex: 1 }}>
              <h1>CYETHACK</h1>
              <h2>Payslip</h2>
              <p>Your privacy, our priority</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p><strong>Period:</strong> {payslip.period}</p>
              <p><strong>Status:</strong> <span className="ws-pill" style={{ 
                background: payment.status === 'Paid' ? 'rgba(34,197,94,.15)' : 
                payment.status === 'Approved' ? 'rgba(80,152,136,.15)' :
                payment.status === 'Processed' ? 'rgba(59,130,246,.15)' : 'rgba(100,116,139,.18)',
                color: payment.status === 'Paid' ? '#22C55E' :
                payment.status === 'Approved' ? '#509888' :
                payment.status === 'Processed' ? '#3B82F6' : '#64748B'
              }}>{payment.status}</span></p>
            </div>
          </div>

          {/* Employee & Company Info */}
          <section>
            <h3>Employee Details</h3>
            <div className="hr-real-ps-grid">
              <div>
                <div className="hr-real-ps-row"><span>Employee ID</span><b>{emp.employeeId || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Name</span><b>{emp.fullName || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Email</span><b>{emp.email || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Phone</span><b>{emp.phone || '—'}</b></div>
              </div>
              <div>
                <div className="hr-real-ps-row"><span>Department</span><b>{emp.department || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Designation</span><b>{emp.designation || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Employment Type</span><b>{emp.employmentType || 'Full-time'}</b></div>
                <div className="hr-real-ps-row"><span>Location</span><b>{emp.location || '—'}</b></div>
              </div>
            </div>
          </section>

          {/* Earnings & Deductions */}
          <section>
            <h3>Earnings & Deductions</h3>
            <div className="hr-real-ps-columns">
              <div>
                <h4 style={{ margin: '0 0 8px', color: 'var(--teal-bright)' }}>Earnings</h4>
                <table>
                  <tbody>
                    <tr><td>Basic Salary</td><td>{money(payslip.gross)}</td></tr>
                    <tr><td><strong>Gross Earnings</strong></td><td><strong>{money(payslip.gross)}</strong></td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px', color: 'var(--red)' }}>Deductions</h4>
                <table>
                  <tbody>
                    <tr><td>Provident Fund (PF)</td><td>{money(payslip.deductions?.pf)}</td></tr>
                    <tr><td>Tax Deducted at Source (TDS)</td><td>{money(payslip.deductions?.tds)}</td></tr>
                    <tr><td>Employee State Insurance (ESI)</td><td>{money(payslip.deductions?.esi)}</td></tr>
                    <tr><td>Other Deductions</td><td>{money(payslip.deductions?.other)}</td></tr>
                    <tr><td><strong>Total Deductions</strong></td><td><strong>{money(
                      (payslip.deductions?.pf || 0) + (payslip.deductions?.tds || 0) + 
                      (payslip.deductions?.esi || 0) + (payslip.deductions?.other || 0)
                    )}</strong></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Payment Info */}
          <section>
            <h3>Payment Details</h3>
            <div className="hr-real-ps-grid">
              <div>
                <div className="hr-real-ps-row"><span>Payment Status</span><b>{payment.status}</b></div>
                <div className="hr-real-ps-row"><span>Payment Date</span><b>{fmtDate(payment.date)}</b></div>
                <div className="hr-real-ps-row"><span>Mode</span><b>{payment.mode || 'Bank Transfer'}</b></div>
              </div>
              <div>
                <div className="hr-real-ps-row"><span>Reference</span><b>{payment.reference || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Bank</span><b>{payment.bankName || '—'}</b></div>
                <div className="hr-real-ps-row"><span>Account</span><b>{payment.accountNumber ? '****' + payment.accountNumber.slice(-4) : '—'}</b></div>
              </div>
            </div>
          </section>

          {/* Net Pay */}
          <div className="hr-real-ps-net">
            <span>Net Pay</span>
            <b>{money(payslip.net)} {payment.currency || 'INR'}</b>
          </div>

          <footer>
            This is a system-generated payslip.<br />
            Generated on: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | CYETHACK Solutions
          </footer>
        </div>
      </Card>
    </div>
  );
}

function renderPayslip(payslip) {
  const emp = payslip.employee || {};
  const payment = payslip.payment || {};
  const money = (n) => (typeof n === 'number' ? '₹' + n.toLocaleString('en-IN') : '—');
  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const totalDeductions = (payslip.deductions?.pf || 0) + (payslip.deductions?.tds || 0) + 
    (payslip.deductions?.esi || 0) + (payslip.deductions?.other || 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip ${payslip.period} - ${emp.employeeId || ''}</title>
  <style>
    .hr-real-payslip{font:13px Arial,sans-serif;color:#172238;background:#fff;max-width:800px;margin:auto;padding:34px;box-sizing:border-box}
    .hr-real-ps-head{display:flex;gap:18px;align-items:center;border-bottom:2px solid #2f8f7b;padding-bottom:18px}
    .hr-real-ps-head img{width:64px;height:64px;object-fit:contain}
    .hr-real-ps-head h1,.hr-real-ps-head h2,.hr-real-ps-head p{margin:2px 0}
    .hr-real-ps-head h2{font-size:18px}
    .hr-real-ps-head h1{font-size:24px}
    .hr-real-ps-head p,.hr-real-ps-note{color:#64748b}
    .hr-real-payslip section{margin-top:22px}
    .hr-real-payslip h3{font-size:14px;border-bottom:1px solid #cbd5e1;padding-bottom:7px}
    .hr-real-ps-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
    .hr-real-ps-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding:6px 0}
    .hr-real-ps-row b{text-align:right;overflow-wrap:anywhere}
    .hr-real-ps-columns{display:grid;grid-template-columns:1fr 1fr;gap:26px}
    .hr-real-payslip table{width:100%;border-collapse:collapse}
    .hr-real-payslip td{padding:7px 0;border-bottom:1px solid #e2e8f0}
    .hr-real-payslip td:last-child{text-align:right;font-weight:600}
    .hr-real-ps-total{display:flex;justify-content:space-between;padding-top:9px;font-weight:600}
    .hr-real-ps-net{display:flex;justify-content:space-between;background:#e4f5f0;border:1px solid #2f8f7b;padding:14px;margin-top:22px;font-size:16px}
    .hr-real-ps-net b{font-size:20px}
    .hr-real-payslip footer{border-top:1px solid #cbd5e1;margin-top:28px;padding-top:12px;text-align:center;font-size:11px;color:#64748b}
    @media print{body{margin:0}.hr-real-payslip{padding:0;max-width:none}@page{size:A4;margin:14mm}}
  </style>
</head>
<body>
  <div class="hr-real-payslip">
    <div class="hr-real-ps-head">
      <div style="flex:1">
        <h1>CYETHACK</h1>
        <h2>Payslip</h2>
        <p>Your privacy, our priority</p>
      </div>
      <div style="text-align:right">
        <p><strong>Period:</strong> ${payslip.period}</p>
        <p><strong>Status:</strong> ${payment.status}</p>
      </div>
    </div>
    <section>
      <h3>Employee Details</h3>
      <div class="hr-real-ps-grid">
        <div>
          <div class="hr-real-ps-row"><span>Employee ID</span><b>${emp.employeeId || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Name</span><b>${emp.fullName || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Email</span><b>${emp.email || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Phone</span><b>${emp.phone || '—'}</b></div>
        </div>
        <div>
          <div class="hr-real-ps-row"><span>Department</span><b>${emp.department || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Designation</span><b>${emp.designation || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Employment Type</span><b>${emp.employmentType || 'Full-time'}</b></div>
          <div class="hr-real-ps-row"><span>Location</span><b>${emp.location || '—'}</b></div>
        </div>
      </div>
    </section>
    <section>
      <h3>Earnings & Deductions</h3>
      <div class="hr-real-ps-columns">
        <div>
          <h4 style="margin:0 0 8px;color:#2f8f7b">Earnings</h4>
          <table>
            <tbody>
              <tr><td>Basic Salary</td><td>${money(payslip.gross)}</td></tr>
              <tr><td><strong>Gross Earnings</strong></td><td><strong>${money(payslip.gross)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h4 style="margin:0 0 8px;color:#dc2626">Deductions</h4>
          <table>
            <tbody>
              <tr><td>Provident Fund (PF)</td><td>${money(payslip.deductions?.pf)}</td></tr>
              <tr><td>Tax Deducted at Source (TDS)</td><td>${money(payslip.deductions?.tds)}</td></tr>
              <tr><td>Employee State Insurance (ESI)</td><td>${money(payslip.deductions?.esi)}</td></tr>
              <tr><td>Other Deductions</td><td>${money(payslip.deductions?.other)}</td></tr>
              <tr><td><strong>Total Deductions</strong></td><td><strong>${money(totalDeductions)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <section>
      <h3>Payment Details</h3>
      <div class="hr-real-ps-grid">
        <div>
          <div class="hr-real-ps-row"><span>Payment Status</span><b>${payment.status}</b></div>
          <div class="hr-real-ps-row"><span>Payment Date</span><b>${fmtDate(payment.date)}</b></div>
          <div class="hr-real-ps-row"><span>Mode</span><b>${payment.mode || 'Bank Transfer'}</b></div>
        </div>
        <div>
          <div class="hr-real-ps-row"><span>Reference</span><b>${payment.reference || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Bank</span><b>${payment.bankName || '—'}</b></div>
          <div class="hr-real-ps-row"><span>Account</span><b>${payment.accountNumber ? '****' + payment.accountNumber.slice(-4) : '—'}</b></div>
        </div>
      </div>
    </section>
    <div class="hr-real-ps-net">
      <span>Net Pay</span>
      <b>${money(payslip.net)} ${payment.currency || 'INR'}</b>
    </div>
    <footer>
      This is a system-generated payslip.<br />
      Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | CYETHACK Solutions
    </footer>
  </div>
</body>
</html>`;
}