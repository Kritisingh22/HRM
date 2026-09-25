/* Leave Calendar — role-aware monthly calendar view of leave data.
 * Fetches from /api/leaves/calendar which is already scoped by the backend:
 *  • Employee: sees their own leave
 *  • Manager: sees their team's leave
 *  • HR/Admin: sees all leave
 * Clicking a leave entry shows details in a modal. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, personName, personId } from '../../components/ui';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function LeaveCalendarPage({ title, scopeNote }) {
  const { user } = useAuth();
  const toast = useToast();
  const isEmployee = user?.role === 'EMPLOYEE';
  const canDecide = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role);

  const [byDate, setByDate] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailLeave, setDetailLeave] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get('/api/leaves/calendar');
      setByDate(d.byDate || {});
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(load, [load]);

  // Navigate months
  function prevMonth() {
    setCurrentMonth((m) => {
      const n = new Date(m);
      n.setMonth(n.getMonth() - 1);
      return n;
    });
  }
  function nextMonth() {
    setCurrentMonth((m) => {
      const n = new Date(m);
      n.setMonth(n.getMonth() + 1);
      return n;
    });
  }
  function todayMonth() {
    setCurrentMonth(new Date());
  }

  // Generate calendar grid for current month
  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weeks = [];
    let week = [];

    // Leading blanks
    for (let i = 0; i < firstDay; i++) week.push({ blank: true });

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(year, month, day);
      const leaves = byDate?.[dateStr] || [];
      const isToday = dateObj.getTime() === today.getTime();
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      
      // Determine status class for the day
      let statusClass = '';
      if (leaves.length > 0) {
        const hasApproved = leaves.some(l => l.status === 'Approved');
        const hasPending = leaves.some(l => l.status === 'Pending');
        const hasRejected = leaves.some(l => l.status === 'Rejected');
        if (hasApproved) statusClass = 'hlc-approved';
        else if (hasPending) statusClass = 'hlc-pending';
        else if (hasRejected) statusClass = 'hlc-rejected';
      }

      week.push({
        date: dateStr,
        day,
        isToday,
        isWeekend,
        leaves,
        statusClass
      });

      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }

    // Trailing blanks
    while (week.length > 0 && week.length < 7) week.push({ blank: true });
    if (week.length === 7) weeks.push(week);

    return weeks;
  }, [currentMonth, byDate]);

  function openDetail(dateStr) {
    const leaves = byDate?.[dateStr] || [];
    if (leaves.length > 0) {
      setSelectedDate(dateStr);
      setDetailLeave(leaves[0]); // Show first leave, user can cycle if multiple
    }
  }

  function closeDetail() {
    setSelectedDate(null);
    setDetailLeave(null);
  }

  // Format status for display
  const statusColors = {
    Approved: 'ok',
    Pending: 'warn',
    Rejected: 'bad',
    Cancelled: 'muted'
  };

  if (loading) return <div className="ws-page"><h1>{title || 'Leave Calendar'}</h1><Spinner /></div>;

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>{title || 'Leave Calendar'}</h1>
        {scopeNote && <span className="ws-scope">{scopeNote}</span>}
      </div>

      <Card title={monthNames[currentMonth.getMonth()] + ' ' + currentMonth.getFullYear()} sub={scopeNote}>
        <div className="hr-leave-calendar-toolbar">
          <button className="ws-btn sm" onClick={prevMonth} aria-label="Previous month">← Prev</button>
          <button className="ws-btn sm" onClick={todayMonth} aria-label="Current month">Today</button>
          <button className="ws-btn sm" onClick={nextMonth} aria-label="Next month">Next →</button>
          <span className="hr-leave-calendar-month">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
        </div>

        <div className="hr-leave-calendar-legend">
          <span className="hlc-li"><span className="hr-leave-calendar-dot" style={{ background: 'var(--teal-tint)' }}></span> Approved</span>
          <span className="hlc-li"><span className="hr-leave-calendar-dot" style={{ background: 'var(--amber-tint)' }}></span> Pending</span>
          <span className="hlc-li"><span className="hr-leave-calendar-dot" style={{ background: 'var(--red-tint)' }}></span> Rejected</span>
          <span className="hlc-li"><span className="hr-leave-calendar-swatch" style={{ background: 'var(--blue-tint)', border: '1px solid var(--border)' }}></span> Holiday</span>
          <span className="hlc-li"><span className="hr-leave-calendar-swatch" style={{ background: 'var(--teal)', border: '2px solid var(--teal)' }}></span> Today</span>
        </div>

        <div className="hr-leave-calendar-weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}
        </div>

        <div className="hr-leave-calendar-grid">
          {calendarGrid.flatMap((week) =>
            week.map((cell) => (
              <div
                key={cell.date || 'blank'}
                className={`hr-leave-calendar-day ${cell.blank ? 'hlc-blank' : ''} ${cell.isWeekend ? 'hlc-weekend' : ''} ${cell.isToday ? 'hlc-today' : ''} ${cell.statusClass}`}
                onClick={() => !cell.blank && cell.leaves.length > 0 && openDetail(cell.date)}
                style={{ cursor: cell.blank || cell.leaves.length === 0 ? 'default' : 'pointer' }}
                aria-label={cell.date ? `${cell.day} ${monthNames[currentMonth.getMonth()]}, ${cell.leaves.length} leave${cell.leaves.length === 1 ? '' : 's'}` : ''}
              >
                {!cell.blank && <span className="hlc-num">{cell.day}</span>}
                {cell.leaves.length > 0 && (
                  <div className="hr-leave-calendar-flags">
                    {cell.leaves.slice(0, 3).map((l) => (
                      <span key={l._id} className={`hr-leave-calendar-flag hlc-f-${l.status.toLowerCase()}`}>
                        {l.type.split(' ')[0]}
                      </span>
                    ))}
                    {cell.leaves.length > 3 && (
                      <span className="hr-leave-calendar-flag">+{cell.leaves.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Detail Modal */}
      {detailLeave && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Leave Details</h3>
              <button className="modal-close" onClick={closeDetail}>×</button>
            </div>
            <div className="modal-body hr-leave-calendar-modalbody">
              <dl className="hr-leave-calendar-detail">
                <dt>Employee</dt>
                <dd>{personName(detailLeave.employee)} {detailLeave.employee?.employeeId ? `(${detailLeave.employee.employeeId})` : ''}</dd>
                <dt>Type</dt>
                <dd>{detailLeave.type}</dd>
                <dt>From</dt>
                <dd>{fmt(detailLeave.from)}</dd>
                <dt>To</dt>
                <dd>{fmt(detailLeave.to)}</dd>
                <dt>Days</dt>
                <dd>{detailLeave.days} {detailLeave.halfDay ? '(half day)' : ''}</dd>
                <dt>Status</dt>
                <dd><StatusPill value={detailLeave.status} /></dd>
                {detailLeave.reason && (
                  <>
                    <dt>Reason</dt>
                    <dd>{detailLeave.reason}</dd>
                  </>
                )}
              </dl>
              <div className="ws-modal-actions">
                <button className="ws-btn" onClick={closeDetail}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}