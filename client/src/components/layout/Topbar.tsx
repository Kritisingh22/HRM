/* ============================================================
   Topbar — page title, global search, quick actions (HR only),
   notifications, theme toggle and the account menu.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/context/ThemeContext';
import { ActiveTimer } from '@/components/attendance/ActiveTimer';
import { DAYS_LONG, dateFromMs, durationFromMs, niceDate, timeFromMs, toISO, todayISO } from '@/lib/date';
import { PAGE_PATH } from '@/data/nav';
import type { LoginSessionRecord } from '@/types';

interface TopbarProps {
  page: string;
  onOpenDrawer: () => void;
}

export function Topbar({ page, onOpenDrawer }: TopbarProps) {
  const { user, logout, canManage, activity } = useAuth();
  const { data, dispatch } = useApp();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<'quick' | 'bell' | 'session' | 'avatar' | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      if (!barRef.current?.contains(ev.target as Node)) setMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (ev.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  /* The running working-time counter ticks once a second. The anchor
     is the server clock from the activity payload, so the number
     never depends on when the tab was (re)opened. */
  const sessionActive = activity?.session.status === 'Active';
  useEffect(() => {
    if (!sessionActive) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionActive]);

  const unread = data.notifications.filter((n) => !n.read).length;

  const workingMs = activity
    ? sessionActive
      ? Math.max(0, nowTick + activity.skewMs - activity.session.loginAt)
      : activity.session.durationMs ?? 0
    : 0;

  /* Live session first, then the account's recent history. */
  const sessionRows = activity
    ? [activity.session, ...activity.recent.filter((r) => r.id !== activity.session.id)].slice(0, 5)
    : [];

  const today = useMemo(() => {
    const d = new Date();
    return `${DAYS_LONG[d.getDay()].slice(0, 3)}, ${niceDate(todayISO())}`;
  }, []);

  const quickActions = [
    { label: 'Add Employee', icon: 'userPlus', page: 'Employees' },
    { label: 'Mark Attendance', icon: 'userCheck', page: 'Attendance' },
    { label: 'Approve Leaves', icon: 'clipboardCheck', page: 'Leave Approvals' },
    { label: 'Run Payroll', icon: 'banknote', page: 'Payroll' },
    { label: 'Post a Job', icon: 'briefcase', page: 'Recruitment' },
    { label: 'Generate Report', icon: 'barChart', page: 'Reports' },
  ];

  const doLogout = async () => {
    setConfirmLogout(false);
    /* The backend closes the login-session row with server time —
       confirm with the recorded logout time and final duration. */
    const closed = await logout();
    toast(
      closed?.logoutAt
        ? `Signed out ${dateFromMs(closed.logoutAt)} · ${timeFromMs(closed.logoutAt)} — session of ${durationFromMs(closed.durationMs ?? 0)} recorded.`
        : 'You have been signed out.',
      'success',
    );
    navigate('/login');
  };

  if (!user) return null;

  return (
    <header className="topbar" ref={barRef}>
      <button className="icon-btn hamburger" onClick={onOpenDrawer} aria-label="Open navigation" type="button">
        <Icon name="menu" size={20} />
      </button>

      <div className="page-head">
        <h1>{page}</h1>
        <div className="date">{today}</div>
      </div>

      <span className="spacer" />

      <GlobalSearch />

      <div className="topbar-controls">
        {canManage ? (
          <div className="menu-anchor">
            <button
              className="icon-btn"
              aria-label="Quick actions"
              aria-expanded={menu === 'quick'}
              onClick={() => setMenu(menu === 'quick' ? null : 'quick')}
              type="button"
            >
              <Icon name="plus" size={18} />
            </button>
            {menu === 'quick' ? (
              <div className="menu" style={{ width: 240 }}>
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    className="menu-item"
                    onClick={() => {
                      setMenu(null);
                      navigate(PAGE_PATH[action.page] ?? '/');
                    }}
                    type="button"
                  >
                    <Icon name={action.icon} size={16} />
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle light / dark theme" type="button">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>

        <div className="menu-anchor">
          <button
            className="icon-btn"
            aria-label={`Notifications (${unread} unread)`}
            aria-expanded={menu === 'bell'}
            onClick={() => setMenu(menu === 'bell' ? null : 'bell')}
            type="button"
          >
            <Icon name="bell" size={18} />
            {unread > 0 ? <span className="badge-dot">{unread}</span> : null}
          </button>
          {menu === 'bell' ? (
            <div className="menu" style={{ width: 320 }}>
              <div className="panel-head">Notifications</div>
              {data.notifications.slice(0, 6).map((n) => (
                <div key={n.id} className={`notif${n.read ? ' read' : ''}`}>
                  <span className="dot" />
                  <span>
                    <p>{n.text}</p>
                    <time>{n.time}</time>
                  </span>
                </div>
              ))}
              {data.notifications.length === 0 ? <div className="empty">You are all caught up.</div> : null}
              <div className="panel-foot">
                <button
                  className="link"
                  onClick={() => {
                    dispatch({
                      type: 'set',
                      patch: { notifications: data.notifications.map((n) => ({ ...n, read: true })) },
                    });
                    setMenu('bell');
                  }}
                  type="button"
                >
                  Mark all as read
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {activity ? (
          <div className="menu-anchor">
            <button
              className="chip session-chip"
              aria-label="Login session details"
              aria-expanded={menu === 'session'}
              title={
                sessionActive
                  ? `Online since ${timeFromMs(activity.session.loginAt)} — click for session details`
                  : 'Click for session details'
              }
              onClick={() => setMenu(menu === 'session' ? null : 'session')}
              type="button"
            >
              <span className={`sdot${sessionActive ? '' : ' off'}`} />
              <span className="session-chip-label">{sessionActive ? 'Online' : 'Ended'}</span>
              {durationFromMs(workingMs)}
            </button>
            {menu === 'session' ? (
              <div className="menu" style={{ width: 320 }}>
                <div className="panel-head">
                  <span>Session</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>
                    Ref {activity.session.id}
                  </span>
                </div>
                {sessionRows.map((r) => (
                  <div key={r.id} className={`notif${r.status === 'Logged Out' ? ' read' : ''}`}>
                    <span className="dot" />
                    <span>
                      <p>{sessionRowTitle(r, activity.session.id, workingMs)}</p>
                      <time>{sessionRowTime(r)}</time>
                    </span>
                  </div>
                ))}
                <div className="panel-foot">
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Login and logout times are recorded by the server.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <ActiveTimer />

        <div className="menu-anchor">
          <button
            className="icon-btn"
            aria-label="Account menu"
            aria-expanded={menu === 'avatar'}
            onClick={() => setMenu(menu === 'avatar' ? null : 'avatar')}
            type="button"
            style={{ width: 'auto', borderRadius: 999 }}
          >
            <Avatar name={user.name} seed={user.email} size={32} />
          </button>
          {menu === 'avatar' ? (
            <div className="menu">
              <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span>{user.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>{user.email}</span>
              </div>
              <button
                className="menu-item"
                onClick={() => {
                  setMenu(null);
                  navigate(PAGE_PATH['My Profile'] ?? '/profile');
                }}
                type="button"
              >
                <Icon name="user" size={16} /> My Profile
              </button>
              {user.portal === 'hr' ? (
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(null);
                    navigate(PAGE_PATH.Settings);
                  }}
                  type="button"
                >
                  <Icon name="settings" size={16} /> Settings
                </button>
              ) : null}
              <button
                className="menu-item"
                onClick={() => {
                  setMenu(null);
                  setConfirmLogout(true);
                }}
                type="button"
              >
                <Icon name="logout" size={16} /> Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {confirmLogout ? (
        <div className="logout-scrim">
          <div className="logout-modal" role="dialog" aria-modal="true" aria-label="Confirm sign out">
            <h2>Sign out of the portal?</h2>
            <p>You will need to sign in again to access the HR workspace on this device.</p>
            <div className="logout-actions">
              <button className="logout-cancel" onClick={() => setConfirmLogout(false)} type="button">
                Stay signed in
              </button>
              <button className="logout-confirm" onClick={doLogout} type="button">
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/* Session row title — the live row shows the running counter, closed
   rows show the final server-computed duration. */
function sessionRowTitle(r: LoginSessionRecord, liveId: string, workingMs: number): string {
  if (r.status === 'Active' && r.id === liveId) return `Online — working ${durationFromMs(workingMs)}`;
  if (r.status === 'Active') return 'Online';
  return `Logged out — worked ${durationFromMs(r.durationMs ?? 0)}`;
}

/* `16 Oct 2026 · 09:15 AM – 06:20 PM`, with both dates when a session
   crosses midnight. */
function sessionRowTime(r: LoginSessionRecord): string {
  const from = `${dateFromMs(r.loginAt)} · ${timeFromMs(r.loginAt)}`;
  if (r.logoutAt == null) return `Login ${from}`;
  const sameDay = toISO(new Date(r.loginAt)) === toISO(new Date(r.logoutAt));
  return sameDay
    ? `${from} – ${timeFromMs(r.logoutAt)}`
    : `${from} → ${dateFromMs(r.logoutAt)} ${timeFromMs(r.logoutAt)}`;
}

/* Re-exported so the shell can render its own notices through Modal. */
export { Modal as TopbarModal };
