/* ============================================================
   AttendanceHistory — employee's own attendance history table.

   Columns: date, check-in, check-out, active hours, paused hours,
   status, location. Empty/loading/error states included.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/primitives';
import { getMe, attendanceErrorMessage } from '@/api/attendance';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatSeconds } from '@/components/attendance/ActiveTimer';

export function AttendanceHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await getMe();
        if (!mounted) return;
        setRows((data.attendance || []).slice().reverse());
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(attendanceErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user]);

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
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="ic"><Icon name="fileText" size={22} /></span>
        <span className="title">No attendance records yet</span>
        <span className="sub">Check in to start recording your attendance.</span>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Check in</th>
            <th>Check out</th>
            <th>Active</th>
            <th>Paused</th>
            <th>Status</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const inRange = r.geofence?.inRange ?? null;
            const dist = r.geofence?.distanceMeters;
            return (
              <tr key={r.id}>
                <td className="num">{r.date}</td>
                <td className="num">{r.checkIn ?? '—'}</td>
                <td className="num">{r.checkOut ?? '—'}</td>
                <td className="num">{r.activeSeconds ? formatSeconds(r.activeSeconds) : '—'}</td>
                <td className="num">{r.pausedSeconds ? formatSeconds(r.pausedSeconds) : '—'}</td>
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
                    {r.status === 'outside-location' && (
                      <span style={{ fontSize: 10, border: '1px solid currentColor', padding: '1px 6px', borderRadius: 10, textTransform: 'uppercase' }}>
                        outside
                      </span>
                    )}
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </td>
                <td className="num">
                  {inRange === false ? `⚠ ${dist}m` : inRange === true ? 'in-range' : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
