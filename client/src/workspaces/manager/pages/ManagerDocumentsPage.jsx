'use strict';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, DataTable, Modal, Toast } from 'ui';
import { Field } from 'ui';
import { useList } from '../../../hooks/useList';
import { useToast } from 'ui';
import ConfirmDialog from '../../../portal/ConfirmDialog';

const COLUMNS = [
  { label: 'Document', get: (r) => <><strong>{r.title}</strong><div className="ws-muted" style={{fontSize:12}}>{r.originalName}</div></> },
  { label: 'Category', get: (r) => r.category, render: (v) => <span className="ws-badge">{v}</span> },
  { label: 'Employee', get: (r) => r.employee ? `${r.employee.employeeId} — ${r.employee.fullName}` : '—' },
  { label: 'Visibility', get: (r) => r.visibility, render: (v) => <span className="ws-badge">{v}</span> },
  { label: 'Verified', get: (r) => r.isVerified, render: (v) => <span className={v ? 'ws-pill ok' : 'ws-pill warn'}>{v ? 'Yes' : 'No'}</span> },
  { label: 'Size', get: (r) => (r.fileSize/1024/1024).toFixed(2) + ' MB' },
  { label: 'Date', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
];

export default function ManagerDocumentsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/employee-documents');

  const canVerify = hasPermission('documents:verify');
  const [reviewing, setReviewing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function act(id, action, label) {
    setBusyId(id);
    try {
      if (action === 'verify') await api.put('/api/employee-documents/' + id + '/verify');
      else await api.delete('/api/employee-documents/' + id);
      toast.success(label);
      reload();
    } catch (e) { setBusyId(null); toast.error(e?.message || 'Failed.'); }
  }

  const actions = (r) => (
    <>
      {canVerify && !r.isVerified && <button className="ws-btn sm ok" disabled={busyId === r._id} onClick={() => act(r._id, 'verify', 'Verified')}>Verify</button>}
      <button className="ws-btn sm bad" disabled={busyId === r._id} onClick={() => { if (confirm('Delete?')) act(r._id, 'delete', 'Deleted.') }}>Delete</button>
    </>
  );

  async function act(id, action, label) {
    setBusyId(id);
    try {
      if (action === 'verify') await api.put('/api/employee-documents/' + id + '/verify');
      else await api.delete('/api/employee-documents/' + id);
      toast.success(label);
      reload();
    } catch (e) { setBusyId(null); toast.error(e?.message || 'Failed.'); }
  }

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>Team Documents</h1><span className="ws-scope">Your team's documents</span></div>

      <Card>
        <DataTable
          columns={[
            { label: 'Document', get: (r) => <><strong>{r.title}</strong><div className="ws-muted" style={{fontSize:12}}>{r.originalName}</div></> },
            { label: 'Category', get: (r) => r.category, render: (v) => <span className="ws-badge">{v}</span> },
            { label: 'Employee', get: (r) => r.employee ? `${r.employee.employeeId} — ${r.employee.fullName}` : '—' },
            { label: 'Visibility', get: (r) => r.visibility, render: (v) => <span className="ws-badge">{v}</span> },
            { label: 'Verified', get: (r) => r.isVerified, render: (v) => <span className={v ? 'ws-pill ok' : 'ws-pill warn'}>{v ? 'Yes' : 'No'}</span> },
            { label: 'Size', get: (r) => (r.fileSize/1024/1024).toFixed(2) + ' MB' },
            { label: 'Date', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
            { label: 'Action', get: (r) => actions(r) }
          ]}
          rows={rows}
          loading={loading}
          error={error}
          emptyText="No team documents found."
        />
      </Card>
    </div>
  );
}