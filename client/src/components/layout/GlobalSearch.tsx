/* ============================================================
   GlobalSearch — the top-bar search across people and records,
   with Ctrl/Cmd+K focus and grouped results.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { PAGE_PATH } from '@/data/nav';
import { niceDate } from '@/lib/date';
import { teamIds } from '@/lib/lookups';

interface Hit {
  group: string;
  icon: string;
  label: string;
  meta: string;
  page: string;
}

export function GlobalSearch() {
  const { data } = useApp();
  const { canVisitPage, canManage, user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* Managers search within their reporting line — same scope as the pages. */
  const teamSet = useMemo(
    () => (user?.portal === 'manager' && user.employeeId ? teamIds(data.employees, user.employeeId) : null),
    [user?.portal, user?.employeeId, data.employees],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (ev.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onClick = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Hit[] = [];
    data.employees.forEach((e) => {
      if (teamSet && !teamSet.has(e.id)) return;
      const hay = `${e.name} ${e.id} ${e.designation} ${e.email}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({ group: 'People', icon: 'user', label: e.name, meta: e.id, page: 'Employees' });
      }
    });
    data.leaveRequests.forEach((r) => {
      if (teamSet && !teamSet.has(r.employeeId)) return;
      const emp = data.employees.find((e) => e.id === r.employeeId);
      const hay = `${r.id} ${emp?.name ?? ''} ${r.type} ${r.reason}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          group: 'Leave',
          icon: 'calendar',
          label: `${emp?.name ?? r.employeeId} — ${r.type}`,
          meta: r.id,
          page: 'Leave Approvals',
        });
      }
    });
    data.tickets
      .filter((t) => canManage || t.by === user?.employeeId)
      .forEach((t) => {
        if (`${t.subject} ${t.id} ${t.category}`.toLowerCase().includes(q)) {
          out.push({ group: 'Helpdesk', icon: 'lifeBuoy', label: t.subject, meta: t.id, page: 'Helpdesk' });
        }
      });
    data.documents
      .filter((d) => canManage || d.owner === null || d.owner === user?.employeeId)
      .forEach((d) => {
        if (`${d.name} ${d.type}`.toLowerCase().includes(q)) {
          out.push({ group: 'Documents', icon: 'fileText', label: d.name, meta: d.type, page: 'Documents' });
        }
      });
    data.announcements.forEach((a) => {
      if (`${a.title} ${a.body}`.toLowerCase().includes(q)) {
        out.push({
          group: 'Notice Board',
          icon: 'megaphone',
          label: a.title,
          meta: niceDate(a.date),
          page: 'Notice Board',
        });
      }
    });
    return out
      .filter((hit) => canVisitPage(hit.page))
      .slice(0, 12);
  }, [query, data, canVisitPage, teamSet, canManage, user?.employeeId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Hit[]>();
    hits.forEach((hit) => {
      const list = map.get(hit.group) ?? [];
      list.push(hit);
      map.set(hit.group, list);
    });
    return Array.from(map.entries());
  }, [hits]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQuery('');
    navigate(PAGE_PATH[hit.page] ?? '/', { state: { query: hit.label } });
  };

  return (
    <div className="search" ref={wrapRef}>
      <Icon name="search" size={16} />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search people, leave, documents…"
        aria-label="Search the portal"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && query.trim().length >= 2 ? (
        <div className="search-results">
          {grouped.length === 0 ? (
            <div className="search-group">No matches for “{query.trim()}”</div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group}>
                <div className="search-group">{group}</div>
                {items.map((hit, i) => (
                  <button key={`${group}-${i}`} className="search-hit" onClick={() => go(hit)} type="button">
                    <Icon name={hit.icon} size={15} />
                    {hit.label}
                    <span className="meta">{hit.meta}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
