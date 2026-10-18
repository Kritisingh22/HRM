/* ============================================================
   Projects — delivery board, task assignment and work tracking.

   HR/Admin see everything, managers see projects their team is on,
   employees get "My Projects" / "My Tasks" with self-service
   status updates on their own tasks.
   ============================================================ */
import { useMemo, useState, type ReactNode } from 'react';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { EmpCell, InlineBar, Pill, Progress, StatRow, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { deptName, empName, teamIds } from '@/lib/lookups';
import { moneyCompact } from '@/lib/format';
import { dateRange, niceDate, todayISO } from '@/lib/date';
import type { Project, Task } from '@/types';
import { TASK_STATUSES } from '@/types';

const PRIORITIES: Array<Project['priority']> = ['Low', 'Medium', 'High', 'Critical'];

/** The three boards this screen can show, reshaped per portal. */
type ProjectTab = 'projects' | 'tasks' | 'tracking';

export function ProjectsPage() {
  const { data, dispatch, audit, notify } = useApp();
  const { user, canManage, canSeeSalary } = useAuth();
  const { toast } = useToast();
  const myId = user?.employeeId ?? '';
  const isSelf = user?.portal === 'employee';

  const [tab, setTab] = useState<ProjectTab>('projects');
  const [projectFilter, setProjectFilter] = useState('all');

  /* -------- scope -------- */
  const scopeIds = useMemo(() => {
    if (isSelf) return new Set([myId]);
    if (user?.portal === 'manager' && myId) return teamIds(data.employees, myId);
    return null;
  }, [isSelf, user?.portal, myId, data.employees]);

  const projects = useMemo(() => {
    if (!scopeIds) return data.projects;
    return data.projects.filter((p) => p.manager && scopeIds.has(p.manager) || p.members.some((m) => scopeIds.has(m)));
  }, [data.projects, scopeIds]);

  const tasks = useMemo(() => {
    let list = data.tasks;
    if (scopeIds) list = list.filter((t) => scopeIds.has(t.assignee));
    if (projectFilter !== 'all') list = list.filter((t) => t.projectId === projectFilter);
    return list;
  }, [data.tasks, scopeIds, projectFilter]);

  const projectTitle = (id: string) => data.projects.find((p) => p.id === id)?.name ?? id;

  /* ---------------- projects ---------------- */
  const projectColumns = [
    { header: 'Project', render: (p: Project) => <><b>{p.name}</b><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{p.client}</span></> },
    { header: 'Department', render: (p: Project) => deptName(data.departments, p.dept) },
    { header: 'Lead', render: (p: Project) => empName(data.employees, p.manager) },
    { header: 'Timeline', render: (p: Project) => <span className="num">{dateRange(p.start, p.end)}</span> },
    { header: 'Priority', render: (p: Project) => <Pill status={p.priority} /> },
    { header: 'Progress', render: (p: Project) => <InlineBar value={p.progress} /> },
    { header: 'Team', render: (p: Project) => <span className="num">{p.members.length + 1}</span>, num: true },
    { header: 'Status', render: (p: Project) => <Pill status={p.status} /> },
    ...(canSeeSalary ? [{ header: 'Budget', render: (p: Project) => <span className="num">{p.budget}</span> }] : []),
  ];

  const projectForm: FieldDef[] = [
    { key: 'name', label: 'Project name', required: true },
    { key: 'client', label: 'Client', required: true },
    { key: 'dept', label: 'Department', type: 'select', options: data.departments.map((d) => ({ value: d.id, label: d.name })) },
    { key: 'manager', label: 'Project lead', type: 'select', options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'start', label: 'Start date', type: 'date', required: true },
    { key: 'end', label: 'Target date', type: 'date', required: true },
    { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES.map((p) => ({ value: p, label: p })) },
    { key: 'status', label: 'Status', type: 'select', options: ['Planning', 'Not Started', 'Active', 'On Hold', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s })) },
    { key: 'progress', label: 'Progress %', type: 'number' },
    { key: 'budget', label: 'Budget', placeholder: '₹12.0L' },
    { key: 'description', label: 'Description', type: 'textarea', half: true },
  ];

  const createProject = (values: Record<string, string>) => {
    const id = `PRJ-${String(data.projects.length + 1).padStart(2, '0')}-${Date.now() % 1000}`;
    dispatch({
      type: 'add',
      collection: 'projects',
      item: {
        id,
        name: values.name,
        client: values.client,
        dept: values.dept,
        manager: values.manager,
        start: values.start,
        end: values.end,
        budget: values.budget || '—',
        priority: (values.priority as Project['priority']) || 'Medium',
        status: (values.status as Project['status']) || 'Planning',
        progress: Number(values.progress || 0),
        members: [],
        description: values.description,
      } satisfies Project,
    });
    audit('Project created', `${values.name} (${id})`);
    toast('Project created.', 'success');
  };

  const updateProject = (row: Project, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'projects',
      id: row.id,
      patch: {
        name: values.name,
        client: values.client,
        dept: values.dept,
        manager: values.manager,
        start: values.start,
        end: values.end,
        budget: values.budget,
        priority: values.priority,
        status: values.status,
        progress: Number(values.progress || 0),
        description: values.description,
      },
    });
    audit('Project updated', row.id);
    toast('Project updated.', 'success');
  };

  const projectMembers = (p: Project) =>
    [p.manager, ...p.members]
      .filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
      .map((id) => {
        const e = data.employees.find((x) => x.id === id);
        return e ? `${e.name} (${e.designation})` : id;
      })
      .join(' · ');

  /* ---------------- tasks ---------------- */
  const taskColumns = [
    { header: 'Task', render: (t: Task) => <><b>{t.title}</b><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{projectTitle(t.projectId)}</span></> },
    { header: 'Assignee', render: (t: Task) => <EmpCell name={empName(data.employees, t.assignee)} sub={data.employees.find((e) => e.id === t.assignee)?.designation} seed={t.assignee} /> },
    { header: 'Priority', render: (t: Task) => <Pill status={t.priority} /> },
    { header: 'Due', render: (t: Task) => <span className="num">{niceDate(t.due)}</span> },
    { header: 'Status', render: (t: Task) => <Pill status={t.status} /> },
    { header: 'Progress', render: (t: Task) => <InlineBar value={t.progress} /> },
    { header: 'Est / actual', render: (t: Task) => <span className="num">{t.est}h / {t.actual}h</span> },
  ];

  const taskForm: FieldDef[] = [
    { key: 'title', label: 'Task title', required: true },
    { key: 'projectId', label: 'Project', type: 'select', required: true, options: data.projects.map((p) => ({ value: p.id, label: p.name })) },
    { key: 'assignee', label: 'Assignee', type: 'select', required: true, options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES.map((p) => ({ value: p, label: p })) },
    { key: 'start', label: 'Start date', type: 'date' },
    { key: 'due', label: 'Due date', type: 'date', required: true },
    { key: 'est', label: 'Estimated hours', type: 'number' },
    { key: 'actual', label: 'Actual hours', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES.map((s) => ({ value: s, label: s })) },
    { key: 'progress', label: 'Progress %', type: 'number' },
  ];

  const createTask = (values: Record<string, string>) => {
    const id = `TSK-${String(data.tasks.length + 1).padStart(2, '0')}-${Date.now() % 1000}`;
    dispatch({
      type: 'add',
      collection: 'tasks',
      item: {
        id,
        title: values.title,
        projectId: values.projectId,
        assignee: values.assignee,
        assignedBy: myId,
        priority: (values.priority as Task['priority']) || 'Medium',
        start: values.start,
        due: values.due,
        status: (values.status as Task['status']) || 'To Do',
        progress: Number(values.progress || 0),
        est: Number(values.est || 0),
        actual: Number(values.actual || 0),
      } satisfies Task,
    });
    audit('Task created', `${values.title} → ${empName(data.employees, values.assignee)}`);
    notify(`New task assigned: ${values.title}`);
    toast('Task assigned.', 'success');
  };

  const updateTask = (row: Task, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'tasks',
      id: row.id,
      patch: {
        title: values.title,
        projectId: values.projectId,
        assignee: values.assignee,
        priority: values.priority,
        start: values.start,
        due: values.due,
        status: values.status,
        progress: Number(values.progress || 0),
        est: Number(values.est || 0),
        actual: Number(values.actual || 0),
      },
    });
    audit('Task updated', row.id);
    toast('Task updated.', 'success');
  };

  const setTaskStatus = (t: Task, status: Task['status']) => {
    const patch: Partial<Task> = { status };
    if (status === 'Completed') patch.progress = 100;
    if (status === 'In Progress' && t.progress === 0) patch.progress = 10;
    dispatch({ type: 'update', collection: 'tasks', id: t.id, patch });
    audit('Task status', `${t.title} → ${status}`);
    toast(`“${t.title}” → ${status}.`, 'success');
  };

  /* Nudge the owner of an open task — sent through the same notification
     store as every other event, and recorded in the audit log. */
  const remind = (t: Task) => {
    const who = empName(data.employees, t.assignee);
    const late = t.status === 'Overdue' || t.due < todayISO();
    notify(`Reminder to ${who}: “${t.title}” ${late ? `is overdue (due ${niceDate(t.due)})` : `is due ${niceDate(t.due)}`}`);
    audit('Task reminder sent', `${t.id} · ${who}`);
    toast(`Reminder sent to ${who}.`, 'success');
  };

  /* ---------------- work tracking ---------------- */
  const trackingRows = useMemo(() => {
    const people = scopeIds ? data.employees.filter((e) => scopeIds.has(e.id)) : data.employees;
    return people
      .map((e) => {
        const mine = tasks.filter((t) => t.assignee === e.id);
        const done = mine.filter((t) => t.status === 'Completed').length;
        const overdue = mine.filter((t) => t.status === 'Overdue' || (t.status !== 'Completed' && t.due < todayISO())).length;
        const est = mine.reduce((s, t) => s + t.est, 0);
        const actual = mine.reduce((s, t) => s + t.actual, 0);
        const avg = mine.length ? Math.round(mine.reduce((s, t) => s + t.progress, 0) / mine.length) : 0;
        return { employee: e, total: mine.length, done, overdue, est, actual, avg };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [data.employees, tasks, scopeIds]);

  const openTasks = tasks.filter((t) => t.status !== 'Completed').length;
  const overdueTasks = tasks.filter((t) => t.status === 'Overdue' || (t.status !== 'Completed' && t.due < todayISO())).length;
  const avgProgress = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;
  const totalBudget = projects.reduce((s, p) => {
    const n = Number(p.budget.replace(/[^0-9.]/g, ''));
    return s + (p.budget.includes('Cr') ? n * 1e7 : p.budget.includes('L') ? n * 1e5 : n);
  }, 0);

  const tabs: Array<{ key: 'projects' | 'tasks' | 'tracking'; label: string }> = isSelf
    ? [
        { key: 'projects', label: `My Projects (${projects.length})` },
        { key: 'tasks', label: `My Tasks (${tasks.length})` },
      ]
    : [
        { key: 'projects', label: `Projects (${projects.length})` },
        { key: 'tasks', label: `Tasks (${tasks.length})` },
        { key: 'tracking', label: 'Work Tracking' },
      ];

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{isSelf ? 'My Projects' : 'Projects & Work'}</h2>
            <div className="sub">
              {isSelf
                ? 'Projects you are part of and the tasks assigned to you'
                : 'Delivery portfolio, task allocation and effort tracking'}
            </div>
          </div>
          <div className="tools">
            <span className="chip">{openTasks} open tasks</span>
            {overdueTasks ? <span className="chip" style={{ color: 'var(--red)' }}>{overdueTasks} overdue</span> : null}
          </div>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as ProjectTab)} />

        <div className="toolbar" style={{ marginTop: 14 }}>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project filter">
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="chip">Avg progress {avgProgress}%</span>
          {canSeeSalary && !isSelf ? <span className="chip">Portfolio {moneyCompact(totalBudget)}</span> : null}
        </div>

        {tab === 'projects' ? (
          <ResourceView
            rows={projects}
            rowId={(p) => p.id}
            columns={projectColumns}
            search={(p) => `${p.name} ${p.client} ${empName(data.employees, p.manager)}`}
            filters={[
              {
                key: 'status',
                label: 'All statuses',
                options: ['Planning', 'Not Started', 'Active', 'On Hold', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s })),
                match: (p, v) => p.status === v,
              },
              {
                key: 'priority',
                label: 'All priorities',
                options: PRIORITIES.map((s) => ({ value: s, label: s })),
                match: (p, v) => p.priority === v,
              },
            ]}
            summary={[
              { k: 'Projects', v: projects.length },
              { k: 'Active', v: projects.filter((p) => p.status === 'Active').length },
              { k: 'Planning', v: projects.filter((p) => p.status === 'Planning').length },
              { k: 'Completed', v: projects.filter((p) => p.status === 'Completed').length },
            ]}
            detail={(p) => [
              'Project',
              ['Name', p.name],
              ['Client', p.client],
              ['Department', deptName(data.departments, p.dept)],
              ['Lead', empName(data.employees, p.manager)],
              ['Timeline', `${niceDate(p.start)} – ${niceDate(p.end)}`],
              ['Priority', <Pill status={p.priority} key="p" />],
              ['Status', <Pill status={p.status} key="s" />],
              ['Budget', canSeeSalary ? p.budget : '—'],
              'Team',
              ['Members', projectMembers(p)],
              ...(p.description ? ([['Description', p.description]] as Array<[string, ReactNode]>) : []),
            ]}
            form={canManage ? projectForm : undefined}
            onCreate={canManage ? createProject : undefined}
            onUpdate={canManage ? updateProject : undefined}
            createLabel="Add project"
            searchPlaceholder="Search projects, clients…"
            emptyIcon="folderKanban"
          />
        ) : null}

        {tab === 'tasks' ? (
          <ResourceView
            rows={tasks}
            rowId={(t) => t.id}
            columns={taskColumns}
            search={(t) => `${t.title} ${projectTitle(t.projectId)} ${empName(data.employees, t.assignee)}`}
            filters={[
              {
                key: 'status',
                label: 'All statuses',
                options: TASK_STATUSES.map((s) => ({ value: s, label: s })),
                match: (t, v) => t.status === v,
              },
              {
                key: 'priority',
                label: 'All priorities',
                options: PRIORITIES.map((s) => ({ value: s, label: s })),
                match: (t, v) => t.priority === v,
              },
            ]}
            actions={(t) => {
              const acts: Array<{ key: string; label: string; variant?: 'danger' | 'ghost' }> = [];
              if (t.status === 'To Do') acts.push({ key: 'start', label: 'Start' });
              if (t.status !== 'Completed') acts.push({ key: 'complete', label: 'Complete' });
              if (!isSelf && t.status !== 'Completed') acts.push({ key: 'remind', label: 'Remind', variant: 'ghost' });
              return acts;
            }}
            onAction={(key, t) => {
              if (key === 'remind') {
                remind(t);
                return;
              }
              setTaskStatus(t, key === 'start' ? 'In Progress' : 'Completed');
            }}
            detail={(t) => [
              'Task',
              ['Title', t.title],
              ['Project', projectTitle(t.projectId)],
              ['Assignee', empName(data.employees, t.assignee)],
              ['Assigned by', empName(data.employees, t.assignedBy)],
              ['Priority', <Pill status={t.priority} key="p" />],
              ['Status', <Pill status={t.status} key="s" />],
              'Effort',
              ['Start', niceDate(t.start)],
              ['Due', niceDate(t.due)],
              ['Estimated', `${t.est} h`],
              ['Actual', `${t.actual} h`],
            ]}
            form={isSelf ? undefined : taskForm}
            onCreate={isSelf ? undefined : createTask}
            onUpdate={isSelf ? undefined : updateTask}
            createLabel="Assign task"
            searchPlaceholder="Search tasks…"
            emptyIcon="clipboardList"
          />
        ) : null}

        {tab === 'tracking' && !isSelf ? (
          <>
            <StatRow
              items={[
                { k: 'People tracking', v: trackingRows.length },
                { k: 'Total tasks', v: tasks.length },
                { k: 'Completed', v: tasks.filter((t) => t.status === 'Completed').length },
                { k: 'Overdue', v: overdueTasks },
                { k: 'Avg progress', v: `${avgProgress}%` },
              ]}
            />
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Tasks</th>
                    <th>Completed</th>
                    <th>Overdue</th>
                    <th>Est. hours</th>
                    <th>Actual hours</th>
                    <th>Avg progress</th>
                  </tr>
                </thead>
                <tbody>
                  {trackingRows.map((r) => (
                    <tr key={r.employee.id}>
                      <td>
                        <EmpCell name={r.employee.name} sub={r.employee.designation} seed={r.employee.id} />
                      </td>
                      <td className="num">{r.total}</td>
                      <td className="num">{r.done}</td>
                      <td className="num" style={{ color: r.overdue ? 'var(--red)' : undefined }}>
                        {r.overdue}
                      </td>
                      <td className="num">{r.est}h</td>
                      <td className="num">{r.actual}h</td>
                      <td style={{ minWidth: 160 }}>
                        <Progress value={r.avg} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-foot">
              Estimated vs actual hours come straight from the task board — a quick view of where effort is landing.
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
