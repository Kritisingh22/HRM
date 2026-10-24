/* ============================================================
   Team Task Calendar — calendar view for team tasks.
   
   Month, week, and agenda views with task management.
   ============================================================ */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Pill, StatRow, Tabs } from '@/components/ui/primitives';
import { EmpCell } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { filterDemoEmployees } from '@/lib/lookups';
import { dateRange, niceDate, todayISO, weekStartISO, addDays, daysInMonth, mondayOffset, pad, MONTHS, MONTHS_LONG, DAYS, parseISO, isWeekendISO } from '@/lib/date';
import { useDrill } from '@/lib/useDrill';
import type { TeamTask } from '@/types';

type CalView = 'month' | 'week' | 'agenda';
type TeamTab = 'all' | 'my' | 'overdue' | 'upcoming';

const TASK_STATUS_COLORS: Record<string, string> = {
  'To Do': '#64748B',
  'In Progress': '#3B82F6',
  'In Review': '#F59E0B',
  'Blocked': '#EF4444',
  'Completed': '#22C55E',
  'Cancelled': '#94A3B8',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Low': '#22C55E',
  'Medium': '#3B82F6',
  'High': '#F59E0B',
  'Urgent': '#F97316',
  'Critical': '#EF4444',
};

type CalendarItem =
  | { date: string; kind: 'task'; task: TeamTask }
  | { date: string; kind: 'holiday'; name: string };

