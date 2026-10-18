/* ============================================================
   Route drill state — pages read `{ query }` / `{ dept }` from
   the navigation state (global search hits, dashboard donut
   slices) and show a dismissible filter note.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface DrillSeed {
  query?: string;
  dept?: string;
}

export function useDrill(): { query: string; dept: string; clear: () => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const [seed, setSeed] = useState<DrillSeed>(() => (location.state as DrillSeed | null) ?? {});

  useEffect(() => {
    if (location.state) setSeed(location.state as DrillSeed);
  }, [location.key, location.state]);

  const clear = () => {
    setSeed({});
    navigate(location.pathname, { replace: true });
  };

  return { query: (seed.query ?? '').trim(), dept: seed.dept ?? '', clear };
}
