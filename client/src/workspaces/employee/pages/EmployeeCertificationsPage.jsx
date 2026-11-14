'use strict';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, DataTable, Modal } from 'ui';
import { useList } from '../../../hooks/useList';

const COLUMNS = [
  { label: 'Certification', get: (r) => r.name },
  { label: 'Issuer', get: (r) => r.issuer || '—' },
  { label: 'Issue Date', get: (r) => r.issueDate ? new Date(r.issueDate).toLocaleDateString('en-IN') : '—' },
  { label: 'Expiry Date', get: (r) => r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('en-IN') : '—' },
  { label: 'Credential ID', get: (r) => r.credentialId || '—' },
  { label: 'Status', get: (r) => r.expiryDate && new Date(r.expiryDate) < new Date() ? 'Expired' : 'Valid', render: (v) => <StatusPill value={v} /> },
];

export default function EmployeeCertificationsPage() {
  const { rows, loading, error, reload } = useList('/api/certifications/my');

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>My Certifications</h1><span className="ws-scope">Your certifications</span></div>

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          emptyText="No certifications yet."
        />
      </Card>
    </div>
  );
}