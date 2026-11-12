'use strict';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, DataTable, Modal } from 'ui';
import { useList } from '../../../hooks/useList';

const COLUMNS = [
  { label: 'Training', get: (r) => r.training?.title || '—' },
  { label: 'Category', get: (r) => r.training?.category || '—' },
  { label: 'Duration (hrs)', get: (r) => r.training?.durationHours || 0 },
  { label: 'Due Date', get: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-IN') : '—' },
  { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> },
  { label: 'Progress', get: (r) => r.status === 'COMPLETED' ? '100%' : r.status === 'IN_PROGRESS' ? 'In Progress' : 'Not Started' },
];

export default function EmployeeTrainingPage() {
  const { rows, loading, error, reload } = useList('/api/training-assignments/my');

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>My Training</h1><span className="ws-scope">Your assigned training programs</span></div>

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          emptyText="No training assignments yet."
        />
      </Card>
    </div>
  );
}