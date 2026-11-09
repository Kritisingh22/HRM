/* ============================================================
   Router — the route table and its two guards.

   `/login` stands alone; every other route is nested inside
   <RequireAuth> → <AppShell>, so the sidebar, topbar and
   floating actions wrap each page. <PageGuard> re-checks the
   role allow-list from `nav.ts`, so a hand-typed URL cannot
   bypass a role restriction.

   The table itself is generated from PAGE_PATH — the same
   single source of truth the sidebar and topbar read.

   Code splitting:
     • LoginPage is eager (it is the first paint).
     • Every authenticated route is React.lazy + Suspense so the
       597 KiB main bundle never has to parse code for pages the
       user never visits.
   ============================================================ */
import { Suspense, lazy, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { PAGE_PATH } from '@/data/nav';
import { LoginPage } from '@/features/auth/Login';
import { NotFound } from '@/routes/NotFound';
import logoMark from '../../img/cyethack-logo.svg';

/* ---------- session bootstrap splash ---------- */

function BootSplash() {
  return (
    <div className="boot-splash" role="status" aria-label="Restoring your session">
      <img src={logoMark} alt="" style={{ height: 42 }} />
      <span>Restoring your session…</span>
      <span className="pulse" aria-hidden="true" />
    </div>
  );
}

/* ---------- guards ---------- */

/** Guests are sent to the login gate; everyone waits out the boot check. */
function RequireAuth() {
  const { status, user } = useAuth();
  if (status === 'booting') return <BootSplash />;
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Minimal Suspense fallback — a tiny centered pulse so a lazy route
    swap never shows a blank hole while its chunk loads. */
function RouteSkeleton() {
  return (
    <div className="auth-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Loading…</span>
      <span className="pulse" aria-hidden="true" style={{ display: 'inline-block', width: 120, height: 14, background: 'var(--surface)', borderRadius: 6 }} />
    </div>
  );
}

/* ---------- lazy route components ---------- */

/* Login is imported eagerly above; everything below is lazy. */
const DashboardPage = lazy(() =>
  import('@/features/dashboard/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const EmployeesPage = lazy(() =>
  import('@/features/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
);
const AttendancePage = lazy(() =>
  import('@/features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })),
);
const LeavePage = lazy(() => import('@/features/leave/LeavePage').then((m) => ({ default: m.LeavePage })));
const PayrollPage = lazy(() => import('@/features/payroll/PayrollPage').then((m) => ({ default: m.PayrollPage })));
const RecruitmentPage = lazy(() =>
  import('@/features/recruitment/RecruitmentPage').then((m) => ({ default: m.RecruitmentPage })),
);
const PerformancePage = lazy(() =>
  import('@/features/performance/PerformancePage').then((m) => ({ default: m.PerformancePage })),
);
const ProjectsPage = lazy(() =>
  import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const DocumentsPage = lazy(() =>
  import('@/features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const NoticeBoardPage = lazy(() =>
  import('@/features/notice/NoticeBoardPage').then((m) => ({ default: m.NoticeBoardPage })),
);
const HelpdeskPage = lazy(() =>
  import('@/features/helpdesk/HelpdeskPage').then((m) => ({ default: m.HelpdeskPage })),
);
const LeaveApprovalsPage = lazy(() =>
  import('@/features/leave-approvals/LeaveApprovalsPage').then((m) => ({ default: m.LeaveApprovalsPage })),
);
const OrgChartPage = lazy(() => import('@/features/org/OrgChartPage').then((m) => ({ default: m.OrgChartPage })));
const OffboardingPage = lazy(() =>
  import('@/features/offboarding/OffboardingPage').then((m) => ({ default: m.OffboardingPage })),
);
const TransferTicketsPage = lazy(() =>
  import('@/features/transfers/TransferTicketsPage').then((m) => ({ default: m.TransferTicketsPage })),
);
const HrTransferTicketsPage = lazy(() =>
  import('@/features/transfers/HrTransferTicketsPage').then((m) => ({ default: m.HrTransferTicketsPage })),
);
const EmployeeTransferStatusPage = lazy(() =>
  import('@/features/transfers/EmployeeTransferStatusPage').then((m) => ({ default: m.EmployeeTransferStatusPage })),
);
const TransferTicketDetailPage = lazy(() =>
  import('@/features/transfers/TransferTicketDetailPage').then((m) => ({ default: m.TransferTicketDetailPage })),
);
const TeamTaskCalendarPage = lazy(() =>
  import('@/features/team-tasks/TeamTaskCalendarPage').then((m) => ({ default: m.TeamTaskCalendarPage })),
);
const TodoPage = lazy(() =>
  import('@/features/todo/TodoPage').then((m) => ({ default: m.TodoPage })),
);

/* Page name → lazy element; keys mirror PAGE_PATH exactly. */
const PAGES: Record<string, ReactNode> = {
  Dashboard: <DashboardPage />,
  Employees: <EmployeesPage />,
  Attendance: <AttendancePage />,
  Leave: <LeavePage />,
  Payroll: <PayrollPage />,
  Recruitment: <RecruitmentPage />,
  Performance: <PerformancePage />,
  Projects: <ProjectsPage />,
  Documents: <DocumentsPage />,
  Reports: <ReportsPage />,
  Analytics: <AnalyticsPage />,
  Settings: <SettingsPage />,
  'My Profile': <ProfilePage />,
  'Notice Board': <NoticeBoardPage />,
  Helpdesk: <HelpdeskPage />,
  'Leave Approvals': <LeaveApprovalsPage />,
  'Org Chart': <OrgChartPage />,
  Offboarding: <OffboardingPage />,
  'Transfer Tickets': <TransferTicketsPage />,
  'My Transfer Status': <EmployeeTransferStatusPage />,
  'Transfer Ticket Detail': <TransferTicketDetailPage />,
  'Team Task Calendar': <TeamTaskCalendarPage />,
  'My Tasks': <TodoPage />,
};

/* ---------- route table ---------- */

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {Object.entries(PAGE_PATH).map(([page, path]) => (
            <Route
              key={page}
              path={path}
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <PageGuard page={page}>{PAGES[page]}</PageGuard>
                </Suspense>
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

/** Role allow-list for one page — also blocks hand-typed URLs. */
function PageGuard({ page, children }: { page: string; children: ReactNode }) {
  const { canVisitPage } = useAuth();
  if (canVisitPage(page)) return <>{children}</>;

  return (
    <section className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
      <EmptyState
        icon="alertTriangle"
        title="This page is outside your workspace"
        sub={`${page} is not part of your role's portal. Head back to your dashboard, or sign in with a different demo account to explore it.`}
        action={
          <Link className="btn btn-primary" to="/">
            Back to Dashboard
          </Link>
        }
      />
    </section>
  );
}
