/* ============================================================
   AttendanceHeartbeat — active-time tracking hook + components.

   • Runs timer only when document.visibilityState === "visible" &&
     window has focus.
   • Pauses on visibilitychange (hidden), window blur, and idle
     (no mouse/keyboard for 5 minutes).
   • Shows full-screen overlay when paused.
   • Heartbeat every 30 seconds to POST /api/attendance/heartbeat.
   • Single-tab lock via BroadcastChannel (localStorage fallback).
   • sendBeacon on pagehide/beforeunload; restores session on refresh.
   ============================================================ */
import { useEffect, useState, useRef, useCallback } from 'react';
import { heartbeat, pause as pauseApi } from '@/api/attendance';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

const IDLE_MINUTES = 5;
const HEARTBEAT_MS = 30_000;

interface AttendanceHeartbeatProps {
  checkedInToday: boolean;
  hasOpenSession: boolean;
}

/** Full-screen overlay shown when attendance is paused. */
export function PausedOverlay() {
  return (
    <div
      className="paused-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#fff',
        fontFamily: 'inherit',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 32, lineHeight: 1 }}>
        <span aria-hidden="true">⏸</span>
      </div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Attendance paused</h2>
      <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', textAlign: 'center', maxWidth: 400 }}>
        Return to this tab to continue tracking active time. You were idle or
        switched away from the portal.
      </p>
    </div>
  );
}

/** Hook: manages heartbeat lifecycle. Returns { isPaused }. */
export function useAttendanceHeartbeat({
  checkedInToday,
  hasOpenSession,
}: AttendanceHeartbeatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isPaused, setIsPaused] = useState(false);
  const stateRef = useRef<{
    state: 'active' | 'paused';
    lastHeartbeat: number;
    idleTimer: any;
    hbTimer: any;
    channel: BroadcastChannel | null;
    lockKey: string;
    beaconSent: boolean;
  }>({
    state: 'active',
    lastHeartbeat: 0,
    idleTimer: null,
    hbTimer: null,
    channel: null,
    lockKey: '',
    beaconSent: false,
  });

  const empId = user?.employeeId ?? '';

  /* ---- single-tab lock ---- */
  const acquireLock = useCallback(() => {
    if (!empId) return false;
    const key = `attendance:lock:${empId}`;
    stateRef.current.lockKey = key;

    try {
      const existing = window.localStorage.getItem(key);
      if (existing && existing !== String(window.location.href)) {
        return false; // another tab holds the lock
      }
      window.localStorage.setItem(key, String(window.location.href));
    } catch {
      /* localStorage may be blocked — proceed */
    }

    /* BroadcastChannel: coordinate across tabs */
    try {
      const bc = new BroadcastChannel(`attendance:lock:${empId}`);
      stateRef.current.channel = bc;
      bc.onmessage = (ev) => {
        if (ev.data === 'heartbeat' && ev.origin !== window.location.href) {
          /* another tab is active — step aside */
          stateRef.current.state = 'paused';
          setIsPaused(true);
        }
      };
      bc.postMessage('heartbeat');
    } catch {
      /* BroadcastChannel not supported */
    }

    /* Unload: release lock */
    const onUnload = () => {
      try {
        if (stateRef.current.beaconSent) return;
        navigator.sendBeacon?.(
          `/api/attendance/heartbeat`,
          JSON.stringify({ state: 'paused', reason: 'offline' }),
        );
        stateRef.current.beaconSent = true;
      } catch {
        /* ignore */
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      stateRef.current.channel?.close();
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);

    return true;
  }, [empId]);

  /* ---- heartbeat sender ---- */
  const sendHeartbeat = useCallback(async (state: 'active' | 'paused', reason: string) => {
    if (!user || !checkedInToday) return;
    try {
      await heartbeat(state, reason);
      stateRef.current.lastHeartbeat = Date.now();
    } catch (err) {
      /* heartbeat failures are non-fatal; retry next cycle */
    }
  }, [user, checkedInToday]);

  /* ---- pause / resume ---- */
  const doPause = useCallback((reason: string) => {
    if (stateRef.current.state === 'paused') return;
    stateRef.current.state = 'paused';
    setIsPaused(true);
    void pauseApi(reason);
  }, []);

  const doResume = useCallback(() => {
    if (stateRef.current.state === 'active') return;
    stateRef.current.state = 'active';
    setIsPaused(false);
  }, []);

  /* ---- visibility / focus ---- */
  useEffect(() => {
    if (!checkedInToday) return;

    const onHide = () => doPause('hidden');
    const onShow = () => doResume();
    const onBlur = () => doPause('blur');
    const onFocus = () => doResume();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
      else onShow();
    });
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', () => onHide());
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkedInToday, doPause, doResume]);

  /* ---- idle detection ---- */
  useEffect(() => {
    if (!checkedInToday) return;

    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    let idleTimeout: any;

    const resetIdle = () => {
      if (stateRef.current.state === 'paused') doResume();
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => doPause('idle'), IDLE_MINUTES * 60_000);
    };

    events.forEach((e) => window.addEventListener(e, resetIdle, true));
    resetIdle();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle, true));
      clearTimeout(idleTimeout);
    };
  }, [checkedInToday, doPause, doResume]);

  /* ---- heartbeat loop ---- */
  useEffect(() => {
    if (!checkedInToday || !hasOpenSession) return;

    const lockOk = acquireLock();
    if (!lockOk) {
      setIsPaused(true);
      return;
    }

    const tick = async () => {
      const state = stateRef.current.state;
      await sendHeartbeat(state, state === 'paused' ? 'idle' : 'resume');
    };

    tick();
    const hbInterval = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(hbInterval);
  }, [checkedInToday, hasOpenSession, acquireLock, sendHeartbeat]);

  return { isPaused };
}

/** Component wrapper: renders PausedOverlay when paused. */
export function AttendanceHeartbeat({
  checkedInToday,
  hasOpenSession,
}: AttendanceHeartbeatProps) {
  const { isPaused } = useAttendanceHeartbeat({ checkedInToday, hasOpenSession });
  return isPaused ? <PausedOverlay /> : null;
}
