/* ============================================================
   ActiveTimer — live "Active time today" chip for the topbar.

   Fetches /api/attendance/me and formats activeSeconds / pausedSeconds.
   Refreshes every 30 seconds so the number stays current while the
   tab is active. Uses stable auth state to avoid re-render loops.
   ============================================================ */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useStableAuthState } from '@/store/useStableAuthState';
import { getMe } from '@/api/attendance';
import { useAuth } from '@/context/AuthContext';

function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export { formatSeconds };

export function ActiveTimer() {
  const { user, checkedInToday, hasOpenSession } = useStableAuthState();
  const { activity } = useAuth();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [checkedIn, setCheckedIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let timer: any;
    const load = async () => {
      try {
        const data = await getMe();
        if (!mounted) return;
        setCheckedIn(Boolean(data.checkedInToday));
        setActive(data.todayRow?.activeSeconds ?? 0);
        setPaused(data.todayRow?.pausedSeconds ?? 0);
        setStatus(data.todayRow?.status ?? '');
      } catch {
        /* silent — timer is best-effort */
      }
    };
    load();
    timer = setInterval(load, 30_000);
    return () => { mounted = false; clearInterval(timer); };
  }, [user]);

  if (!checkedIn) {
    return (
      <span className="chip" style={{ background: '#f3f4f6', color: 'var(--text-2)' }}>
        <Icon name="userCheck" size={12} style={{ marginRight: 6 }} /> Not checked in
      </span>
    );
  }

  return (
    <span className="chip" title={`Active: ${formatSeconds(active)} · Paused: ${formatSeconds(paused)} · Status: ${status}`}>
      <Icon name="clock" size={12} style={{ marginRight: 6 }} /> Active {formatSeconds(active)}
      {paused > 0 ? ` · paused ${formatSeconds(paused)}` : ''}
    </span>
  );
}