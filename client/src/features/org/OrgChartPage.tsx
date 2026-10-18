/* ============================================================
   Org Chart — the reporting tree built from `manager` links,
   with collapsible branches, department focus and search.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, StatRow } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { deptName } from '@/lib/lookups';
import type { Employee } from '@/types';

function TreeNode({ node, byManager, depth }: { node: Employee; byManager: Map<string, Employee[]>; depth: number }) {
  const reports = byManager.get(node.id) ?? [];
  const total = reports.reduce((sum, r) => sum + countTree(r.id, byManager), 0) + reports.length;

  const card = (
    <span className="org-node">
      <span className="av" style={{ background: 'var(--teal)' }} aria-hidden="true">
        {node.name
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <span>
        <b>{node.name}</b>
        <span>
          {node.designation} · {node.id}
        </span>
      </span>
      {reports.length ? <span className="cnt">{total} reports</span> : null}
    </span>
  );

  if (!reports.length) return card;

  return (
    <details open={depth < 2}>
      <summary>{card}</summary>
      <ul>
        {reports.map((r) => (
          <li key={r.id}>
            <TreeNode node={r} byManager={byManager} depth={depth + 1} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function countTree(id: string, byManager: Map<string, Employee[]>): number {
  const reports = byManager.get(id) ?? [];
  return reports.reduce((sum, r) => sum + 1 + countTree(r.id, byManager), 0);
}

export function OrgChartPage() {
  const { data } = useApp();
  const [dept, setDept] = useState('all');
  const [query, setQuery] = useState('');
  const [seniorOnly, setSeniorOnly] = useState(false);

  const employees = useMemo(() => {
    let list = data.employees.filter((e) => e.status !== 'Resigned' && e.status !== 'Terminated');
    if (dept !== 'all') list = list.filter((e) => e.dept === dept);
    if (seniorOnly) {
      const managerIds = new Set(list.map((e) => e.manager).filter((m): m is string => !!m));
      list = list.filter((e) => managerIds.has(e.id) || !e.manager);
    }
    return list;
  }, [data.employees, dept, seniorOnly]);

  /* search keeps matching nodes plus their management chain */
  const visibleIds = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    const byId = new Map(employees.map((e) => [e.id, e]));
    const keep = new Set<string>();
    employees.forEach((e) => {
      if (`${e.name} ${e.id} ${e.designation}`.toLowerCase().includes(q)) {
        let cursor: Employee | undefined = e;
        while (cursor) {
          keep.add(cursor.id);
          cursor = cursor.manager ? byId.get(cursor.manager) : undefined;
        }
      }
    });
    return keep;
  }, [employees, query]);

  const shown = useMemo(
    () => (visibleIds ? employees.filter((e) => visibleIds.has(e.id)) : employees),
    [employees, visibleIds],
  );

  const byManager = useMemo(() => {
    const map = new Map<string, Employee[]>();
    const ids = new Set(shown.map((e) => e.id));
    shown.forEach((e) => {
      if (e.manager && ids.has(e.manager)) {
        const list = map.get(e.manager) ?? [];
        list.push(e);
        map.set(e.manager, list);
      }
    });
    map.forEach((list) => list.sort((a, b) => (a.name < b.name ? -1 : 1)));
    return map;
  }, [shown]);

  const roots = useMemo(() => {
    const ids = new Set(shown.map((e) => e.id));
    return shown
      .filter((e) => !e.manager || !ids.has(e.manager))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  }, [shown]);

  const managers = shown.filter((e) => byManager.get(e.id)?.length);
  const avgSpan = managers.length
    ? Math.round((managers.reduce((s, m) => s + (byManager.get(m.id)?.length ?? 0), 0) / managers.length) * 10) / 10
    : 0;

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Org Chart</h2>
            <div className="sub">Reporting lines from the live roster — expand any branch to drill in</div>
          </div>
          <div className="tools">
            <span className="chip">{shown.length} people</span>
            <span className="chip">Avg span {avgSpan}</span>
          </div>
        </div>

        <div className="toolbar no-print">
          <label className="toolbar-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              placeholder="Search a person or role…"
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the org chart"
            />
          </label>
          <div className="pills">
            <button className={`pill${dept === 'all' ? ' active' : ''}`} onClick={() => setDept('all')} type="button">
              All
            </button>
            {data.departments.map((d) => (
              <button
                key={d.id}
                className={`pill${dept === d.id ? ' active' : ''}`}
                onClick={() => setDept(dept === d.id ? 'all' : d.id)}
                type="button"
              >
                {d.name}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <label className="check-row" style={{ margin: 0 }} htmlFor="org-senior">
            <input
              id="org-senior"
              type="checkbox"
              checked={seniorOnly}
              onChange={(e) => setSeniorOnly(e.target.checked)}
            />
            Leaders only
          </label>
        </div>

        <StatRow
          items={[
            { k: 'People', v: shown.length },
            { k: 'Departments', v: new Set(shown.map((e) => e.dept)).size },
            { k: 'People managers', v: managers.length },
            { k: 'Top-level nodes', v: roots.length },
            { k: 'Avg span of control', v: avgSpan },
          ]}
        />

        {roots.length === 0 ? (
          <EmptyState icon="sitemap" title="No matches" sub="Try a different search or clear the department filter." />
        ) : (
          <div className="org">
            <ul style={{ paddingLeft: 0, borderLeft: 'none' }}>
              {roots.map((root) => (
                <li key={root.id}>
                  <TreeNode node={root} byManager={byManager} depth={0} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card-foot">
          {dept !== 'all' ? `Focused on ${deptName(data.departments, dept)} · ` : ''}
          reporting lines derive from each employee's manager field, so the chart can never drift from the roster.
        </div>
      </section>
    </div>
  );
}
