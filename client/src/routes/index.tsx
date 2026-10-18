/* ============================================================
   Router — the route table and its two guards.

   `/login` stands alone; every other route is nested inside
   <RequireAuth> → <AppShell>, so the sidebar, topbar and
   floating actions wrap each page. <PageGuard> re-checks the
   role allow-list from `nav.ts`, so a hand-typed URL cannot
   bypass a role restriction.

   The table itself is generated from PAGE_PATH — the same
   single source of truth the sidebar and topbar read.
   ============================================================ */
import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { PAGE_PATH } from '@/data/nav';
import { LoginPage } from '@/features/auth/Login';
import { DashboardPage } from '@/features/dashboard/Dashboard';
import { EmployeesPage } from '@/features/employees/EmployeesPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { LeavePage } from '@/features/leave/LeavePage';
import { PayrollPage } from '@/features/payroll/PayrollPage';
import { RecruitmentPage } from '@/features/recruitment/RecruitmentPage';
import { PerformancePage } from '@/features/performance/PerformancePage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { NoticeBoardPage } from '@/features/notice/NoticeBoardPage';
import { HelpdeskPage } from '@/features/helpdesk/HelpdeskPage';
import { LeaveApprovalsPage } from '@/features/leave-approvals/LeaveApprovalsPage';
import { OrgChartPage } from '@/features/org/OrgChartPage';
import { OffboardingPage } from '@/features/offboarding/OffboardingPage';
import { TransferTicketsPage } from '@/features/transfers/TransferTicketsPage';
import { HrTransferTicketsPage } from '@/features/transfers/HrTransferTicketsPage';
import { EmployeeTransferStatusPage } from '@/features/transfers/EmployeeTransferStatusPage';
import { TransferTicketDetailPage } from '@/features/transfers/TransferTicketDetailPage';
import { NotFound } from '@/routes/NotFound';
import logoMark from '../../img/cyethack-logo.svg';

/* Page name → element; keys mirror PAGE_PATH exactly. */
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
};

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
              element={<PageGuard page={page}>{PAGES[page]}</PageGuard>}
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
