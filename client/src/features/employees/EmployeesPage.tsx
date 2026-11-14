/* ============================================================
   Employees — the HR suite's people module.

   Tabs: Directory (roster CRUD), Departments, Designations,
   Promotions & Transfers, Training and Exit.
   Managers see a scoped "My Team" directory; salary columns and
   create/edit actions are gated to HR/Admin.
   ============================================================ */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResourceView, type FieldDef, type FilterDef } from '@/components/ui/ResourceView';
import { EmpCell, InlineBar, Pill, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { PAGE_PATH } from '@/data/nav';
import { useDrill } from '@/lib/useDrill';
import { deptName, empName, teamIds, filterDemoEmployees } from '@/lib/lookups';
import { buildRosterId, money } from '@/lib/format';
import { dateRange, niceDate } from '@/lib/date';
import { canSeeSalary } from '@/data/nav';
import { isApiSession } from '@/api/client';
import {
  createEmployee as createEmployeeApi,
  updateEmployee as updateEmployeeApi,
  resetEmployeePassword,
  inviteEmployee,
  setAccountStatus,
  type CreateEmployeeParams,
  type ResetPasswordResponse,
  type InviteResponse,
  type SetAccountStatusResponse,
} from '@/api/employees';
import {
  CredentialModal,
  ResetPasswordDialog,
  InviteDialog,
  AccountStatusDialog,
  ActivityHistory,
} from './EmployeeCredentials';
import type {
  Department,
  Designation,
  Employee,
  EmployeeStatus,
  Promotion,
  Training,
  Transfer,
  AccountStatus,
} from '@/types';

const EMP_STATUSES: EmployeeStatus[] = ['Active', 'Probation', 'On Leave', 'Resigned', 'Terminated'];
const CAN_MANAGE_CREDENTIALS = (role: string | undefined) =>
  role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR';

type TabKey = 'directory' | 'departments' | 'designations' | 'promotions' | 'training' | 'exit';

export function EmployeesPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { user, canSeeSalary, canManage } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { query: seedQuery, dept: seedDept, clear } = useDrill();

  const [tab, setTab] = useState<TabKey>('directory');
  const [deptDrill, setDeptDrill] = useState(seedDept);

  /* Credential management dialog state. The one-time credential payload is held
   * in component state only while the success modal is open — it is never
   * persisted to localStorage or re-shown after the modal closes. */
  const [creatingCredential, setCreatingCredential] = useState<{
    employeeId: string;
    loginUserId: string;
    employeeName: string;
    department: string;
    designation: string;
    role: string;
    accountStatus: string;
    temporaryPassword: string;
    activationToken: string;
    creatorName: string;
    creatorRole: string;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [credTarget, setCredTarget] = useState<{ id: string; name: string; status: AccountStatus } | null>(null);

  useEffect(() => {
    setDeptDrill(seedDept);
    if (seedDept) setTab('directory');
  }, [seedDept]);

  const myId = user?.employeeId ?? '';

  /* -------- scope: managers see their own reporting line -------- */
  const rows = useMemo(() => {
    let list = filterDemoEmployees(data.employees);
    if (user?.portal === 'manager' && myId) {
      const ids = teamIds(data.employees, myId);
      list = list.filter((e) => ids.has(e.id));
    }
    if (deptDrill) list = list.filter((e) => e.dept === deptDrill);
    if (seedQuery) {
      const q = seedQuery.toLowerCase();
      list = list.filter((e) => `${e.name} ${e.id} ${e.email} ${e.designation}`.toLowerCase().includes(q));
    }
    return list;
  }, [data.employees, user?.portal, myId, deptDrill, seedQuery]);

  const deptFilters: FilterDef<Employee>[] = [
    {
      key: 'dept',
      label: 'All departments',
      options: data.departments.map((d) => ({ value: d.id, label: d.name })),
      match: (e, v) => e.dept === v,
    },
    {
      key: 'status',
      label: 'All statuses',
      options: EMP_STATUSES.map((s) => ({ value: s, label: s })),
      match: (e, v) => e.status === v,
    },
  ];

  const directoryColumns = useMemo(() => {
    const cols: Array<{ header: string; render: (e: Employee) => ReactNode; num?: boolean }> = [
      { header: 'Employee', render: (e) => <EmpCell name={e.name} sub={e.email} seed={e.id} /> },
      { header: 'ID', render: (e) => <span className="num">{e.id}</span> },
      { header: 'User ID', render: (e) => <span className="num" style={{ fontSize: 11, color: 'var(--text-2)' }}>{e.userId || '—'}</span> },
      { header: 'Department', render: (e) => deptName(data.departments, e.dept) },
      { header: 'Designation', render: (e) => e.designation },
      { header: 'Manager', render: (e) => empName(data.employees, e.manager) },
      { header: 'Location', render: (e) => e.location },
      {
        header: 'Account',
        render: (e) => (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Pill status={e.status} />
            {e.accountStatus ? (
              <span style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'lowercase' }}>{e.accountStatus}</span>
            ) : null}
            {e.mustChangePassword ? (
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'lowercase' }}>reset password</span>
            ) : null}
          </span>
        ),
      },
    ];
    if (canSeeSalary) {
      cols.push({ header: 'Monthly in-hand', render: (e) => <span className="num">{money(e.salary)}</span>, num: true });
    }
    return cols;
  }, [data.departments, data.employees, canSeeSalary]);

  const employeeForm: FieldDef[] = useMemo(() => {
    const fields: FieldDef[] = [
      { key: 'firstName', label: 'First name', required: true, placeholder: 'First name' },
      { key: 'lastName', label: 'Last name', placeholder: 'Last name' },
      { key: 'email', label: 'Official work email', type: 'email', required: true, placeholder: 'name@cyethack.com' },
      { key: 'personalEmail', label: 'Personal email', type: 'email', placeholder: 'name@gmail.com' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+91 98…' },
      {
        key: 'gender',
        label: 'Gender',
        type: 'select',
        options: ['Male', 'Female', 'Other', 'Prefer not to say'].map((g) => ({ value: g, label: g })),
      },
      { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      { key: 'address', label: 'Address', type: 'textarea', placeholder: 'Street address, city' },
      { key: 'emergencyContact', label: 'Emergency contact', placeholder: 'Name and phone' },
      {
        key: 'dept',
        label: 'Department',
        type: 'select',
        required: true,
        options: data.departments.map((d) => ({ value: d.id, label: d.name })),
      },
      {
        key: 'designation',
        label: 'Designation',
        type: 'select',
        getOptions: (values) => {
          const deptId = values.dept;
          if (!deptId) return [];
          return data.designations
            .filter((d) => d.deptId === deptId)
            .map((d) => ({ value: d.id, label: d.title }));
        },
        dependsOn: 'dept',
      },
      {
        key: 'manager',
        label: 'Reports to',
        type: 'select',
        options: [{ value: '', label: '— None —' }, ...data.employees.map((e) => ({ value: e.id, label: e.name }))],
      },
      {
        key: 'employmentType',
        label: 'Employment type',
        type: 'select',
        options: ['Full-time', 'Part-time', 'Contract', 'Intern'].map((t) => ({ value: t, label: t })),
      },
      {
        key: 'workMode',
        label: 'Work mode',
        type: 'select',
        options: ['On-site', 'Hybrid', 'Remote', 'Work from Home'].map((w) => ({ value: w, label: w })),
      },
      {
        key: 'workLocation',
        label: 'Work location',
        type: 'select',
        options: ['office', 'onsite'].map((w) => ({ value: w, label: w === 'office' ? 'Office' : 'On-site' })),
      },
      { key: 'bloodGroup', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => ({ value: b, label: b })) },
      { key: 'joining', label: 'Joining date', type: 'date', required: true },
      {
        key: 'status',
        label: 'Employment status',
        type: 'select',
        options: EMP_STATUSES.map((s) => ({ value: s, label: s })),
      },
    ];
    if (canSeeSalary) {
      fields.push({ key: 'salary', label: 'Annual salary (₹)', type: 'number', placeholder: '0' });
      fields.push({ key: 'grade', label: 'Grade', placeholder: 'E1 / M1…' });
    }
    return fields;
  }, [data.departments, data.designations, data.employees, canSeeSalary]);

  const createEmployee = async (values: Record<string, string>) => {
    const fullName = [values.firstName, values.lastName].filter(Boolean).join(' ').trim();
    if (isApiSession()) {
      const params: CreateEmployeeParams = {
        fullName,
        firstName: values.firstName.trim() || undefined,
        lastName: values.lastName.trim() || undefined,
        email: values.email.trim(),
        personalEmail: values.personalEmail.trim() || undefined,
        phone: values.phone.trim() || undefined,
        gender: (values.gender as CreateEmployeeParams['gender']) || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        address: values.address.trim() || undefined,
        emergencyContact: values.emergencyContact.trim() || undefined,
        department: values.dept,
        departmentId: values.deptId || undefined,
        designation: values.designation || '—',
        designationId: values.designationId || undefined,
        manager: values.manager || undefined,
        location: values.location || 'office',
        employmentType: (values.employmentType as CreateEmployeeParams['employmentType']) || 'Full-time',
        workMode: (values.workMode as CreateEmployeeParams['workMode']) || 'On-site',
        workLocation: (values.workLocation as CreateEmployeeParams['workLocation']) || 'office',
        bloodGroup: (values.bloodGroup as CreateEmployeeParams['bloodGroup']) || undefined,
        joiningDate: values.joining,
        salary: canSeeSalary ? Number(values.salary || 0) : undefined,
        grade: values.grade.trim() || undefined,
        status: (values.status as EmployeeStatus) || 'Active',
      };
      const res = await createEmployeeApi(params);
      /* Hold the one-time credentials in state so the success modal can show
       * them exactly once. After the modal closes they cannot be retrieved. */
      setCreatingCredential({
        employeeId: res.employee.employeeId,
        loginUserId: res.account.loginUserId,
        employeeName: res.employee.fullName,
        department: res.employee.department,
        designation: res.employee.designation,
        role: res.account.role,
        accountStatus: res.account.accountStatus,
        temporaryPassword: res.temporaryPassword,
        activationToken: res.activationToken,
        creatorName: res.creator?.name ?? user?.name ?? '—',
        creatorRole: res.creator?.role ?? user?.role ?? '—',
      });
      toast(`${res.employee.fullName} joined with ID ${res.employee.employeeId}. One-time credentials shown below.`, 'success');
      return;
    }
    // Demo mode: local generation
    const id = buildRosterId(fullName, data.employees.length);
    const record: Employee = {
      id,
      name: fullName,
      email: values.email.trim(),
      phone: values.phone || '—',
      gender: 'Male',
      dob: '1995-01-01',
      dept: values.dept,
      designation: values.designation || '—',
      manager: values.manager || null,
      location: values.location || 'Noida',
      employmentType: (values.employmentType as Employee['employmentType']) || 'Full-time',
      joining: values.joining,
      status: (values.status as EmployeeStatus) || 'Probation',
      probation: (values.status || 'Probation') === 'Probation',
      experience: values.experience || '—',
      grade: values.grade || 'E1',
      salary: Number(values.salary || 0) || 50000,
    };
    dispatch({ type: 'add', collection: 'employees', item: record });
    audit('Employee added', `${record.name} (${id})`);
    notify(`${record.name} was added to the roster`);
    toast(`${record.name} joined the roster.`, 'success');
  };

  const updateEmployee = async (row: Employee, values: Record<string, string>) => {
    const patch: Record<string, unknown> = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone,
      dept: values.dept,
      designation: values.designation,
      departmentId: values.deptId,
      designationId: values.designationId,
      manager: values.manager || null,
      location: values.location,
      employmentType: values.employmentType,
      joining: values.joining,
      status: values.status,
      probation: values.status === 'Probation',
      experience: values.experience,
    };
    if (canSeeSalary) {
      patch.salary = Number(values.salary || 0);
      patch.grade = values.grade;
    }
    if (isApiSession()) {
      try {
        await updateEmployeeApi(row.id, patch);
        audit('Employee updated', `${row.name} (${row.id})`);
        toast('Employee record updated.', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed.';
        toast(msg, 'error');
        throw err;
      }
      return;
    }
    // Demo mode: local generation
    dispatch({ type: 'update', collection: 'employees', id: row.id, patch });
    audit('Employee updated', `${row.name} (${row.id})`);
    toast('Employee record updated.', 'success');
  };

  /* -------- departments -------- */
  const filteredEmployees = filterDemoEmployees(data.employees);
  const departmentCount = (id: string) => filteredEmployees.filter((e) => e.dept === id).length;
  const departmentColumns = [
    { header: 'Department', render: (d: Department) => <b>{d.name}</b> },
    { header: 'Head', render: (d: Department) => empName(filteredEmployees, d.head) },
    { header: 'Headcount', render: (d: Department) => <span className="num">{departmentCount(d.id)}</span>, num: true },
    { header: 'Annual budget', render: (d: Department) => <span className="num">{d.budget}</span>, num: true },
    { header: 'Active', render: (d: Department) => <Pill status={d.active ? 'Active' : 'Closed'} /> },
  ];
  const departmentForm: FieldDef[] = [
    { key: 'name', label: 'Department name', required: true },
    {
      key: 'head',
      label: 'Department head',
      type: 'select',
      options: [{ value: '', label: '— None —' }, ...filteredEmployees.map((e) => ({ value: e.id, label: `${e.name} (${e.designation})` }))],
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

  const createDepartment = (values: Record<string, string>) => {
    const id = nextId('DEP-', 2);
    dispatch({
      type: 'add',
      collection: 'departments',
      item: { id, name: values.name, head: values.head || null, budget: values.budget || '—', active: values.active !== 'false' },
    });
    audit('Department added', `${values.name} (${id})`);
    toast('Department created.', 'success');
  };

  const updateDepartment = (row: Department, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'departments',
      id: row.id,
      patch: { name: values.name, head: values.head || null, budget: values.budget, active: values.active !== 'false' },
    });
    audit('Department updated', row.id);
    toast('Department updated.', 'success');
  };

  /* -------- designations -------- */
  const designationColumns = [
    { header: 'Designation', render: (d: Designation) => <b>{d.title}</b> },
    { header: 'Department', render: (d: Designation) => deptName(data.departments, d.deptId) },
    { header: 'Min band', render: (d: Designation) => <span className="num">{canSeeSalary ? d.min : '—'}</span>, num: true },
    { header: 'Max band', render: (d: Designation) => <span className="num">{canSeeSalary ? d.max : '—'}</span>, num: true },
    {
      header: 'Employees',
      render: (d: Designation) => <span className="num">{filteredEmployees.filter((e) => e.designation === d.title).length}</span>,
      num: true,
    },
  ];
  const designationForm: FieldDef[] = [
    { key: 'title', label: 'Title', required: true },
    {
      key: 'deptId',
      label: 'Department',
      type: 'select',
      options: data.departments.map((d) => ({ value: d.id, label: d.name })),
    },
    { key: 'min', label: 'Minimum band', placeholder: '₹5.0L' },
    { key: 'max', label: 'Maximum band', placeholder: '₹9.0L' },
  ];

  const createDesignation = (values: Record<string, string>) => {
    const id = nextId('DSG-', 2);
    dispatch({
      type: 'add',
      collection: 'designations',
      item: { id, title: values.title, deptId: values.deptId, min: values.min || '—', max: values.max || '—' },
    });
    audit('Designation added', `${values.title} (${id})`);
    toast('Designation created.', 'success');
  };

  const updateDesignation = (row: Designation, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'designations',
      id: row.id,
      patch: { title: values.title, deptId: values.deptId, min: values.min, max: values.max },
    });
    audit('Designation updated', row.id);
    toast('Designation updated.', 'success');
  };

  /* -------- promotions & transfers -------- */
  const promotionColumns = [
    { header: 'Employee', render: (p: Promotion) => <EmpCell name={empName(filteredEmployees, p.employeeId)} sub={p.employeeId} seed={p.employeeId} /> },
    { header: 'From', render: (p: Promotion) => p.from },
    { header: 'To', render: (p: Promotion) => <b>{p.to}</b> },
    { header: 'Effective', render: (p: Promotion) => <span className="num">{niceDate(p.effective)}</span> },
    ...(canSeeSalary
      ? [
          {
            header: 'Salary change',
            render: (p: Promotion) => (
              <span className="num">
                {money(p.prevSalary)} → {money(p.newSalary)}
              </span>
            ),
          },
        ]
      : []),
    { header: 'Reason', render: (p: Promotion) => p.reason },
  ];

  const promotionForm: FieldDef[] = [
    {
      key: 'employeeId',
      label: 'Employee',
      type: 'select',
      required: true,
      options: filteredEmployees.map((e) => ({ value: e.id, label: `${e.name} (${e.designation})` })),
    },
    { key: 'from', label: 'Current title', required: true },
    { key: 'to', label: 'New title', required: true },
    { key: 'effective', label: 'Effective date', type: 'date', required: true },
    ...(canSeeSalary
      ? ([
          { key: 'prevSalary', label: 'Previous salary (₹)', type: 'number' },
          { key: 'newSalary', label: 'New salary (₹)', type: 'number' },
        ] as FieldDef[])
      : []),
    { key: 'reason', label: 'Reason', type: 'textarea', half: true },
  ];

  const applyPromotion = (p: Promotion) => {
    const patch: Record<string, unknown> = { designation: p.to };
    if (p.newSalary > 0) patch.salary = p.newSalary;
    dispatch({ type: 'update', collection: 'employees', id: p.employeeId, patch });
    dispatch({ type: 'remove', collection: 'promotions', id: p.id });
    audit('Promotion applied', `${p.employeeId} → ${p.to}`);
    notify(`${empName(data.employees, p.employeeId)} was promoted to ${p.to}`);
    toast(`Promotion applied for ${empName(data.employees, p.employeeId)}.`, 'success');
  };

  const createPromotion = (values: Record<string, string>) => {
    const id = nextId('PMO-', 2);
    dispatch({
      type: 'add',
      collection: 'promotions',
      item: {
        id,
        employeeId: values.employeeId,
        from: values.from,
        to: values.to,
        effective: values.effective,
        prevSalary: Number(values.prevSalary || 0),
        newSalary: Number(values.newSalary || 0),
        reason: values.reason,
        approvedBy: myId,
      } satisfies Promotion,
    });
    audit('Promotion recorded', id);
    toast('Promotion recorded — apply it when ready.', 'success');
  };

  const transferColumns = [
    { header: 'Employee', render: (t: Transfer) => <EmpCell name={empName(filteredEmployees, t.employeeId)} sub={t.employeeId} seed={t.employeeId} /> },
    { header: 'From', render: (t: Transfer) => deptName(data.departments, t.fromDept) },
    { header: 'To', render: (t: Transfer) => <b>{deptName(data.departments, t.toDept)}</b> },
    { header: 'Location', render: (t: Transfer) => `${t.fromLoc} → ${t.toLoc}` },
    { header: 'Effective', render: (t: Transfer) => <span className="num">{niceDate(t.effective)}</span> },
    { header: 'Reason', render: (t: Transfer) => t.reason },
  ];

  const transferForm: FieldDef[] = [
    {
      key: 'employeeId',
      label: 'Employee',
      type: 'select',
      required: true,
      options: filteredEmployees.map((e) => ({ value: e.id, label: `${e.name} (${deptName(data.departments, e.dept)})` })),
    },
    { key: 'toDept', label: 'New department', type: 'select', required: true, options: data.departments.map((d) => ({ value: d.id, label: d.name })) },
    { key: 'toLoc', label: 'New location', type: 'select', options: ['Noida', 'Gurugram', 'Remote', 'Work from Home', 'Client site'].map((l) => ({ value: l, label: l })) },
    { key: 'effective', label: 'Effective date', type: 'date', required: true },
    { key: 'reason', label: 'Reason', type: 'textarea', half: true },
  ];

  const applyTransfer = (t: Transfer) => {
    dispatch({ type: 'update', collection: 'employees', id: t.employeeId, patch: { dept: t.toDept, location: t.toLoc } });
    dispatch({ type: 'remove', collection: 'transfers', id: t.id });
    audit('Transfer applied', `${t.employeeId} → ${deptName(data.departments, t.toDept)}`);
    notify(`${empName(data.employees, t.employeeId)} transferred to ${deptName(data.departments, t.toDept)}`);
    toast('Transfer applied.', 'success');
  };

  const createTransfer = (values: Record<string, string>) => {
    const emp = data.employees.find((e) => e.id === values.employeeId);
    if (!emp) return;
    const id = nextId('TRF-', 2);
    dispatch({
      type: 'add',
      collection: 'transfers',
      item: {
        id,
        employeeId: emp.id,
        fromDept: emp.dept,
        toDept: values.toDept,
        fromLoc: emp.location,
        toLoc: values.toLoc || emp.location,
        effective: values.effective,
        reason: values.reason,
        approvedBy: myId,
      } satisfies Transfer,
    });
    audit('Transfer recorded', id);
    toast('Transfer recorded — apply it when ready.', 'success');
  };

  /* -------- training -------- */
  const trainingColumns = [
    { header: 'Programme', render: (t: Training) => <b>{t.name}</b> },
    { header: 'Employee', render: (t: Training) => empName(filteredEmployees, t.employeeId) },
    { header: 'Trainer', render: (t: Training) => (t.trainer.startsWith('CY') ? empName(filteredEmployees, t.trainer) : t.trainer) },
    { header: 'Dates', render: (t: Training) => <span className="num">{dateRange(t.start, t.end)}</span> },
    { header: 'Completion', render: (t: Training) => <InlineBar value={t.completion} /> },
    { header: 'Status', render: (t: Training) => <Pill status={t.status} /> },
    { header: 'Certification', render: (t: Training) => t.certification },
  ];

  const trainingForm: FieldDef[] = [
    { key: 'name', label: 'Programme name', required: true },
    {
      key: 'employeeId',
      label: 'Employee',
      type: 'select',
      required: true,
      options: filteredEmployees.map((e) => ({ value: e.id, label: e.name })),
    },
    { key: 'trainer', label: 'Trainer', placeholder: 'External — SANS / employee id' },
    { key: 'dept', label: 'Department', type: 'select', options: data.departments.map((d) => ({ value: d.id, label: d.name })) },
    { key: 'start', label: 'Start date', type: 'date', required: true },
    { key: 'end', label: 'End date', type: 'date', required: true },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['Not Started', 'In Progress', 'Completed'].map((s) => ({ value: s, label: s })),
    },
    { key: 'completion', label: 'Completion %', type: 'number' },
    { key: 'certification', label: 'Certification' },
  ];

  const createTraining = (values: Record<string, string>) => {
    const id = nextId('TRN-', 2);
    dispatch({
      type: 'add',
      collection: 'training',
      item: {
        id,
        name: values.name,
        employeeId: values.employeeId,
        trainer: values.trainer || 'Internal',
        dept: values.dept || 'DEP-02',
        start: values.start,
        end: values.end,
        status: values.status || 'Not Started',
        completion: Number(values.completion || 0),
        certification: values.certification || '—',
      } satisfies Training,
    });
    audit('Training created', id);
    toast('Training programme added.', 'success');
  };

  const updateTraining = (row: Training, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'training',
      id: row.id,
      patch: {
        name: values.name,
        employeeId: values.employeeId,
        trainer: values.trainer,
        dept: values.dept,
        start: values.start,
        end: values.end,
        status: values.status,
        completion: Number(values.completion || 0),
        certification: values.certification,
      },
    });
    audit('Training updated', row.id);
    toast('Training updated.', 'success');
  };

  /* -------- exit records (read-only here; processing lives in Offboarding) -------- */
  const exitColumns = [
    { header: 'Employee', render: (x: (typeof data.exits)[number]) => <EmpCell name={empName(filteredEmployees, x.employeeId)} sub={x.employeeId} seed={x.employeeId} /> },
    { header: 'Resignation', render: (x: (typeof data.exits)[number]) => <span className="num">{niceDate(x.resignationDate)}</span> },
    { header: 'Last day', render: (x: (typeof data.exits)[number]) => <span className="num">{niceDate(x.lastDay)}</span> },
    { header: 'Notice', render: (x: (typeof data.exits)[number]) => x.noticePeriod },
    { header: 'Assets', render: (x: (typeof data.exits)[number]) => <Pill status={x.assetReturn === 'Completed' ? 'Completed' : 'Pending'} /> },
    { header: 'Clearance', render: (x: (typeof data.exits)[number]) => <Pill status={x.clearance === 'Completed' ? 'Completed' : 'Pending'} /> },
    { header: 'Settlement', render: (x: (typeof data.exits)[number]) => <Pill status={x.settlement === 'Processed' ? 'Processed' : 'Pending'} /> },
    { header: 'Status', render: (x: (typeof data.exits)[number]) => <Pill status={x.status} /> },
  ];

  const tabs: Array<{ key: TabKey; label: string }> = canManage
    ? [
        { key: 'directory', label: `Directory (${rows.length})` },
        { key: 'departments', label: 'Departments' },
        { key: 'designations', label: 'Designations' },
        { key: 'promotions', label: 'Promotions & Transfers' },
        { key: 'training', label: 'Training' },
        { key: 'exit', label: 'Exit' },
      ]
    : [{ key: 'directory', label: `My Team (${rows.length})` }];

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{user?.portal === 'manager' ? 'My Team' : 'Employee Records'}</h2>
            <div className="sub">
              {canSeeSalary
                ? 'Full roster with departments, reporting lines and in-hand salaries'
                : 'Your reporting line with contact details and status'}
            </div>
          </div>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={(key) => setTab(key as TabKey)} />

        {(deptDrill || seedQuery) && tab === 'directory' ? (
          <div style={{ marginTop: 12 }}>
            <span className="ana-drill-note">
              {deptDrill ? `Filtered: ${deptName(data.departments, deptDrill)}` : `Search: “${seedQuery}”`}
              <button onClick={clear} type="button" aria-label="Clear filter">
                ✕
              </button>
            </span>
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {tab === 'directory' ? (
            <ResourceView
              rows={rows}
              rowId={(e) => e.id}
              columns={directoryColumns}
              search={(e) => `${e.name} ${e.id} ${e.email} ${e.designation} ${e.location}`}
              filters={deptFilters}
              summary={[
                { k: 'Employees', v: rows.length },
                { k: 'Active', v: rows.filter((e) => e.status === 'Active').length },
                { k: 'Probation', v: rows.filter((e) => e.status === 'Probation').length },
                { k: 'On leave', v: rows.filter((e) => e.status === 'On Leave').length },
              ]}
              actions={(e) => {
                if (!canManage) return [];
                const credActions: Array<{ key: string; label: string; variant?: 'outline' | 'danger' | 'ghost' }> = [
                  { key: 'reset', label: 'Reset password', variant: 'danger' },
                  { key: 'invite', label: 'Send invitation' },
                  { key: 'status', label: e.accountStatus === 'active' ? 'Deactivate' : 'Activate' },
                  { key: 'history', label: 'Activity history', variant: 'ghost' },
                ];
                // Managers may only act on their own team (server enforces scope).
                return credActions;
              }}
              onAction={(key, e) => {
                if (key === 'documents') {
                  navigate(PAGE_PATH.Documents, { state: { query: e.name } });
                  return;
                }
                if (!CAN_MANAGE_CREDENTIALS(user?.role)) return;
                setCredTarget({ id: e.id, name: e.name, status: (e.accountStatus as AccountStatus) || 'active' });
                if (key === 'reset') setResetOpen(true);
                if (key === 'invite') setInviteOpen(true);
                if (key === 'status') setStatusOpen(true);
                if (key === 'history') setHistoryOpen(true);
              }}
              detail={(e) => [
                'Employment',
                ['Employee ID', e.id],
                ['User ID', e.userId || '—'],
                ['Department', deptName(data.departments, e.dept)],
                ['Designation', e.designation],
                ['Reports to', empName(data.employees, e.manager)],
                ['Location', e.location],
                ['Employment type', e.employmentType],
                ['Joined', niceDate(e.joining)],
                ['Experience', e.experience],
                ['Status', <Pill status={e.status} key="st" />],
                ['Account status', e.accountStatus ? (<span style={{ textTransform: 'lowercase' }}>{e.accountStatus}</span>) : '—'],
                ['Must change password', e.mustChangePassword ? 'Yes' : 'No'],
                ...(canSeeSalary ? ([['Monthly in-hand', money(e.salary)], ['Grade', e.grade]] as Array<[string, ReactNode]>) : []),
                'Personal',
                ['Email', e.email],
                ['Phone', e.phone],
                ['Gender', e.gender],
                ['Date of birth', niceDate(e.dob)],
                ['Blood group', e.bloodGroup ?? '—'],
              ]}
              form={canManage ? employeeForm : undefined}
              onCreate={canManage ? createEmployee : undefined}
              onUpdate={canManage ? updateEmployee : undefined}
              createLabel="Add employee"
              searchPlaceholder="Search name, id, email…"
              emptyText="No employees match the current filters."
            />
          ) : null}

          {tab === 'departments' ? (
            <ResourceView
              rows={data.departments}
              rowId={(d) => d.id}
              columns={departmentColumns}
              search={(d) => `${d.name} ${empName(data.employees, d.head)}`}
              detail={(d) => [
                'Department',
                ['Name', d.name],
                ['Head', empLabelOf(d.head)],
                ['Headcount', String(departmentCount(d.id))],
                ['Annual budget', d.budget],
                ['Status', d.active ? 'Active' : 'Inactive'],
              ]}
              form={departmentForm}
              onCreate={createDepartment}
              onUpdate={updateDepartment}
              createLabel="Add department"
              searchPlaceholder="Search departments…"
            />
          ) : null}

          {tab === 'designations' ? (
            <ResourceView
              rows={data.designations}
              rowId={(d) => d.id}
              columns={designationColumns}
              search={(d) => `${d.title} ${deptName(data.departments, d.deptId)}`}
              filters={[
                {
                  key: 'deptId',
                  label: 'All departments',
                  options: data.departments.map((d) => ({ value: d.id, label: d.name })),
                  match: (d, v) => d.deptId === v,
                },
              ]}
              form={designationForm}
              onCreate={createDesignation}
              onUpdate={updateDesignation}
              createLabel="Add designation"
              searchPlaceholder="Search titles…"
            />
          ) : null}

          {tab === 'promotions' ? (
            <>
              <ResourceView
                rows={data.promotions}
                rowId={(p) => p.id}
                columns={promotionColumns}
                search={(p) => `${empName(data.employees, p.employeeId)} ${p.from} ${p.to}`}
                actions={() => [{ key: 'apply', label: 'Apply' }]}
                onAction={(_, p) => applyPromotion(p)}
                form={promotionForm}
                onCreate={createPromotion}
                createLabel="Record promotion"
                searchPlaceholder="Search promotions…"
                emptyText="No promotions on record."
                emptyIcon="trendingUp"
              />
              <div style={{ height: 22 }} />
              <ResourceView
                rows={data.transfers}
                rowId={(t) => t.id}
                columns={transferColumns}
                search={(t) => `${empName(data.employees, t.employeeId)} ${t.reason}`}
                actions={() => [{ key: 'apply', label: 'Apply' }]}
                onAction={(_, t) => applyTransfer(t)}
                form={transferForm}
                onCreate={createTransfer}
                createLabel="Record transfer"
                searchPlaceholder="Search transfers…"
                emptyText="No transfers on record."
                emptyIcon="arrowRightLeft"
              />
            </>
          ) : null}

          {tab === 'training' ? (
            <ResourceView
              rows={data.training}
              rowId={(t) => t.id}
              columns={trainingColumns}
              search={(t) => `${t.name} ${empName(data.employees, t.employeeId)} ${t.trainer}`}
              filters={[
                {
                  key: 'status',
                  label: 'All statuses',
                  options: ['Not Started', 'In Progress', 'Completed'].map((s) => ({ value: s, label: s })),
                  match: (t, v) => t.status === v,
                },
              ]}
              actions={(t) =>
                t.status !== 'Completed' ? [{ key: 'complete', label: 'Complete' }] : []
              }
              onAction={(_, t) => {
                dispatch({ type: 'update', collection: 'training', id: t.id, patch: { status: 'Completed', completion: 100 } });
                audit('Training completed', t.id);
                toast(`“${t.name}” marked complete.`, 'success');
              }}
              form={trainingForm}
              onCreate={createTraining}
              onUpdate={updateTraining}
              createLabel="Add programme"
              searchPlaceholder="Search programmes…"
              emptyIcon="graduationCap"
            />
          ) : null}

          {tab === 'exit' ? (
            <>
              <div className="info-note" style={{ marginBottom: 14 }}>
                <Icon name="info" size={14} /> Exit processing — asset return, clearance and final settlement — lives in{' '}
                <button className="link" onClick={() => navigate(PAGE_PATH.Offboarding)} type="button">
                  Offboarding
                </button>
                .
              </div>
              <ResourceView
                rows={data.exits}
                rowId={(x) => x.id}
                columns={exitColumns}
                search={(x) => `${empName(data.employees, x.employeeId)} ${x.reason}`}
                detail={(x) => [
                  'Exit',
                  ['Employee', empLabelOf(x.employeeId)],
                  ['Resignation date', niceDate(x.resignationDate)],
                  ['Last working day', niceDate(x.lastDay)],
                  ['Notice period', x.noticePeriod],
                  ['Reason', x.reason],
                  'Checklist',
                  ['Asset return', x.assetReturn],
                  ['Clearance', x.clearance],
                  ['Final settlement', x.settlement],
                  ['Status', x.status],
                ]}
                searchPlaceholder="Search exits…"
                emptyText="No exit records."
                emptyIcon="userMinus"
              />
            </>
          ) : null}
        </div>

        {/* One-time credential success modal — shown once after creation. */}
        {creatingCredential ? (
          <CredentialModal
            open
            onClose={() => setCreatingCredential(null)}
            data={creatingCredential}
          />
        ) : null}

        {/* Credential management dialogs (permission-aware). */}
        {credTarget ? (
          <>
            <ResetPasswordDialog
              open={resetOpen}
              onClose={() => setResetOpen(false)}
              employeeId={credTarget.id}
              employeeName={credTarget.name}
              onSuccess={() => {
                setResetOpen(false);
                setCredTarget(null);
              }}
            />
            <InviteDialog
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              employeeId={credTarget.id}
              employeeName={credTarget.name}
              onSuccess={() => {
                setInviteOpen(false);
                setCredTarget(null);
              }}
            />
            <AccountStatusDialog
              open={statusOpen}
              onClose={() => setStatusOpen(false)}
              employeeId={credTarget.id}
              employeeName={credTarget.name}
              currentStatus={credTarget.status}
              onSuccess={() => {
                setStatusOpen(false);
                setCredTarget(null);
              }}
            />
            <ActivityHistory
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              employeeId={credTarget.id}
              employeeName={credTarget.name}
            />
          </>
        ) : null}
      </section>
    </div>
  );

  function empLabelOf(id: string | null): string {
    if (!id) return '—';
    const e = data.employees.find((x) => x.id === id);
    return e ? `${e.name} · ${e.id}` : id;
  }
}
