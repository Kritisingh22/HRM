/* ============================================================
   AttendanceDashboard — HR/Manager view of all employees in scope.

   Table: employee, check-in time, check-out time, location status,
   active hours, paused hours, day status. Filters: employee, date
   range, status. CSV export.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { EmpCell } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { listAttendance, attendanceErrorMessage } from '@/api/attendance';
import { teamIds } from '@/lib/lookups';
import { todayISO } from '@/lib/date';

export function AttendanceDashboard() {
  const { data } = useApp();
  const { user, canManage } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const myId = user?.employeeId ?? '';
  const isSelf = user?.portal === 'employee';
  const scope = useMemo(() => {
    const filtered = teamIds(data.employees, myId);
    if (isSelf) return data.employees.filter((e) => e.id === myId);
    return data.employees.filter((e) => filtered.has(e.id));
  }, [data.employees, isSelf, myId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterEmp) params.employee = filterEmp;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      if (filterStatus) params.status = filterStatus;
      const data = await listAttendance(params);
      setRows(data.attendance);
    } catch (err) {
      setError(attendanceErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filterEmp, filterFrom, filterTo, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCSV = () => {
    const headers = ['Employee', 'ID', 'Date', 'Check In', 'Check Out', 'Active (h)', 'Paused (h)', 'Status', 'Location'];
    const lines = [headers.join(',')];
    rows.forEach((r) => {
      const emp = data.employees.find((e) => String(e.id) === String(r.employee));
      const activeH = (r.activeSeconds / 3600).toFixed(2);
      const pausedH = (r.pausedSeconds / 3600).toFixed(2);
      const loc = r.geofence?.inRange === false ? `out (${r.geofence.distanceMeters}m)` : r.geofence?.inRange === true ? 'in-range' : '—';
      lines.push([
        emp?.name ?? r.employee,
        emp?.id ?? '',
        r.date,
        r.checkIn ?? '',
        r.checkOut ?? '',
        activeH,
        pausedH,
        r.status,
        loc,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 200);
    toast('Attendance exported to CSV.', 'success');
  };

  if (loading) {
    return (
      <div className="empty-state">
        <span className="ic"><Icon name="clock" size={22} /></span>
        <span className="title">Loading attendance…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty-state">
        <span className="ic"><Icon name="alertCircle" size={22} /></span>
        <span className="title">Could not load attendance</span>
        <span className="sub">{error}</span>
      </div>
    );
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [rows]);

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Team Attendance Dashboard</h2>
            <div className="sub">{scope.length} employees in scope · {rows.length} records</div>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            {Object.entries(statusCounts).map(([k, v]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10 }}>
                <span className="cal-dot" style={{ background: k === 'present' ? '#22C55E' : k === 'outside-location' ? '#EF4444' : '#F59E0B' }} />
                {k}: {v}
              </span>
            ))}
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} aria-label="Employee" style={{ minWidth: 200 }}>
            <option value="">All employees</option>
            {scope.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.id}
              </option>
            ))}
          </select>
          <input type="date" className="input" style={{ width: 140 }} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} placeholder="From" />
          <input type="date" className="input" style={{ width: 140 }} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} placeholder="To" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="half-day">Half Day</option>
            <option value="outside-location">Outside Location</option>
            <option value="wfh">WFH</option>
          </select>
          <span className="spacer" />
          <button className="btn btn-outline" onClick={load} type="button">
            <Icon name="refresh" size={13} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={exportCSV} type="button">
            <Icon name="download" size={13} /> Export CSV
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="fileText" title="No attendance records" sub="No records match the filters." />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Active</th>
                  <th>Paused</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const emp = data.employees.find((e) => String(e.id) === String(r.employee));
                  const inRange = r.geofence?.inRange;
                  const dist = r.geofence?.distanceMeters;
                  return (
                    <tr key={r.id}>
                      <td>
                        <EmpCell name={emp?.name ?? r.employee} sub={emp?.id ?? ''} seed={emp?.id ?? r.employee} size={32} />
                      </td>
                      <td className="num">{r.date}</td>
                      <td className="num">{r.checkIn ?? '—'}</td>
                      <td className="num">{r.checkOut ?? '—'}</td>
                      <td className="num">{r.activeSeconds ? (r.activeSeconds / 3600).toFixed(2) + 'h' : '—'}</td>
                      <td className="num">{r.pausedSeconds ? (r.pausedSeconds / 3600).toFixed(2) + 'h' : '—'}</td>
                      <td className="num">
                        {inRange === false ? `⚠ ${dist}m` : inRange === true ? 'in-range' : '—'}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color:
                              r.status === 'present'
                                ? '#15803d'
                                : r.status === 'outside-location'
                                  ? '#b91c1c'
                                  : r.status === 'absent'
                                    ? '#b91c1c'
                                    : 'var(--text-2)',
                          }}
                        >
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
