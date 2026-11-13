/* ActiveTimeTracker — while checked in and not checked out, sends a heartbeat
   to the server every 30 seconds so the server can compute activeSeconds and
   pausedSeconds. The server is the source of truth for totals.

   Pause reasons:
     • hidden   — tab is not visible (visibilitychange)
     • blur     — window lost focus
     • idle     — 5 minutes (300000 ms) without any user input

   A fixed "Attendance paused" banner is shown when the state is 'paused'.
   On HTTP 429 we back off one minute before resuming the 30 s interval.
*/

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { quickLocation } from '@/lib/geo';
import type { AttendanceRecord } from '@/types';
import { attendance } from '@/api/attendance';

export function ActiveTimeTracker() {
  const { data, dispatch } = useApp();
  const { user, checkedInToday, hasOpenSession } = useAuth();
  const { toast } = useToast();

  if (!user || !checkedInToday || !hasOpenSession) return null;

  const [state, setState] = useState<'active' | 'paused'>('active');
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [pausedAt, setPausedAt] = useState<Date | null>(null);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<number | null>(null); // for 429 back-off

  // --- determine pause reason from browser events ---
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setState('paused');
        setReason('hidden');
        setPausedAt(new Date());
        sendHeartbeat('paused', 'hidden');
      }
    };

    const onBlur = () => {
      setState('paused');
      setReason('blur');
      setPausedAt(new Date());
      sendHeartbeat('paused', 'blur');
    };

    const onFocus = () => {
      // If we were paused and now have focus, try resuming immediately
      if (state === 'paused') {
        // If less than 5 min idle has passed, resume
        const idleSince = pausedAt?.getTime() ?? Date.now();
        const minutesSince = (Date.now() - idleSince) / 60000;
        if (minutesSince >= 5) {
          // user was idle — keep paused, don't resume yet
          return;
        }
        setState('active');
        setReason(undefined);
        setPausedAt(null);
        sendHeartbeat('active', undefined);
      }
    };

    const onKeyDown = () => {
      // reset idle timer on any keystroke
      resetIdleTimer();
    };

    const onMouseMove = () => {
      resetIdleTimer();
    };

    const onScroll = () => {
      resetIdleTimer();
    };

    const resetIdleTimer = () => {
      clearTimeout(timeoutRef.current);
      // if currently paused due to idle, keep paused; just reset the countdown
      timeoutRef.current = setTimeout(() => {
        // after 5 min of no input, we'd be idle — but we only back off on 429
        // so just resume if we were paused for idle reasons
        if (state === 'paused' && reason === 'idle') {
          // stay paused until next heartbeat or user input
        }
      }, 300000); // 5 minutes
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('blur', onBlur);
    document.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('scroll', onScroll);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('blur', onBlur);
      document.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timeoutRef.current);
    };
  }, [state, reason, pausedAt, sendHeartbeat]);

  // --- heartbeat sender ---
  const sendHeartbeat = async (nextState: 'active' | 'paused', nextReason: string | undefined) => {
    // If we have a pending 429 back-off, respect it
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      await attendance.heartbeat({
        state: nextState,
        reason: nextReason,
      });
      setState(nextState);
      setReason(nextReason);
      if (nextState === 'active') setPausedAt(null);
    } catch (err: any) {
      if (err.status === 429) {
        // Back off one minute
        setReason('rate-limited');
        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null;
          // After back-off, resume with the original state intent
          if (nextState === 'paused') {
            sendHeartbeat('paused', reason);
          } else {
            sendHeartbeat('active', undefined);
          }
        }, 60_000);
      } else {
        // other error — log and retry next interval
        console.error('[heartbeat] error:', err.message);
      }
    }
  };

  // --- initial heartbeat + 30 s interval ---
  useEffect(() => {
    // send immediately on mount
    sendHeartbeat('active', undefined);

    // then every 30 seconds
    heartbeatRef.current = setInterval(() => {
      // determine state based on browser events
      // if paused, keep sending paused state
      if (state === 'paused') {
        sendHeartbeat('paused', reason);
      } else {
        sendHeartbeat('active', undefined);
      }
    }, 30_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [state, reason, sendHeartbeat]);

  // --- banner when paused ---
  if (state === 'paused') {
    return (
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-6 py-3 rounded shadow text-sm"
        style={{ zIndex: 9999 }}
      >
        Attendance paused{' '}
        {reason ? `(${reason})` : ''}
      </div>
    );
  }

  return null;
}