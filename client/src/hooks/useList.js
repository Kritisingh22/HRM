/* Fetches a list endpoint and exposes { rows, loading, error, reload }. The page
 * calls reload() after any create/update/delete so the table always reflects the
 * ACTUAL database state returned by the backend (never optimistic local edits).
 * Auto-detects the array in a { count, <key>:[…] } envelope. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

const arrayIn = (data) => (Array.isArray(data) ? data : Object.values(data || {}).find((v) => Array.isArray(v)) || []);

export function useList(endpoint) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback((alive = () => true) => {
    setLoading(true); setError(null);
    return api.get(endpoint)
      .then((data) => { if (alive()) setRows(arrayIn(data)); })
      .catch((e) => { if (alive()) { setError(e); setRows([]); } })
      .finally(() => { if (alive()) setLoading(false); });
  }, [endpoint]);

  useEffect(() => {
    let live = true;
    setRows(null);
    fetchOnce(() => live);
    return () => { live = false; };
  }, [fetchOnce]);

  const reload = useCallback(() => fetchOnce(), [fetchOnce]);
  return { rows, loading, error, reload };
}