export function TeamTaskCalendarPage() {
  const { data, dispatch, audit, notify } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { query: seedQuery, clear } = useDrill();
  const myId = user?.employeeId ?? '';

  const now = new Date();
  const today = todayISO();
  const [view, setView] = useState<CalView>('month');
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [tab, setTab] = useState<TeamTab>('all');
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<TeamTask | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamTask | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const filteredEmployees = filterDemoEmployees(data.employees);

  /* -------- scope -------- */
  const scopeIds = useMemo(() => {
    if (user?.portal === 'employee') return new Set([user?.employeeId ?? '']);
    if (user?.portal === 'manager' && user?.employeeId) {
      const ids = new Set([user.employeeId]);
      data.employees.forEach(e => {
        if (e.manager === user.employeeId) ids.add(e.id);
      });
      return ids;
    }
    return null; // HR/Admin see all
  }, [user?.portal, user?.employeeId, data.employees]);

  /* -------- tasks with scope -------- */
  const scopedTasks = useMemo(() => {
    let tasks = data.teamTasks.filter(t => !t.deletedAt);
    if (scopeIds) {
      tasks = tasks.filter(t => t.assignedTo.some(id => scopeIds.has(id)));
    }
    if (statusFilter !== 'all') tasks = tasks.filter(t => t.status === statusFilter);
    if (priorityFilter !== 'all') tasks = tasks.filter(t => t.priority === priorityFilter);
    if (assigneeFilter !== 'all') tasks = tasks.filter(t => t.assignedTo.some(id => id === assigneeFilter));
    if (teamFilter !== 'all') tasks = tasks.filter(t => t.team === teamFilter);
    return tasks;
  }, [data.teamTasks, scopeIds, statusFilter, priorityFilter, assigneeFilter, teamFilter]);

  /* -------- tab tasks -------- */
  const allTasks = useMemo(() => {
    let tasks = data.teamTasks.filter(t => !t.deletedAt);
    if (scopeIds) tasks = tasks.filter(t => t.assignedTo.some(id => scopeIds.has(t.assignedTo[0])));
    return tasks;
  }, [data.teamTasks, scopeIds]);

  const myTasks = useMemo(() => allTasks.filter(t => t.assignedTo.includes(myId)), [allTasks, myId]);
  const overdueTasks = useMemo(() => {
    const today = todayISO();
    return allTasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled' && t.dueDate < today);
  }, [allTasks]);
  const upcomingTasks = useMemo(() => {
    const today = todayISO();
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return allTasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled' && t.dueDate >= today && t.dueDate <= nextWeek);
  }, [allTasks]);

  const tasksByTab = {
    all: allTasks,
    my: myTasks,
    overdue: overdueTasks,
    upcoming: upcomingTasks,
  };

  /* -------- filter options -------- */
  const assigneeOptions = useMemo(() => {
    const ids = new Set<string>();
    allTasks.forEach(t => t.assignedTo.forEach(id => ids.add(id)));
    return Array.from(ids).map(id => {
      const emp = data.employees.find(e => e.id === id);
      return { id, name: emp?.name || id };
    });
  }, [allTasks, data.employees]);

  const teamOptions = useMemo(() => {
    const teams = new Set<string>();
    allTasks.forEach(t => { if (t.team) teams.add(t.team); });
    return Array.from(teams).sort();
  }, [allTasks]);

  /* -------- calendar -------- */
  const events = useMemo(() => {
    const items: CalendarItem[] = [];
    scopedTasks.forEach(t => {
      if (t.dueDate >= cursor.year + '-' + String(cursor.month + 1).padStart(2, '0') + '-01' &&
          t.dueDate <= cursor.year + '-' + String(cursor.month + 1).padStart(2, '0') + '-' + daysInMonth(cursor.year, cursor.month)) {
        items.push({ date: t.dueDate, kind: 'task', task: t });
      }
    });
    data.holidays.forEach(h => {
      if (h.date >= `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-01` &&
          h.date <= `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${daysInMonth(cursor.year, cursor.month)}`) {
        items.push({ date: h.date, kind: 'holiday', name: h.name });
      }
    });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [data.teamTasks, data.holidays, cursor, view]);

  const eventsOn = (iso: string) => events.filter(e => e.kind === 'task' && e.date === iso);

  const cells = useMemo(() => {
    const { year, month } = cursor;
    const offset = mondayOffset(year, month);
    const total = daysInMonth(year, month);
    const out: Array<null | { iso: string; day: number; weekend: boolean; holidayName: string | null; tasks: TeamTask[] }> = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let day = 1; day <= total; day++) {
      const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
      const weekend = isWeekendISO(iso);
      const holiday = data.holidays.find(h => h.date === iso);
      const dayTasks = eventsOn(iso);
      out.push({ iso, day, weekend, holidayName: holiday?.name ?? null, tasks: dayTasks.map(e => e.task) });
    }
    return out;
  }, [cursor, data.holidays, data.teamTasks]);

  /* -------- actions -------- */
  const createTask = async (values: Record<string, string>) => {
    const task = {
      id: `TASK-${Date.now()}`,
      title: values.title,
      description: values.description || '',
      status: values.status || 'To Do',
      priority: values.priority || 'Medium',
      startDate: values.startDate || '',
      dueDate: values.dueDate,
      assignedTo: values.assignedTo ? values.assignedTo.split(',').map(s => s.trim()) : [],
      team: values.team || '',
      project: values.projectId || '',
      tags: values.tags ? values.tags.split(',').map(s => s.trim()) : [],
      estimatedHours: Number(values.estimatedHours || 0),
      createdBy: user?.employeeId ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'add', collection: 'teamTasks', item: task, prepend: true });
    audit('Task created', task.id);
    toast('Task created.', 'success');
    setCreating(false);
  };

  const updateTask = (task: TeamTask, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'teamTasks',
      id: task.id,
      patch: {
        title: values.title,
        description: values.description,
        status: values.status,
        priority: values.priority,
        startDate: values.startDate || '',
        dueDate: values.dueDate,
        assignedTo: values.assignedTo ? values.assignedTo.split(',').map(s => s.trim()) : [],
        team: values.team,
        projectId: values.projectId,
        tags: values.tags ? values.tags.split(',').map(s => s.trim()) : [],
        estimatedHours: Number(values.estimatedHours || 0),
      },
    });
    toast('Task updated.', 'success');
    setEditing(null);
  };

  const move = (dir: -1 | 1 | 'today') => {
    if (view === 'week') {
      const next = dir === 'today' ? weekStartISO(todayISO()) : addDays(weekStart, dir * 7);
      setWeekStart(next);
      return;
    }
    if (dir === 'today') {
      setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() });
      return;
    }
    setCursor(c => {
      let month = c.month + dir;
      let year = c.year;
      if (month < 0) { month = 11; year--; }
      if (month > 11) { month = 0; year++; }
      return { year, month };
    });
  };

  const switchView = (v: CalView) => {
    if (v === 'week') {
      const cur = parseISO(weekStart);
      if (cur.getFullYear() !== cursor.year || cur.getMonth() !== cursor.month) {
        setWeekStart(weekStartISO(`${cursor.year}-${pad(cursor.month + 1)}-01`));
      }
    }
    setView(v);
  };

  const openDetail = (task: TeamTask) => setOpenTask(task);
  const startEdit = (task: TeamTask) => {
    setEditing(task);
    setFormValues({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      startDate: task.startDate || '',
      dueDate: task.dueDate,
      assignedTo: task.assignedTo.join(', '),
      projectId: task.projectId || '',
      tags: task.tags.join(', '),
      estimatedHours: String(task.estimatedHours || ''),
    });
    setEditing(task);
  };

  const saveEdit = () => {
    if (editing) updateTask(editing, formValues);
  };

  const deleteTask = (task: TeamTask) => {
    if (confirm(`Delete "${task.title}"?`)) {
      dispatch({ type: 'update', collection: 'teamTasks', id: task.id, patch: { deletedAt: new Date().toISOString() } });
      audit('Task deleted', task.id);
      toast('Task deleted.', 'info');
      setOpenTask(null);
    }
  };

  /* -------- view renderers -------- */
  const monthView = (
    <>
      <div className="cal-weekdays" aria-hidden="true">
        {[1,2,3,4,5,6,0].map(i => <span key={i}>{DAYS[i]}</span>)}
      </div>
      <div className="cal-grid">
        {cells.map((cell, i) => {
          if (cell === null) return <span className="cal-day blank" key={`blank-${i}`} aria-hidden="true" />;
          const hasTasks = cell.tasks.length > 0;
          const hasHoliday = !!cell.holidayName;
          const isToday = cell.iso === todayISO();
          return (
            <button
              key={cell.iso}
              type="button"
              className={['cal-day', cell.weekend ? 'weekend' : '', hasHoliday ? 'holiday' : '', hasTasks ? 'has-tasks' : '', cell.iso === todayISO() ? 'today' : ''].filter(Boolean).join(' ')}
              onClick={() => setDayIso(cell.iso)}
              aria-label={`${cell.day} ${MONTHS[cursor.month]} ${cursor.year}${cell.tasks.length ? ` — ${cell.tasks.length} task${cell.tasks.length > 1 ? 's' : ''}` : ''}${cell.holidayName ? ` — ${cell.holidayName}` : ''}`}
            >
              <span className="cal-num">{cell.day}</span>
              {cell.holidayName && <span className="cal-flag f-holiday">Holiday</span>}
              {cell.tasks.slice(0, 3).map(t => (
                <span key={t.id} className="cal-ev" style={{ background: TASK_STATUS_COLORS[t.status] }} title={`${t.title} (${t.status})`}>
                  <span className="cal-dot" style={{ background: TASK_STATUS_COLORS[t.status] }} />
                  <span className="nm">{t.title.length > 12 ? t.title.slice(0,12)+'…' : t.title}</span>
                </span>
              ))}
              {cell.tasks.length > 3 && <span className="cal-more">+{cell.tasks.length - 3} more</span>}
            </button>
          );
        })}
      </div>
      {!cells.some(c => c && c.tasks.length > 0) && <div className="empty" style={{ marginTop: 10 }}>No tasks this month.</div>}
    </>
  );

  const weekView = (
    <div className="cal-week">
      {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(iso => {
        const d = parseISO(iso);
        const weekend = isWeekendISO(iso);
        const dayTasks = events.filter(e => e.kind === 'task' && e.date === iso);
        return (
          <div className={['cal-week-col', weekend ? 'weekend' : '', iso === todayISO() ? 'today' : ''].filter(Boolean).join(' ')} key={iso}>
            <button className="cal-week-head" onClick={() => setDayIso(iso)} type="button" aria-label={`Day details for ${niceDate(iso)}`}>
              <b>{pad(d.getDate())}</b>
              <span>{DAYS[d.getDay()]}</span>
            </button>
            {dayTasks.length === 0 ? <span className="cal-week-none">—</span> : (
              dayTasks.map(e => (
                <button key={e.task.id} className="cal-ev" onClick={() => openDetail(e.task)} type="button" title={`${e.task.title} (${e.task.status})`}>
                  <span className="cal-dot" style={{ background: TASK_STATUS_COLORS[e.task.status] }} />
                  <span className="nm">{e.task.title}</span>
                </button>
              ))
            )}
          </div>
        );
      })}
    </div>
  );

  const agendaView = (
    <div className="cal-agenda">
      {events.length === 0 ? (
        <EmptyState icon="calendar" title="No tasks" sub={`No tasks in ${MONTHS_LONG[cursor.month]} ${cursor.year} for the current filters.`} />
      ) : (
        events.map((item, i) => {
          const prev = events[i - 1];
          const showDate = !prev || prev.date !== item.date;
          const d = parseISO(item.date);
          if (item.kind === 'holiday') return (
            <button key={`h-${item.date}`} className="event as-button" onClick={() => setDayIso(item.date)} type="button">
              <span className="date-chip" style={showDate ? undefined : { visibility: 'hidden' }} aria-hidden={!showDate}><b>{pad(d.getDate())}</b><span>{MONTHS[d.getMonth()].toUpperCase()}</span></span>
              <span className="what"><b>{item.name}</b><span>{niceDate(item.date)} · Company holiday</span></span>
              <span className="cal-flag static-pill f-holiday">Holiday</span>
            </button>
          );
          return (
            <button key={item.task.id} className="event as-button" onClick={() => openDetail(item.task)} type="button" title={`Open ${item.task.id}`}>
              <span className="date-chip" style={showDate ? undefined : { visibility: 'hidden' }} aria-hidden={!showDate}><b>{pad(d.getDate())}</b><span>{MONTHS[d.getMonth()].toUpperCase()}</span></span>
              <span className="what"><b>{item.task.title}</b><span>{item.task.id} · {dateRange(item.task.startDate, item.task.dueDate)} · {item.task.priority}</span></span>
              <span className={`cal-flag static-pill`} style={{ background: TASK_STATUS_COLORS[item.task.status] }}>{item.task.status}</span>
            </button>
          );
        })
      )}
    </div>
  );

  const calendarView = view === 'month' ? monthView : view === 'week' ? weekView : agendaView;

  return (
    <div className="team-task-calendar">
      <div className="card span12">
        <div className="card-head">
          <div>
            <h2>Team Task Calendar</h2>
            <div className="sub">Tasks, deadlines, and team assignments in one view</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setFormValues({ title: '', description: '', status: 'To Do', priority: 'Medium', dueDate: todayISO() }); setCreating(true); }} type="button">
            <Icon name="plus" size={15} /> New Task
          </button>
        </div>

        <div className="cal-toolbar">
          <button className="icon-btn icon-btn-sm" onClick={() => move(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'} type="button"><Icon name="chevronLeft" size={16} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => move('today')} type="button">Today</button>
          <button className="icon-btn icon-btn-sm" onClick={() => move(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'} type="button"><Icon name="chevronRight" size={16} /></button>
          <h3 className="cal-month" aria-live="polite">{view === 'week' ? `Week of ${niceDate(weekStart)}` : `${MONTHS_LONG[cursor.month]} ${cursor.year}`}</h3>
          <span className="spacer" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status filter">
            <option value="all">All Statuses</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="In Review">In Review</option>
            <option value="Blocked">Blocked</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Priority filter">
            <option value="all">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
            <option value="Critical">Critical</option>
          </select>
          {assigneeOptions.length > 0 && (
            <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} aria-label="Assignee filter">
              <option value="all">All Assignees</option>
              {assigneeOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
            </select>
          )}
          {teamOptions.length > 0 && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} aria-label="Team filter">
              <option value="all">All Teams</option>
              {teamOptions.map(team => <option key={team} value={team}>{team}</option>)}
            </select>
          )}
          <div className="segmented" role="tablist" aria-label="View">
            <button className={`seg-btn${view === 'month' ? ' on' : ''}`} role="tab" aria-selected={view === 'month'} onClick={() => switchView('month')} type="button">Month</button>
            <button className={`seg-btn${view === 'week' ? ' on' : ''}`} role="tab" aria-selected={view === 'week'} onClick={() => switchView('week')} type="button">Week</button>
            <button className={`seg-btn${view === 'agenda' ? ' on' : ''}`} role="tab" aria-selected={view === 'agenda'} onClick={() => switchView('agenda')} type="button">Agenda</button>
          </div>
        </div>

        <section>
          {calendarView}
        </section>

      {/* Create Task Modal */}
      {creating && (
        <Modal open onClose={() => setCreating(false)} title="Create New Task" size="lg">
          <form onSubmit={e => { e.preventDefault(); createTask(formValues); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Title *</label>
              <input type="text" value={formValues.title || ''} onChange={e => setFormValues({...formValues, title: e.target.value})} required placeholder="Task title" />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={formValues.description || ''} onChange={e => setFormValues({...formValues, description: e.target.value})} rows={3} placeholder="Task description (use @username to mention team members)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Status</label>
                <select value={formValues.status || 'To Do'} onChange={e => setFormValues({...formValues, status: e.target.value})}>
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="In Review">In Review</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={formValues.priority || 'Medium'} onChange={e => setFormValues({...formValues, priority: e.target.value})}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Start Date</label>
                <input type="date" value={formValues.startDate || ''} onChange={e => setFormValues({...formValues, startDate: e.target.value})} />
              </div>
              <div className="field">
                <label>Due Date *</label>
                <input type="date" value={formValues.dueDate || ''} onChange={e => setFormValues({...formValues, dueDate: e.target.value})} required />
              </div>
            </div>
            <div className="field">
              <label>Assigned To (comma-separated employee IDs)</label>
              <input type="text" value={formValues.assignedTo || ''} onChange={e => setFormValues({...formValues, assignedTo: e.target.value})} placeholder="e.g., CY0525RS109, CY0226AR110" />
              <small style={{ color: 'var(--muted)' }}>Available: {filteredEmployees.map(e => e.id).join(', ')}</small>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Team</label>
                <input type="text" value={formValues.team || ''} onChange={e => setFormValues({...formValues, team: e.target.value})} placeholder="e.g., Engineering, HR" />
              </div>
              <div className="field">
                <label>Project ID (optional)</label>
                <input type="text" value={formValues.projectId || ''} onChange={e => setFormValues({...formValues, projectId: e.target.value})} placeholder="e.g., PRJ-02" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Tags (comma-separated)</label>
                <input type="text" value={formValues.tags || ''} onChange={e => setFormValues({...formValues, tags: e.target.value})} placeholder="e.g., frontend, urgent" />
              </div>
              <div className="field">
                <label>Estimated Hours</label>
                <input type="number" value={formValues.estimatedHours || ''} onChange={e => setFormValues({...formValues, estimatedHours: e.target.value})} min="0" step="0.5" placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Task</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Task Modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Edit Task: ${editing.title}`} size="lg">
          <form onSubmit={e => { e.preventDefault(); saveEdit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Title *</label>
              <input type="text" value={formValues.title || ''} onChange={e => setFormValues({...formValues, title: e.target.value})} required placeholder="Task title" />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={formValues.description || ''} onChange={e => setFormValues({...formValues, description: e.target.value})} rows={3} placeholder="Task description (use @username to mention team members)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Status</label>
                <select value={formValues.status || 'To Do'} onChange={e => setFormValues({...formValues, status: e.target.value})}>
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="In Review">In Review</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={formValues.priority || 'Medium'} onChange={e => setFormValues({...formValues, priority: e.target.value})}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Start Date</label>
                <input type="date" value={formValues.startDate || ''} onChange={e => setFormValues({...formValues, startDate: e.target.value})} />
              </div>
              <div className="field">
                <label>Due Date *</label>
                <input type="date" value={formValues.dueDate || ''} onChange={e => setFormValues({...formValues, dueDate: e.target.value})} required />
              </div>
            </div>
            <div className="field">
              <label>Assigned To (comma-separated employee IDs)</label>
              <input type="text" value={formValues.assignedTo || ''} onChange={e => setFormValues({...formValues, assignedTo: e.target.value})} placeholder="e.g., CY0525RS109, CY0226AR110" />
              <small style={{ color: 'var(--muted)' }}>Available: {filteredEmployees.map(e => e.id).join(', ')}</small>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Team</label>
                <input type="text" value={formValues.team || ''} onChange={e => setFormValues({...formValues, team: e.target.value})} placeholder="e.g., Engineering, HR" />
              </div>
              <div className="field">
                <label>Project ID (optional)</label>
                <input type="text" value={formValues.projectId || ''} onChange={e => setFormValues({...formValues, projectId: e.target.value})} placeholder="e.g., PRJ-02" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Tags (comma-separated)</label>
                <input type="text" value={formValues.tags || ''} onChange={e => setFormValues({...formValues, tags: e.target.value})} placeholder="e.g., frontend, urgent" />
              </div>
              <div className="field">
                <label>Estimated Hours</label>
                <input type="number" value={formValues.estimatedHours || ''} onChange={e => setFormValues({...formValues, estimatedHours: e.target.value})} min="0" step="0.5" placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Task Detail Modal */}
      {openTask && (
        <Modal open onClose={() => setOpenTask(null)} title={openTask.title} size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span className={`pill`} style={{ background: TASK_STATUS_COLORS[openTask.status] }}>{openTask.status}</span>
              <span className={`pill`} style={{ background: PRIORITY_COLORS[openTask.priority] }}>{openTask.priority}</span>
              {openTask.team && <span className="pill">{openTask.team}</span>}
              {openTask.project && <span className="pill">Project: {openTask.project}</span>}
            </div>

            {openTask.description && (
              <div>
                <strong>Description:</strong>
                <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{openTask.description}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <strong>Due Date:</strong>
                <p>{niceDate(openTask.dueDate)}</p>
              </div>
              {openTask.startDate && (
                <div>
                  <strong>Start Date:</strong>
                  <p>{niceDate(openTask.startDate)}</p>
                </div>
              )}
              <div>
                <strong>Assigned To:</strong>
                <p>{openTask.assignedTo.map(id => {
                  const emp = data.employees.find(e => e.id === id);
                  return emp?.name || id;
                }).join(', ')}</p>
              </div>
              <div>
                <strong>Created By:</strong>
                <p>{(() => { const emp = data.employees.find(e => e.id === openTask.createdBy); return emp?.name || openTask.createdBy; })()}</p>
              </div>
              {openTask.estimatedHours > 0 && (
                <div>
                  <strong>Estimated Hours:</strong>
                  <p>{openTask.estimatedHours}h</p>
                </div>
              )}
              {openTask.actualHours > 0 && (
                <div>
                  <strong>Actual Hours:</strong>
                  <p>{openTask.actualHours}h</p>
                </div>
              )}
              {openTask.tags.length > 0 && (
                <div>
                  <strong>Tags:</strong>
                  <p>{openTask.tags.join(', ')}</p>
                </div>
              )}
              {openTask.completedAt && (
                <div>
                  <strong>Completed At:</strong>
                  <p>{niceDate(openTask.completedAt)}</p>
                </div>
              )}
            </div>

            {openTask.history && openTask.history.length > 0 && (
              <div>
                <strong>History:</strong>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  {openTask.history.slice(-10).map((h: any) => (
                    <li key={h.id} style={{ marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>{niceDate(h.performedAt)}</span> —{' '}
                      <strong>{h.action}</strong> by {h.performedBy}
                      {h.details && <span>: {h.details}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {openTask.reminders && openTask.reminders.length > 0 && (
              <div>
                <strong>Reminders Sent:</strong>
                <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 13 }}>
                  {openTask.reminders.map((r: any) => (
                    <li key={r.sentAt} style={{ marginBottom: 4 }}>
                      {r.type} — {r.sentTo.length} recipient(s) at {niceDate(r.sentAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {user?.portal !== 'employee' && (
                <>
                  <button className="btn btn-secondary" onClick={() => { startEdit(openTask); setOpenTask(null); }}>
                    <Icon name="edit" size={14} /> Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => deleteTask(openTask)}>
                    <Icon name="trash" size={14} /> Delete
                  </button>
                </>
              )}
              <button className="btn btn-primary" onClick={() => setOpenTask(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Day Details Modal */}
      {dayIso && (
        <Modal open onClose={() => setDayIso(null)} title={`Tasks for ${niceDate(dayIso)}`} size="md">
          <div>
            {eventsOn(dayIso).length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No tasks on this day.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {eventsOn(dayIso).map(e => (
                  <li key={e.task.id} style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => { setDayIso(null); openDetail(e.task); }} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="cal-dot" style={{ background: TASK_STATUS_COLORS[e.task.status] }} />
                      <div style={{ flex: 1 }}>
                        <strong>{e.task.title}</strong>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {e.task.assignedTo.map(id => {
                            const emp = data.employees.find(emp => emp.id === id);
                            return emp?.name || id;
                          }).join(', ')} · {e.task.priority}
                        </div>
                      </div>
                      <span className={`pill`} style={{ background: TASK_STATUS_COLORS[e.task.status], fontSize: 11 }}>{e.task.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </div>
    </div>
  );
}