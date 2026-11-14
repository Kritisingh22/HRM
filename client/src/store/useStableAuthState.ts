/* ============================================================
   useStableAuthState — stabilizes the auth-derived state
   that's used as a dependency in callbacks across components
   (CheckInCard, ActiveTimer, AttendancePage).

   Problem: fetchAttendanceState depends on [user], so every time
   the user changes (boot/login), the callback is recreated,
   causing infinite re-render loops (React error #300).

   Solution: keep a stable reference that only changes when the
   truly important fields (role, nav, permissions) change,
   not on every tiny user property fluctuation.
================================================================ */

import { useContext, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/store/AppContext';
import { safeUserJson } from '@/utils/user';

/**
 * Returns a stable object with the auth values that components
 * need as callbacks deps. The returned object's reference only
 * changes when role/nav/permissions actually change, not on every
   user property flicker.
 */
export function useStableAuthState() {
  const ctx = useAuth();
  const { user, status, activity, login, logout } = ctx;

  /* --- stable derived values (only change on real role/nav shift) --- */
  const role = user?.role;
  const canManage = role ? ctx.canManagePeople(role) : false;
  const canSeeSalary = role ? ctx.canSeeSalary(role) : false;

  /* --- the attendance gate state comes from the store, not recomputed --- */
  const checkedInToday = ctx.checkedInToday;
  const hasOpenSession = ctx.hasOpenSession;

  return {
    user,
    status,
    role,
    canManage,
    canSeeSalary,
    checkedInToday,
    hasOpenSession,
    activity,
    login,
    logout,
  };
}