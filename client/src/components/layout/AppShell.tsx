/* ============================================================
   AppShell — sidebar + topbar + scrolling content column.
   Owns the persisted rail state, the mobile drawer, the
   one-per-session welcome note and the floating actions.
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { FloatingActions } from '@/components/layout/FloatingActions';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { PATH_PAGE, pageLabel } from '@/data/nav';
import { AttendanceGate } from '@/components/attendance/AttendanceGate';
import { ActiveTimeTracker } from '@/components/attendance/ActiveTimeTracker';

const RAIL_KEY = 'cyethackHRM.rail';

/** Error boundary — if any route component throws (e.g. bad data shape),
    the shell, sidebar and topbar stay visible and the user sees a
    recoverable error instead of a blank page. Never silences auth errors. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] route component threw:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24 }}>
          <div className="card" style={{ maxWidth: 560, textAlign: 'center' }}>
            <div className="card-head">
              <h2>Something went wrong</h2>
              <div className="sub">A page component failed to render. Your session and navigation are unaffected.</div>
            </div>
            <div style={{ padding: 20, color: 'var(--text-2)', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.message}</div>
            <div className="card-foot" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => window.location.reload()} type="button">Reload page</button>
              <button className="btn btn-outline" onClick={() => window.location.href = '/'} type="button">Go to dashboard</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function initialRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

function WelcomeBar() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem('cyethackHRM.welcomed') === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !user) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.sessionStorage.setItem('cyethackHRM.welcomed', '1');
    } catch {
      /* ignore */
    }
  };

  const copy: Record<string, { title: string; bullets: string[] }> = {
    hr: {
      title: `Welcome back, ${user.name} — this is your HR command centre.`,
      bullets: [
        'Run payroll from Payroll → Processing, then issue payslips from the Payslips tab.',
        'Approve or reject leave from Leave Approvals; the calendar updates instantly.',
        'Filter Analytics by department and export any table to CSV with the button bottom-left.',
      ],
    },
    manager: {
      title: `Welcome back, ${user.name} — here is your team view.`,
      bullets: [
        'Employees shows only your team, with attendance and leave in one place.',
        'Leave Approvals lists every request waiting on your decision.',
        'Projects and Performance track delivery and reviews for your reports.',
      ],
    },
    employee: {
      title: `Welcome back, ${user.name}.`,
      bullets: [
        'Apply for leave from My Leave — pick a date on the calendar or use the button.',
        'My Attendance shows your month at a glance; attendance is read-only by design.',
        'My Payroll holds your payslips and salary structure.',
      ],
    },
  };
  const content = copy[user.portal] ?? copy.employee;

  return (
    <div className="welcome-bar">
      <span className="ic">
        <Icon name="sparkles" size={18} />
      </span>
      <div>
        <h3>{content.title}</h3>
        <ul>
          {content.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      <button className="icon-btn x" onClick={dismiss} aria-label="Dismiss welcome note" type="button">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const { user, status, checkedInToday, hasOpenSession, fetchAttendanceState } = useAuth();
  const contentRef = useRef<HTMLElement>(null);
  const [rail, setRail] = useState(initialRail);
  const [drawer, setDrawer] = useState(false);

  /* Ensure attendance state is loaded once the shell mounts. */
  useEffect(() => {
    if (user) void fetchAttendanceState();
  }, [user, fetchAttendanceState]);

  /* The topbar title follows the portal: a manager reads "My Team",
     an employee "My Attendance" — same table as the sidebar. */
  const pageName = PATH_PAGE[location.pathname] ?? 'Dashboard';
  const page = user ? pageLabel(user.portal, pageName) : pageName;

  useEffect(() => {
    document.body.classList.toggle('rail', rail);
    try {
      window.localStorage.setItem(RAIL_KEY, rail ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [rail]);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawer);
  }, [drawer]);

  useEffect(() => {
    setDrawer(false);
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Sidebar rail={rail} onToggleRail={() => setRail((r) => !r)} onNavigate={() => setDrawer(false)} />
      <div className="main">
        <Topbar page={page} onOpenDrawer={() => setDrawer(true)} />
        <main className="content" id="content" ref={contentRef} tabIndex={-1}>
          <WelcomeBar />
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </main>
      </div>
      {drawer ? <div className="mobile-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}
      <FloatingActions />

      {/* Mandatory check-in gate — blocks the portal until checked in today. */}
      {user && status === 'authenticated' && !checkedInToday ? (
        <AttendanceGate
          checkedInToday={checkedInToday}
          hasOpenSession={hasOpenSession}
          onCheckInComplete={() => void fetchAttendanceState()}
        />
      ) : null}
      {/* Active time tracker — sends heartbeats while checked in. */}
      {user && status === 'authenticated' && checkedInToday && hasOpenSession ? (
        <ActiveTimeTracker />
      ) : null}
    </div>
  );
}
