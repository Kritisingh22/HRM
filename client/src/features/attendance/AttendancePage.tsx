/* ============================================================
   Attendance — mandatory check-in, active-time tracking and register.

   Self view (all roles): check-in gate (handled by AppShell), active
   time timer, check-in/check-out card, personal history.

   HR/Manager view: team attendance dashboard with filters + CSV export.

   API sessions hit the real attendance endpoints; demo sessions show
   the existing read-only register derived from the roster.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { isApiSession } from '@/api/client';
import { useStableAuthState } from '@/store/useStableAuthState';
import { CheckInCard } from '@/components/attendance/CheckInCard';
import { ActiveTimer } from '@/components/attendance/ActiveTimer';
import { AttendanceHistory } from '@/components/attendance/AttendanceHistory';
import { AttendanceDashboard } from '@/components/attendance/AttendanceDashboard';
import { AttendanceHeartbeat } from '@/components/attendance/AttendanceHeartbeat';
import { AttendancePageDemo } from './AttendancePageDemo';

export function AttendancePage() {
  const { data } = useApp();
  const { user, canManage, checkedInToday, hasOpenSession } = useStableAuthState();
  const api = isApiSession();
  const myId = user?.employeeId ?? '';
  const isSelf = user?.portal === 'employee';

  const [tab, setTab] = useState<'self' | 'history' | 'team'>('self');

  const tabs = api
    ? (canManage
        ? [
            { key: 'self', label: 'My Attendance' },
            { key: 'history', label: 'History' },
            { key: 'team', label: 'Team Dashboard' },
          ]
        : [
            { key: 'self', label: 'My Attendance' },
            { key: 'history', label: 'History' },
          ])
    : [{ key: 'self', label: 'Attendance' }];

  /* Heartbeat + pause overlay: runs whenever checked in today. */
  return (
    <div className="grid">
      <AttendanceHeartbeat
        checkedInToday={checkedInToday}
        hasOpenSession={hasOpenSession}
      />

      {api ? (
        <>
          <section className="card span12">
            <div className="card-head">
              <div>
                <h2>{isSelf ? 'My Attendance' : 'Team Attendance'}</h2>
                <div className="sub">
                  Active-time tracking runs only while this tab is visible
                  and focused. Minimising or switching tabs pauses the timer.
                </div>
              </div>
              <ActiveTimer />
            </div>

            {tabs.length > 1 ? (
              <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as any)} />
            ) : null}

            {tab === 'self' ? (
              <>
                <CheckInCard />
                <ActiveTimer />
              </>
            ) : tab === 'history' ? (
              <AttendanceHistory />
            ) : (
              <AttendanceDashboard />
            )}
          </section>
        </>
      ) : (
        <AttendancePageDemo />
      )}
    </div>
  );
}
