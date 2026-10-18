/* ============================================================
   Settings — role matrix, HR configuration (departments,
   designations, holidays) and workspace options.
   ============================================================ */
import { Fragment, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { Pill, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { ALL_PAGES, NAV, canVisit, pageLabel } from '@/data/nav';
import { isApiSession } from '@/api/client';
import { DEMO_CREDENTIALS } from '@/api/mockServer';
import { deptName, empName } from '@/lib/lookups';
import { niceDate, todayISO } from '@/lib/date';
import type { Department, Designation, Holiday } from '@/types';

type TabKey = 'roles' | 'config' | 'workspace';

const ROLE_COLUMNS: Array<{ key: 'HR' | 'MANAGER' | 'EMPLOYEE'; label: string }> = [
  { key: 'HR', label: 'Super Admin / HR Admin / HR' },
  { key: 'MANAGER', label: 'Manager' },
  { key: 'EMPLOYEE', label: 'Employee' },
];

export function SettingsPage() {
  const { data, dispatch, audit, nextId, reset } = useApp();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('roles');
  const [confirmReset, setConfirmReset] = useState(false);
  const [subTab, setSubTab] = useState<'departments' | 'designations' | 'holidays'>('departments');

  /* ---------------- config CRUD ---------------- */
  const departmentForm: FieldDef[] = [
    { key: 'name', label: 'Department name', required: true },
    {
      key: 'head',
      label: 'Department head',
      type: 'select',
      options: [{ value: '', label: '— None —' }, ...data.employees.map((e) => ({ value: e.id, label: e.name }))],
    },
    { key: 'budget', label: 'Annual budget', placeholder: '₹1.0 Cr' },
    {
      key: 'active',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Inactive' },
      ],
    },
  ];

  const saveDepartment = (values: Record<string, string>, row?: Department) => {
    if (row) {
      dispatch({
        type: 'update',
        collection: 'departments',
        id: row.id,
        patch: { name: values.name, head: values.head || null, budget: values.budget, active: values.active !== 'false' },
      });
      audit('Department updated', row.id);
      toast('Department updated.', 'success');
    } else {
      const id = nextId('DEP-', 2);
      dispatch({
        type: 'add',
        collection: 'departments',
        item: { id, name: values.name, head: values.head || null, budget: values.budget || '—', active: values.active !== 'false' },
      });
      audit('Department added', `${values.name} (${id})`);
      toast('Department created.', 'success');
    }
  };

  const designationForm: FieldDef[] = [
    { key: 'title', label: 'Title', required: true },
    { key: 'deptId', label: 'Department', type: 'select', options: data.departments.map((d) => ({ value: d.id, label: d.name })) },
    { key: 'min', label: 'Minimum band', placeholder: '₹5.0L' },
    { key: 'max', label: 'Maximum band', placeholder: '₹9.0L' },
  ];

  const saveDesignation = (values: Record<string, string>, row?: Designation) => {
    if (row) {
      dispatch({
        type: 'update',
        collection: 'designations',
        id: row.id,
        patch: { title: values.title, deptId: values.deptId, min: values.min, max: values.max },
      });
      audit('Designation updated', row.id);
      toast('Designation updated.', 'success');
    } else {
      const id = nextId('DSG-', 2);
      dispatch({
        type: 'add',
        collection: 'designations',
        item: { id, title: values.title, deptId: values.deptId, min: values.min || '—', max: values.max || '—' },
      });
      audit('Designation added', `${values.title} (${id})`);
      toast('Designation created.', 'success');
    }
  };

  const holidayForm: FieldDef[] = [
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'name', label: 'Holiday name', required: true },
  ];

  const saveHoliday = (values: Record<string, string>, row?: Holiday) => {
    if (row) {
      const list = data.holidays.map((h) => (h.date === row.date ? { date: values.date, name: values.name } : h));
      dispatch({ type: 'set', patch: { holidays: list } });
      toast('Holiday updated.', 'success');
    } else {
      if (data.holidays.some((h) => h.date === values.date)) {
        toast('A holiday already exists on that date.', 'error');
        return;
      }
      dispatch({ type: 'set', patch: { holidays: [...data.holidays, { date: values.date, name: values.name }] } });
      toast('Holiday added to the calendar.', 'success');
    }
    audit('Holiday saved', `${values.name} · ${values.date}`);
  };

  /* ---------------- workspace ---------------- */
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyethack_hrm_data_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
    toast('Workspace data exported as JSON.', 'success');
  };

  const doReset = () => {
    if (isApiSession()) {
      setConfirmReset(false);
      toast('Server sessions reload from the HR server — the local demo reset is not available here.', 'info');
      return;
    }
    reset();
    setConfirmReset(false);
    toast('Demo data restored to the original seed.', 'success');
  };

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Settings</h2>
            <div className="sub">Roles & permissions, HR configuration and this device's workspace</div>
          </div>
          {user ? <span className="chip">Signed in as {user.name} · {user.role}</span> : null}
        </div>

        <Tabs
          tabs={[
            { key: 'roles', label: 'Roles & Permissions' },
            { key: 'config', label: 'Configuration' },
            { key: 'workspace', label: 'Workspace' },
          ]}
          active={tab}
          onChange={(k) => setTab(k as TabKey)}
        />

        <div style={{ marginTop: 16 }}>
          {tab === 'roles' ? (
            <>
              <div className="info-note" style={{ marginBottom: 14 }}>
                <Icon name="info" size={14} /> The matrix is generated from the same role map the router and sidebar use —
                change it in <span className="num">src/data/nav.ts</span> and everything follows.
              </div>
              <div className="table-scroll">
                <table className="data matrix">
                  <thead>
                    <tr>
                      <th>Module</th>
                      {ROLE_COLUMNS.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {NAV.map((group) => (
                      <Fragment key={group.label}>
                        <tr>
                          <td colSpan={ROLE_COLUMNS.length + 1} style={{ height: 34 }}>
                            <span className="payslip-heading">{group.label}</span>
                          </td>
                        </tr>
                        {group.items.map((item) => (
                          <tr key={item.page}>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <Icon name={item.icon} size={15} />
                                {pageLabel('hr', item.page)}
                              </span>
                            </td>
                            {ROLE_COLUMNS.map((c) => {
                              const allowed = canVisit(c.key, item.page) || item.page === 'Settings';
                              return (
                                <td key={c.key}>
                                  {c.key === 'HR' || allowed ? (
                                    <span className="yes">
                                      <Icon name="check" size={16} />
                                    </span>
                                  ) : (
                                    <span className="no">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-foot">
                {ALL_PAGES.length} modules · {ROLE_COLUMNS.length} role profiles. Salary columns and payroll totals stay
                HR-only regardless of routing.
              </div>
            </>
          ) : null}

          {tab === 'config' ? (
            <>
              <div className="tabs" style={{ marginBottom: 16 }}>
                <button className={`tab${subTab === 'departments' ? ' active' : ''}`} onClick={() => setSubTab('departments')} type="button">
                  Departments ({data.departments.length})
                </button>
                <button className={`tab${subTab === 'designations' ? ' active' : ''}`} onClick={() => setSubTab('designations')} type="button">
                  Designations ({data.designations.length})
                </button>
                <button className={`tab${subTab === 'holidays' ? ' active' : ''}`} onClick={() => setSubTab('holidays')} type="button">
                  Holidays ({data.holidays.length})
                </button>
              </div>

              {subTab === 'departments' ? (
                <ResourceView
                  rows={data.departments}
                  rowId={(d) => d.id}
                  columns={[
                    { header: 'Department', render: (d: Department) => <b>{d.name}</b> },
                    { header: 'Head', render: (d: Department) => empName(data.employees, d.head) },
                    { header: 'Headcount', render: (d: Department) => <span className="num">{data.employees.filter((e) => e.dept === d.id).length}</span>, num: true },
                    { header: 'Budget', render: (d: Department) => <span className="num">{d.budget}</span>, num: true },
                    { header: 'Status', render: (d: Department) => <Pill status={d.active ? 'Active' : 'Closed'} /> },
                  ]}
                  search={(d) => d.name}
                  form={departmentForm}
                  onCreate={(v) => saveDepartment(v)}
                  onUpdate={(row, v) => saveDepartment(v, row)}
                  createLabel="Add department"
                />
              ) : null}

              {subTab === 'designations' ? (
                <ResourceView
                  rows={data.designations}
                  rowId={(d) => d.id}
                  columns={[
                    { header: 'Designation', render: (d: Designation) => <b>{d.title}</b> },
                    { header: 'Department', render: (d: Designation) => deptName(data.departments, d.deptId) },
                    { header: 'Band', render: (d: Designation) => <span className="num">{`${d.min} – ${d.max}`}</span> },
                    { header: 'Employees', render: (d: Designation) => <span className="num">{data.employees.filter((e) => e.designation === d.title).length}</span>, num: true },
                  ]}
                  search={(d) => d.title}
                  form={designationForm}
                  onCreate={(v) => saveDesignation(v)}
                  onUpdate={(row, v) => saveDesignation(v, row)}
                  createLabel="Add designation"
                />
              ) : null}

              {subTab === 'holidays' ? (
                <ResourceView
                  rows={data.holidays}
                  rowId={(h) => h.date}
                  columns={[
                    { header: 'Date', render: (h: Holiday) => <span className="num">{niceDate(h.date)}</span> },
                    { header: 'Holiday', render: (h: Holiday) => <b>{h.name}</b> },
                    {
                      header: 'Falls on',
                      render: (h: Holiday) => new Date(h.date).toLocaleDateString('en-IN', { weekday: 'long' }),
                    },
                  ]}
                  search={(h) => `${h.name} ${h.date}`}
                  form={holidayForm}
                  onCreate={(v) => saveHoliday(v)}
                  onUpdate={(row, v) => saveHoliday(v, row)}
                  createLabel="Add holiday"
                  emptyIcon="calendar"
                />
              ) : null}
            </>
          ) : null}

          {tab === 'workspace' ? (
            <div className="grid">
              <section className="card span6">
                <div className="card-head">
                  <div>
                    <h2>Appearance</h2>
                    <div className="sub">Theme applies to this device instantly</div>
                  </div>
                </div>
                <div className="segmented">
                  <button className={`seg-btn${theme === 'dark' ? ' on' : ''}`} onClick={() => setTheme('dark')} type="button">
                    <Icon name="moon" size={14} /> Dark
                  </button>
                  <button className={`seg-btn${theme === 'light' ? ' on' : ''}`} onClick={() => setTheme('light')} type="button">
                    <Icon name="sun" size={14} /> Light
                  </button>
                </div>
                <div className="info-note" style={{ marginTop: 14 }}>
                  Stored under <span className="num">cyethackHRM.theme</span>; the sidebar rail preference lives under{' '}
                  <span className="num">cyethackHRM.rail</span>.
                </div>
              </section>

              <section className="card span6">
                <div className="card-head">
                  <div>
                    <h2>Demo data</h2>
                    <div className="sub">Everything you change is stored locally</div>
                  </div>
                </div>
                <div className="act-btns">
                  <button className="btn btn-outline btn-sm" onClick={exportJson} type="button">
                    <Icon name="download" size={14} /> Export data (JSON)
                  </button>
                  {isApiSession() ? null : (
                    <button className="btn btn-danger-outline btn-sm" onClick={() => setConfirmReset(true)} type="button">
                      <Icon name="refresh" size={14} /> Reset demo data
                    </button>
                  )}
                </div>
                <div className="info-note" style={{ marginTop: 14 }}>
                  {isApiSession() ? (
                    <>
                      This workspace is served by the HR server — the roster, leave, payroll and documents shown across the
                      portal are the official records and are not stored in this browser.
                    </>
                  ) : (
                    <>
                      The workspace persists to <span className="num">localStorage['cyethackHRM.v1']</span>. Resetting restores
                      the seeded roster, leave, recruitment and payroll definitions — edits are not recoverable.
                    </>
                  )}
                </div>
              </section>

              {!isApiSession() ? (
              <section className="card span12">
                <div className="card-head">
                  <div>
                    <h2>Demo credentials</h2>
                    <div className="sub">Sign out and use any of these to experience each portal</div>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Portal</th>
                        <th>Email</th>
                        <th>Password</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_CREDENTIALS.map((c) => (
                        <tr key={c.email}>
                          <td>
                            <b>{c.label}</b>
                          </td>
                          <td className="num">{c.email}</td>
                          <td className="num">{c.password}</td>
                          <td>{c.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-foot">
                  Sessions last 12 hours. "Remember me" keeps the session across restarts; otherwise it clears when the
                  browser closes.
                </div>
              </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {confirmReset ? (
        <Modal
          title="Reset demo data?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)} type="button">
                Keep my changes
              </button>
              <button className="btn btn-danger-outline" onClick={doReset} type="button">
                Reset everything
              </button>
            </>
          }
        >
          <div className="info-note">
            <Icon name="alertTriangle" size={14} /> This wipes local edits — employees, leave decisions, payroll runs,
            tickets and announcements revert to the original seed.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
