/* Employee Payroll — list of own payslips with View action.
 * Uses the same /api/payroll endpoint (scoped by backend to own payslips only).
 * Clicking View navigates to the PayslipDetailPage for the full payslip
 * with company branding, print and save as PDF functionality. */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/ui';
import DataTable from '../../components/DataTable';
import { COLUMNS } from '../../components/columns';
import { useList } from '../../hooks/useList';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { api } from '../../services/api';

const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

export default function EmployeePayrollPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rows, loading, error, reload } = useList('/api/payroll');
  const toast = useToast();

  function handleView(payslipId) {
    navigate('/employee/payroll/' + payslipId);
  }

  const actions = (r) => (
    <button className="ws-btn sm" onClick={() => handleView(r._id)}>View</button>
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>My Payroll</h1>
        <span className="ws-scope">Your salary slips</span>
      </div>

      <Card>
        <DataTable
          columns={COLUMNS.payroll}
          rows={rows}
          loading={loading}
          error={error}
          actions={actions}
          emptyText="No payslips yet."
        />
      </Card>
    </div>
  );
}