/* My Team — manager's view of their direct & indirect reports.
 * Uses /api/employees endpoint (scoped by backend to manager's team).
 * Read-only for managers (no create/edit/delete). */
import { useAuth } from '../../../auth/AuthContext';
import { Card, Modal } from 'ui';
import { DataTable } from 'ui';
import { COLUMNS } from 'ui';
import { useList } from '../../../hooks/useList';

export default function MyTeamPage() {
  const { hasPermission } = useAuth();
  const { rows, loading, error } = useList('/api/employees');

  const canRead = hasPermission('employees:read');

  // Read-only table for managers - no actions
  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>My Team</h1>
        <span className="ws-scope">Your direct & indirect reports</span>
      </div>

      <Card>
        <DataTable
          columns={COLUMNS.team}
          rows={rows}
          loading={loading}
          error={error}
          emptyText="No team members found."
        />
      </Card>
    </div>
  );
}