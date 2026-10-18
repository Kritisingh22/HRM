/* ============================================================
   Performance — KPI targets and review cycles for the team or
   the whole company, with progress updates from the table.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { EmpCell, InlineBar, Pill, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { deptName, empName, teamIds } from '@/lib/lookups';
import { clampPct } from '@/lib/format';
import { dateRange, niceDate } from '@/lib/date';
import type { Review, Target } from '@/types';

const RATINGS = ['Outstanding', 'Excellent', 'Good', 'Needs Improvement', 'Unsatisfactory'];

export function PerformancePage() {
  const { data, dispatch, audit, notify } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<'targets' | 'reviews'>('targets');
  const [progressOf, setProgressOf] = useState<Target | null>(null);
  const [progressValue, setProgressValue] = useState('0');

  const myId = user?.employeeId ?? '';

  /* -------- scope: a manager sees their reporting line -------- */
  const scopeIds = useMemo(() => {
    if (user?.portal === 'manager' && myId) return teamIds(data.employees, myId);
    return null; // null = everyone
  }, [data.employees, user?.portal, myId]);

  const inScope = (employeeId: string) => scopeIds === null || scopeIds.has(employeeId);

  const targets = useMemo(() => data.targets.filter((t) => inScope(t.employeeId)), [data.targets, scopeIds]);
  const reviews = useMemo(() => data.reviews.filter((r) => inScope(r.employeeId)), [data.reviews, scopeIds]);

  /* ---------------- targets ---------------- */
  const targetColumns = [
    { header: 'Employee', render: (t: Target) => <EmpCell name={empName(data.employees, t.employeeId)} sub={deptName(data.departments, t.dept)} seed={t.employeeId} /> },
    { header: 'Target', render: (t: Target) => <b>{t.name}</b> },
    { header: 'KPI', render: (t: Target) => t.kpi },
    {
      header: 'Progress',
      render: (t: Target) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 150 }}>
          <InlineBar value={t.target ? (t.achieved / t.target) * 100 : 0} />
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
            {t.achieved}/{t.target} {t.unit}
          </span>
        </span>
      ),
    },
    { header: 'Weightage', render: (t: Target) => <span className="num">{t.weightage}%</span>, num: true },
    { header: 'Period', render: (t: Target) => <span className="num">{dateRange(t.start, t.end)}</span> },
    { header: 'Status', render: (t: Target) => <Pill status={t.status} /> },
  ];

  const targetForm: FieldDef[] = [
    {
      key: 'employeeId',
      label: 'Employee',
      type: 'select',
      required: true,
      options: data.employees.map((e) => ({ value: e.id, label: `${e.name} (${deptName(data.departments, e.dept)})` })),
    },
    { key: 'name', label: 'Target name', required: true, placeholder: 'e.g. Vulnerabilities triaged' },
    { key: 'kpi', label: 'KPI', required: true, placeholder: 'e.g. Tickets closed' },
    { key: 'target', label: 'Target value', type: 'number', required: true },
    { key: 'achieved', label: 'Achieved so far', type: 'number' },
    { key: 'unit', label: 'Unit', placeholder: 'tickets / reports / %' },
    { key: 'weightage', label: 'Weightage %', type: 'number' },
    { key: 'start', label: 'Start date', type: 'date', required: true },
    { key: 'end', label: 'End date', type: 'date', required: true },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['In Progress', 'Achieved', 'Partially Achieved', 'Missed'].map((s) => ({ value: s, label: s })),
    },
  ];

  const createTarget = (values: Record<string, string>) => {
    const emp = data.employees.find((e) => e.id === values.employeeId);
    const id = `TGT-${String(data.targets.length + 1).padStart(2, '0')}-${Date.now() % 1000}`;
    dispatch({
      type: 'add',
      collection: 'targets',
      item: {
        id,
        employeeId: values.employeeId,
        dept: emp?.dept ?? 'DEP-02',
        name: values.name,
        kpi: values.kpi,
        target: Number(values.target || 0),
        achieved: Number(values.achieved || 0),
        unit: values.unit || '',
        start: values.start,
        end: values.end,
        weightage: Number(values.weightage || 0),
        status: values.status || 'In Progress',
      } satisfies Target,
    });
    audit('KPI target created', `${values.name} for ${emp?.name ?? values.employeeId}`);
    toast('KPI target created.', 'success');
  };

  const updateTarget = (row: Target, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'targets',
      id: row.id,
      patch: {
        employeeId: values.employeeId,
        name: values.name,
        kpi: values.kpi,
        target: Number(values.target || 0),
        achieved: Number(values.achieved || 0),
        unit: values.unit,
        weightage: Number(values.weightage || 0),
        start: values.start,
        end: values.end,
        status: values.status,
      },
    });
    audit('KPI target updated', row.id);
    toast('KPI target updated.', 'success');
  };

  const saveProgress = () => {
    if (!progressOf) return;
    const achieved = Number(progressValue || 0);
    const status =
      achieved >= progressOf.target ? 'Achieved' : achieved > 0 ? 'Partially Achieved' : 'In Progress';
    dispatch({ type: 'update', collection: 'targets', id: progressOf.id, patch: { achieved, status } });
    audit('KPI progress updated', `${progressOf.name}: ${achieved}/${progressOf.target}`);
    if (status === 'Achieved') notify(`${empName(data.employees, progressOf.employeeId)} achieved "${progressOf.name}"`);
    toast(`Progress saved — ${achieved}/${progressOf.target} ${progressOf.unit}.`, 'success');
    setProgressOf(null);
  };

  /* ---------------- reviews ---------------- */
  const reviewColumns = [
    { header: 'Employee', render: (r: Review) => <EmpCell name={empName(data.employees, r.employeeId)} sub={empName(data.employees, r.employeeId) && deptName(data.departments, data.employees.find((e) => e.id === r.employeeId)?.dept)} seed={r.employeeId} /> },
    { header: 'Cycle', render: (r: Review) => r.cycle },
    { header: 'Period', render: (r: Review) => r.period },
    {
      header: 'Score',
      render: (r: Review) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 130 }}>
          <InlineBar value={r.score} />
        </span>
      ),
    },
    { header: 'Rating', render: (r: Review) => <Pill status={r.rating} /> },
    { header: 'Reviewer', render: (r: Review) => empName(data.employees, r.manager) },
    { header: 'Date', render: (r: Review) => <span className="num">{niceDate(r.date)}</span> },
  ];

  const reviewForm: FieldDef[] = [
    { key: 'employeeId', label: 'Employee', type: 'select', required: true, options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'cycle', label: 'Cycle', type: 'select', options: ['Monthly', 'Quarterly', 'Half-yearly', 'Annual'].map((c) => ({ value: c, label: c })) },
    { key: 'period', label: 'Period label', required: true, placeholder: 'Q2 2026' },
    { key: 'score', label: 'Score (0–100)', type: 'number', required: true },
    { key: 'rating', label: 'Rating', type: 'select', options: RATINGS.map((r) => ({ value: r, label: r })) },
    { key: 'manager', label: 'Reviewer', type: 'select', options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'date', label: 'Review date', type: 'date' },
    { key: 'comments', label: 'Comments', type: 'textarea', half: true },
  ];

  const createReview = (values: Record<string, string>) => {
    const id = `REV-${String(data.reviews.length + 1).padStart(2, '0')}-${Date.now() % 1000}`;
    dispatch({
      type: 'add',
      collection: 'reviews',
      item: {
        id,
        employeeId: values.employeeId,
        cycle: values.cycle || 'Quarterly',
        period: values.period,
        score: Number(values.score || 0),
        rating: values.rating || 'Good',
        manager: values.manager,
        date: values.date,
        comments: values.comments,
      } satisfies Review,
    });
    audit('Review recorded', `${empName(data.employees, values.employeeId)} · ${values.period}`);
    toast('Review recorded.', 'success');
  };

  const updateReview = (row: Review, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'reviews',
      id: row.id,
      patch: {
        employeeId: values.employeeId,
        cycle: values.cycle,
        period: values.period,
        score: Number(values.score || 0),
        rating: values.rating,
        manager: values.manager,
        date: values.date,
        comments: values.comments,
      },
    });
    audit('Review updated', row.id);
    toast('Review updated.', 'success');
  };

  /* -------- summary -------- */
  const achieved = targets.filter((t) => t.status === 'Achieved').length;
  const avgScore = reviews.length ? Math.round(reviews.reduce((s, r) => s + r.score, 0) / reviews.length) : 0;

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Performance</h2>
            <div className="sub">
              {user?.portal === 'manager'
                ? 'KPI targets and review history for your reporting line'
                : 'Company-wide KPI targets, review cycles and ratings'}
            </div>
          </div>
          <div className="tools">
            <span className="chip">{targets.length} KPIs tracked</span>
            <span className="chip">Avg score {avgScore || '—'}</span>
          </div>
        </div>

        <Tabs
          tabs={[
            { key: 'targets', label: `Targets & KPIs (${targets.length})` },
            { key: 'reviews', label: `Reviews (${reviews.length})` },
          ]}
          active={tab}
          onChange={(k) => setTab(k as 'targets' | 'reviews')}
        />

        <div style={{ marginTop: 16 }}>
          {tab === 'targets' ? (
            <ResourceView
              rows={targets}
              rowId={(t) => t.id}
              columns={targetColumns}
              search={(t) => `${empName(data.employees, t.employeeId)} ${t.name} ${t.kpi}`}
              filters={[
                {
                  key: 'status',
                  label: 'All statuses',
                  options: ['In Progress', 'Achieved', 'Partially Achieved', 'Missed'].map((s) => ({ value: s, label: s })),
                  match: (t, v) => t.status === v,
                },
                {
                  key: 'dept',
                  label: 'All departments',
                  options: data.departments.map((d) => ({ value: d.id, label: d.name })),
                  match: (t, v) => t.dept === v,
                },
              ]}
              summary={[
                { k: 'KPIs', v: targets.length },
                { k: 'Achieved', v: achieved, s: 'full credit' },
                { k: 'In progress', v: targets.filter((t) => t.status === 'In Progress').length },
                {
                  k: 'Avg completion',
                  v: `${targets.length ? clampPct((targets.reduce((s, t) => s + (t.target ? t.achieved / t.target : 0), 0) / targets.length) * 100) : 0}%`,
                },
              ]}
              actions={(t) => [{ key: 'progress', label: 'Update' }]}
              onAction={(_, t) => {
                setProgressOf(t);
                setProgressValue(String(t.achieved));
              }}
              detail={(t) => [
                'KPI',
                ['Employee', empName(data.employees, t.employeeId)],
                ['Department', deptName(data.departments, t.dept)],
                ['Target', t.name],
                ['KPI', t.kpi],
                ['Target value', `${t.target} ${t.unit}`],
                ['Achieved', `${t.achieved} ${t.unit}`],
                ['Weightage', `${t.weightage}%`],
                ['Period', `${niceDate(t.start)} – ${niceDate(t.end)}`],
                ['Status', <Pill status={t.status} key="st" />],
              ]}
              form={targetForm}
              onCreate={createTarget}
              onUpdate={updateTarget}
              createLabel="Add KPI"
              searchPlaceholder="Search KPIs…"
              emptyIcon="award"
            />
          ) : null}

          {tab === 'reviews' ? (
            <ResourceView
              rows={reviews}
              rowId={(r) => r.id}
              columns={reviewColumns}
              search={(r) => `${empName(data.employees, r.employeeId)} ${r.period} ${r.rating}`}
              filters={[
                {
                  key: 'cycle',
                  label: 'All cycles',
                  options: ['Monthly', 'Quarterly', 'Half-yearly', 'Annual'].map((c) => ({ value: c, label: c })),
                  match: (r, v) => r.cycle === v,
                },
                {
                  key: 'rating',
                  label: 'All ratings',
                  options: RATINGS.map((s) => ({ value: s, label: s })),
                  match: (r, v) => r.rating === v,
                },
              ]}
              detail={(r) => [
                'Review',
                ['Employee', empName(data.employees, r.employeeId)],
                ['Cycle', r.cycle],
                ['Period', r.period],
                ['Score', `${r.score}/100`],
                ['Rating', <Pill status={r.rating} key="st" />],
                ['Reviewer', empName(data.employees, r.manager)],
                ['Date', niceDate(r.date)],
                ['Comments', r.comments],
              ]}
              form={reviewForm}
              onCreate={createReview}
              onUpdate={updateReview}
              createLabel="Record review"
              searchPlaceholder="Search reviews…"
              emptyIcon="clipboardCheck"
            />
          ) : null}
        </div>
      </section>

      {progressOf ? (
        <Modal
          title={`Update progress — ${progressOf.name}`}
          onClose={() => setProgressOf(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setProgressOf(null)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveProgress} type="button">
                Save progress
              </button>
            </>
          }
        >
          <div className="detail-grid" style={{ marginBottom: 16 }}>
            <dt>Employee</dt>
            <dd>{empName(data.employees, progressOf.employeeId)}</dd>
            <dt>KPI</dt>
            <dd>{progressOf.kpi}</dd>
            <dt>Target</dt>
            <dd className="num">
              {progressOf.target} {progressOf.unit}
            </dd>
          </div>
          <div className="field">
            <label htmlFor="kpi-achieved">Achieved so far ({progressOf.unit || 'units'})</label>
            <input id="kpi-achieved" type="number" value={progressValue} onChange={(e) => setProgressValue(e.target.value)} />
          </div>
          <InlineBar value={progressOf.target ? (Number(progressValue || 0) / progressOf.target) * 100 : 0} />
          <div className="info-note" style={{ marginTop: 12 }}>
            Status flips to Achieved automatically once the target value is reached.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
