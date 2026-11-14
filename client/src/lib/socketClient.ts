/* Socket.IO Client — real-time synchronization for HRM dashboards.
 *
 * Connects to the Socket.IO server, authenticates with the JWT access token,
 * and listens for role-based events. When an event is received, it dispatches
 * a store action to refresh the affected data.
 *
 * Socket events are notifications only — the client re-fetches data from the
 * API to get the authoritative state.
 */

import { io, type Socket } from 'socket.io-client';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    __HRM_REFRESH_CALLBACKS__?: {
      attendance?: () => void;
      leave?: () => void;
      employees?: () => void;
      payroll?: () => void;
      tasks?: () => void;
    };
  }
}

let socket: Socket | null = null;
let listeners: Set<() => void> = new Set();

/** Initialize the Socket.IO connection. Call once from AppShell. */
export function initSocket(): void {
  if (socket) return;

  const token = getAccessToken();
  if (!token) return;

  const url = import.meta.env.VITE_API_URL || '';

  socket = io(url, {
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket.IO] Connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket.IO] Connection error:', err.message);
  });

  /* Generic event handler — dispatch store refresh for affected collections. */
  socket.on('attendance.check_in', (data) => {
    console.log('[Socket.IO] attendance.check_in:', data);
    refreshAttendance();
  });

  socket.on('attendance.check_out', (data) => {
    console.log('[Socket.IO] attendance.check_out:', data);
    refreshAttendance();
  });

  socket.on('attendance.heartbeat', (data) => {
    console.log('[Socket.IO] attendance.heartbeat:', data);
    refreshAttendance();
  });

  socket.on('attendance.pause', (data) => {
    console.log('[Socket.IO] attendance.pause:', data);
    refreshAttendance();
  });

  socket.on('leave.decision', (data) => {
    console.log('[Socket.IO] leave.decision:', data);
    refreshLeave();
  });

  socket.on('employee.created', (data) => {
    console.log('[Socket.IO] employee.created:', data);
    refreshEmployees();
  });
}

/** Get the access token from the session. */
function getAccessToken(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const session = window.sessionStorage.getItem('cyethackHRM.session');
    if (!session) return null;
    const parsed = JSON.parse(session);
    return parsed.accessToken || null;
  } catch {
    return null;
  }
}

/** Close the Socket.IO connection. */
export function closeSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  listeners.clear();
}

/** Get the Socket.IO instance (for emitting join events, etc.). */
export function getSocket(): Socket | null {
  return socket;
}

/** Register a listener for custom socket events. */
export function onSocketEvent(event: string, handler: (data: any) => void): () => void {
  if (!socket) return () => {};
  socket.on(event, handler);
  return () => {
    socket?.off(event, handler);
  };
}

function refreshAttendance() {
  try {
    const { dispatch } = useApp();
    // We can't call hooks outside components, so we use a global callback
    const cb = window.__HRM_REFRESH_CALLBACKS__?.attendance;
    if (cb) cb();
  } catch {
    /* ignore */
  }
}

function refreshLeave() {
  try {
    const cb = window.__HRM_REFRESH_CALLBACKS__?.leave;
    if (cb) cb();
  } catch {
    /* ignore */
  }
}

function refreshEmployees() {
  try {
    const cb = window.__HRM_REFRESH_CALLBACKS__?.employees;
    if (cb) cb();
  } catch {
    /* ignore */
  }
}

/** React hook to use Socket.IO in components. */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { dispatch, refetchKeys } = useApp();
  const { user, fetchAttendanceState } = useAuth();

  // Initialize socket on mount
  useEffect(() => {
    if (!user || socketRef.current) return;
    initSocket();
    socketRef.current = getSocket();

    return () => {
      // Don't close socket on unmount — it's shared across components
      socketRef.current = null;
    };
  }, [user]);

  // Register refresh callbacks globally so socket events can trigger them
  useEffect(() => {
    if (!window.__HRM_REFRESH_CALLBACKS__) {
      window.__HRM_REFRESH_CALLBACKS__ = {};
    }

    // Attendance: re-fetch from API
    window.__HRM_REFRESH_CALLBACKS__.attendance = async () => {
      try {
        await fetchAttendanceState();
        // Re-fetch attendance collection from server
        await refetchKeys(['attendance']);
      } catch {
        /* ignore — best effort refresh */
      }
    };

    // Leave: re-fetch from API
    window.__HRM_REFRESH_CALLBACKS__.leave = async () => {
      try {
        await refetchKeys(['leaves']);
      } catch {
        /* ignore */
      }
    };

    // Employees: re-fetch from API
    window.__HRM_REFRESH_CALLBACKS__.employees = async () => {
      try {
        await refetchKeys(['employees']);
      } catch {
        /* ignore */
      }
    };

    // Payroll: re-fetch from API
    window.__HRM_REFRESH_CALLBACKS__.payroll = async () => {
      try {
        await refetchKeys(['payroll']);
      } catch {
        /* ignore */
      }
    };

    // Tasks: re-fetch from API
    window.__HRM_REFRESH_CALLBACKS__.tasks = async () => {
      try {
        await refetchKeys(['teamTasks']);
      } catch {
        /* ignore */
      }
    };
  }, [dispatch, refetchKeys, fetchAttendanceState]);

  return { socket: socketRef.current, isConnected: socketRef?.current?.connected || false };
}

/** Join an employee room to track that employee's updates. */
export function joinEmployeeRoom(employeeId: string): void {
  if (!socket) return;
  socket.emit('join:employee', employeeId);
}

/** Leave an employee room. */
export function leaveEmployeeRoom(employeeId: string): void {
  if (!socket) return;
  socket.off(`employee:${employeeId}`);
}