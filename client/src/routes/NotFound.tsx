/* ============================================================
   NotFound — reached only for paths the route table does not own.
   It renders inside the shell, so the sidebar stays available.
   ============================================================ */
import { Link, useLocation } from 'react-router-dom';
import { EmptyState } from '@/components/ui/primitives';

export function NotFound() {
  const { pathname } = useLocation();

  return (
    <section className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
      <EmptyState
        icon="search"
        title="That page does not exist"
        sub={`Nothing is routed to ${pathname}. Use the sidebar, or jump back to your dashboard below.`}
        action={
          <Link className="btn btn-primary" to="/">
            Back to Dashboard
          </Link>
        }
      />
    </section>
  );
}
