/* ============================================================
   Recruitment — jobs, the candidate pipeline, interviews,
   offers and onboarding, wired to one another:

   candidate → interview → offer → accepted → onboarding → roster
   ============================================================ */
import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { DetailList, EmpCell, EmptyState, InlineBar, Pill, StatRow, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { deptName, empName } from '@/lib/lookups';
import { buildRosterId, money } from '@/lib/format';
import { niceDate } from '@/lib/date';
import type { Candidate, Interview, Job, Offer, Onboarding, Employee } from '@/types';
import { PIPELINE } from '@/types';

type TabKey = 'jobs' | 'candidates' | 'interviews' | 'offers' | 'onboarding';

const STAGE_COLORS = [
  '#7FD4C1', '#63BBA8', '#509888', '#3F7A6E', '#2F5D54', '#8B5CF6', '#3B82F6', '#F59E0B', '#22C55E', '#16A34A', '#EF4444',
];

function nextStage(stage: Candidate['stage']): Candidate['stage'] {
  const idx = PIPELINE.indexOf(stage);
  if (idx < 0 || idx >= PIPELINE.length - 2) return stage; // never auto-advance into Rejected/Hired via "next"
  return PIPELINE[idx + 1] ?? stage;
}

export function RecruitmentPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { canSeeSalary } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('jobs');
  const [boardMode, setBoardMode] = useState<'board' | 'table'>('board');
  const [candidateDetail, setCandidateDetail] = useState<Candidate | null>(null);
  const [interviewDone, setInterviewDone] = useState<Interview | null>(null);
  const [intRating, setIntRating] = useState('4/5');
  const [intFeedback, setIntFeedback] = useState('');

  const jobTitle = (id: string) => data.jobs.find((j) => j.id === id)?.title ?? id;
  const jobDept = (id: string) => {
    const job = data.jobs.find((j) => j.id === id);
    return job ? deptName(data.departments, job.dept) : '—';
  };
  const candidateName = (id: string) => data.candidates.find((c) => c.id === id)?.name ?? id;

  const stageCount = (stage: string) => data.candidates.filter((c) => c.stage === stage).length;

  /* ---------------- jobs ---------------- */
  const jobColumns = useMemo(() => {
    const cols = [
      { header: 'Position', render: (j: Job) => <b>{j.title}</b> },
      { header: 'Department', render: (j: Job) => deptName(data.departments, j.dept) },
      { header: 'Mode', render: (j: Job) => `${j.employmentType} · ${j.workMode}` },
      { header: 'Experience', render: (j: Job) => j.experience },
      { header: 'Vacancies', render: (j: Job) => <span className="num">{j.vacancies}</span>, num: true },
      { header: 'Applicants', render: (j: Job) => <span className="num">{data.candidates.filter((c) => c.jobId === j.id).length}</span>, num: true },
      { header: 'Deadline', render: (j: Job) => <span className="num">{niceDate(j.deadline)}</span> },
      { header: 'Status', render: (j: Job) => <Pill status={j.status} /> },
    ];
    if (canSeeSalary) cols.push({ header: 'Band', render: (j: Job) => <span className="num">{`${j.salMin} – ${j.salMax}`}</span> });
    return cols;
  }, [data.departments, data.candidates, canSeeSalary]);

  const jobForm = useMemo<FieldDef[]>(() => {
    const fields: FieldDef[] = [
      { key: 'title', label: 'Job title', required: true },
      { key: 'dept', label: 'Department', type: 'select', options: data.departments.map((d) => ({ value: d.id, label: d.name })) },
      { key: 'designation', label: 'Designation', type: 'select', options: data.designations.map((d) => ({ value: d.title, label: d.title })) },
      { key: 'location', label: 'Location', type: 'select', options: ['Noida', 'Gurugram', 'Remote'].map((l) => ({ value: l, label: l })) },
      { key: 'employmentType', label: 'Employment type', type: 'select', options: ['Full-time', 'Part-time', 'Contract', 'Intern'].map((t) => ({ value: t, label: t })) },
      { key: 'workMode', label: 'Work mode', type: 'select', options: ['On-site', 'Hybrid', 'Remote'].map((t) => ({ value: t, label: t })) },
      { key: 'experience', label: 'Experience', placeholder: '2-4 yrs' },
      { key: 'qualification', label: 'Qualification' },
      { key: 'skills', label: 'Skills', placeholder: 'React, TypeScript…' },
      { key: 'vacancies', label: 'Vacancies', type: 'number' },
      { key: 'deadline', label: 'Deadline', type: 'date' },
      { key: 'recruiter', label: 'Recruiter', type: 'select', options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
      { key: 'description', label: 'Description', type: 'textarea', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Published', 'Open', 'On Hold', 'Closed'].map((s) => ({ value: s, label: s })) },
    ];
    if (canSeeSalary) {
      fields.splice(10, 0, { key: 'salMin', label: 'Salary band from', placeholder: '₹6.0L' });
      fields.splice(11, 0, { key: 'salMax', label: 'Salary band to', placeholder: '₹12.0L' });
    }
    return fields;
  }, [data.departments, data.designations, data.employees, canSeeSalary]);

  const createJob = (values: Record<string, string>) => {
    const id = nextId('JOB-', 3);
    dispatch({
      type: 'add',
      collection: 'jobs',
      item: {
        id,
        title: values.title,
        dept: values.dept,
        designation: values.designation ?? '',
        location: values.location,
        employmentType: values.employmentType as Job['employmentType'],
        workMode: values.workMode as Job['workMode'],
        experience: values.experience,
        qualification: values.qualification,
        skills: values.skills,
        salMin: values.salMin || '—',
        salMax: values.salMax || '—',
        vacancies: Number(values.vacancies || 1),
        deadline: values.deadline,
        recruiter: values.recruiter,
        description: values.description,
        status: (values.status as Job['status']) || 'Draft',
      } satisfies Job,
    });
    audit('Job created', `${values.title} (${id})`);
    notify(`New opening published: ${values.title}`);
    toast('Job opening created.', 'success');
  };

  const updateJob = (row: Job, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'jobs',
      id: row.id,
      patch: {
        ...values,
        vacancies: Number(values.vacancies || 1),
        salMin: values.salMin ?? row.salMin,
        salMax: values.salMax ?? row.salMax,
      },
    });
    audit('Job updated', row.id);
    toast('Job opening updated.', 'success');
  };

  const toggleJobStatus = (j: Job, status: Job['status']) => {
    dispatch({ type: 'update', collection: 'jobs', id: j.id, patch: { status } });
    audit(`Job ${status.toLowerCase()}`, `${j.title} (${j.id})`);
    toast(`${j.title} → ${status}.`, 'success');
  };

  /* ---------------- candidates ---------------- */
  const candidateColumns = [
    { header: 'Candidate', render: (c: Candidate) => <EmpCell name={c.name} sub={c.email} seed={c.id} /> },
    { header: 'Applied for', render: (c: Candidate) => jobTitle(c.jobId) },
    { header: 'Experience', render: (c: Candidate) => c.experience },
    { header: 'Source', render: (c: Candidate) => c.source },
    { header: 'Applied', render: (c: Candidate) => <span className="num">{niceDate(c.applied)}</span> },
    { header: 'Stage', render: (c: Candidate) => <Pill status={c.stage} /> },
  ];

  const candidateForm: FieldDef[] = [
    { key: 'name', label: 'Candidate name', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'location', label: 'Location' },
    { key: 'qualification', label: 'Qualification' },
    { key: 'experience', label: 'Experience' },
    { key: 'skills', label: 'Skills' },
    { key: 'jobId', label: 'Job', type: 'select', required: true, options: data.jobs.map((j) => ({ value: j.id, label: j.title })) },
    { key: 'source', label: 'Source', type: 'select', options: ['LinkedIn', 'Naukri', 'Referral', 'Careers page', 'Job fair'].map((s) => ({ value: s, label: s })) },
    { key: 'recruiter', label: 'Recruiter', type: 'select', options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'applied', label: 'Applied on', type: 'date' },
    { key: 'stage', label: 'Stage', type: 'select', options: PIPELINE.map((s) => ({ value: s, label: s })) },
    { key: 'notes', label: 'Notes', type: 'textarea', half: true },
  ];

  const createCandidate = (values: Record<string, string>) => {
    const id = nextId('CAN-', 4);
    dispatch({
      type: 'add',
      collection: 'candidates',
      item: {
        id,
        name: values.name,
        email: values.email,
        phone: values.phone || '—',
        location: values.location || '—',
        qualification: values.qualification || '—',
        experience: values.experience || '—',
        skills: values.skills || '—',
        jobId: values.jobId,
        applied: values.applied,
        recruiter: values.recruiter,
        source: values.source || 'LinkedIn',
        stage: (values.stage as Candidate['stage']) || 'Applied',
        notes: values.notes || '',
      } satisfies Candidate,
    });
    audit('Candidate added', `${values.name} (${id})`);
    toast('Candidate added to the pipeline.', 'success');
  };

  const advanceCandidate = (c: Candidate) => {
    const to = nextStage(c.stage);
    if (to === c.stage) {
      toast('This candidate has reached the end of the pipeline.', 'info');
      return;
    }
    dispatch({ type: 'update', collection: 'candidates', id: c.id, patch: { stage: to } });
    audit('Candidate advanced', `${c.name} → ${to}`);
    notify(`${c.name} moved to ${to}`);
    toast(`${c.name} → ${to}.`, 'success');
    setCandidateDetail((prev) => (prev && prev.id === c.id ? { ...prev, stage: to } : prev));
  };

  const rejectCandidate = (c: Candidate) => {
    dispatch({ type: 'update', collection: 'candidates', id: c.id, patch: { stage: 'Rejected' } });
    audit('Candidate rejected', c.name);
    toast(`${c.name} marked as rejected.`, 'info');
    setCandidateDetail(null);
  };

  /* ---------------- interviews ---------------- */
  const interviewColumns = [
    { header: 'Candidate', render: (i: Interview) => <EmpCell name={candidateName(i.candidateId)} sub={jobTitle(data.candidates.find((c) => c.id === i.candidateId)?.jobId ?? '')} seed={i.candidateId} /> },
    { header: 'Round', render: (i: Interview) => i.type },
    { header: 'When', render: (i: Interview) => <span className="num">{`${niceDate(i.date)} · ${i.time}`}</span> },
    { header: 'Interviewer', render: (i: Interview) => empName(data.employees, i.interviewer) },
    { header: 'Mode', render: (i: Interview) => i.mode },
    { header: 'Status', render: (i: Interview) => <Pill status={i.status} /> },
    { header: 'Rating', render: (i: Interview) => <span className="num">{i.rating || '—'}</span> },
  ];

  const interviewForm: FieldDef[] = [
    { key: 'candidateId', label: 'Candidate', type: 'select', required: true, options: data.candidates.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'type', label: 'Round', type: 'select', options: ['Screening Call', 'Technical Interview', 'HR Interview', 'Final Interview'].map((t) => ({ value: t, label: t })) },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'time', label: 'Time', placeholder: '11:00 AM' },
    { key: 'interviewer', label: 'Interviewer', type: 'select', options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'mode', label: 'Mode', type: 'select', options: ['Video', 'On-site', 'Phone'].map((m) => ({ value: m, label: m })) },
    { key: 'link', label: 'Meeting link' },
    { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'Completed', 'Cancelled', 'Pending Feedback'].map((s) => ({ value: s, label: s })) },
  ];

  const createInterview = (values: Record<string, string>) => {
    const id = nextId('INT-', 3);
    dispatch({
      type: 'add',
      collection: 'interviews',
      item: {
        id,
        candidateId: values.candidateId,
        type: values.type,
        date: values.date,
        time: values.time || '—',
        interviewer: values.interviewer,
        mode: (values.mode as Interview['mode']) || 'Video',
        link: values.link || '',
        status: values.status || 'Scheduled',
        rating: '',
        feedback: '',
      } satisfies Interview,
    });
    audit('Interview scheduled', id);
    toast('Interview scheduled.', 'success');
  };

  const saveInterviewFeedback = () => {
    if (!interviewDone) return;
    dispatch({
      type: 'update',
      collection: 'interviews',
      id: interviewDone.id,
      patch: { status: 'Completed', rating: intRating, feedback: intFeedback },
    });
    audit('Interview feedback', interviewDone.id);
    toast('Interview marked completed with feedback.', 'success');
    setInterviewDone(null);
  };

  /* ---------------- offers ---------------- */
  const offerColumns = [
    { header: 'Candidate', render: (o: Offer) => <EmpCell name={candidateName(o.candidateId)} sub={jobTitle(o.jobId)} seed={o.candidateId} /> },
    { header: 'Joining', render: (o: Offer) => <span className="num">{niceDate(o.joining)}</span> },
    { header: 'Salary', render: (o: Offer) => <span className="num">{canSeeSalary ? money(o.salary) : '•••'}</span> },
    { header: 'Manager', render: (o: Offer) => empName(data.employees, o.manager) },
    { header: 'Sent', render: (o: Offer) => <span className="num">{niceDate(o.offerDate)}</span> },
    { header: 'Expiry', render: (o: Offer) => <span className="num">{niceDate(o.expiry)}</span> },
    { header: 'Status', render: (o: Offer) => <Pill status={o.status} /> },
  ];

  const offerForm: FieldDef[] = [
    { key: 'candidateId', label: 'Candidate', type: 'select', required: true, options: data.candidates.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'jobId', label: 'Job', type: 'select', required: true, options: data.jobs.map((j) => ({ value: j.id, label: j.title })) },
    { key: 'joining', label: 'Joining date', type: 'date', required: true },
    ...(canSeeSalary ? ([{ key: 'salary', label: 'Monthly in-hand (₹)', type: 'number', required: true }] as FieldDef[]) : []),
    { key: 'employmentType', label: 'Employment type', type: 'select', options: ['Full-time', 'Part-time', 'Contract', 'Intern'].map((t) => ({ value: t, label: t })) },
    { key: 'manager', label: 'Reporting manager', type: 'select', options: data.employees.map((e) => ({ value: e.id, label: e.name })) },
    { key: 'offerDate', label: 'Offer date', type: 'date' },
    { key: 'expiry', label: 'Expiry', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Withdrawn'].map((s) => ({ value: s, label: s })) },
  ];

  const createOffer = (values: Record<string, string>) => {
    const id = nextId('OFF-', 3);
    dispatch({
      type: 'add',
      collection: 'offers',
      item: {
        id,
        candidateId: values.candidateId,
        jobId: values.jobId,
        joining: values.joining,
        salary: Number(values.salary || 0),
        employmentType: (values.employmentType as Offer['employmentType']) || 'Full-time',
        manager: values.manager,
        offerDate: values.offerDate,
        expiry: values.expiry,
        status: (values.status as Offer['status']) || 'Draft',
      } satisfies Offer,
    });
    audit('Offer drafted', id);
    toast('Offer created.', 'success');
  };

  const acceptOffer = (o: Offer) => {
    dispatch({ type: 'update', collection: 'offers', id: o.id, patch: { status: 'Accepted' } });
    dispatch({ type: 'update', collection: 'candidates', id: o.candidateId, patch: { stage: 'Offer Accepted' } });
    const job = data.jobs.find((j) => j.id === o.jobId);
    const cand = data.candidates.find((c) => c.id === o.candidateId);
    if (cand && !data.onboarding.some((x) => x.candidateId === cand.id)) {
      const onbId = nextId('ONB-', 3);
      dispatch({
        type: 'add',
        collection: 'onboarding',
        item: {
          id: onbId,
          candidateId: cand.id,
          name: cand.name,
          dept: job?.dept ?? 'DEP-02',
          joining: o.joining,
          done: [],
        } satisfies Onboarding,
      });
      toast(`Offer accepted — onboarding started for ${cand.name}.`, 'success');
    } else {
      toast('Offer marked accepted.', 'success');
    }
    audit('Offer accepted', o.id);
    notify(`${cand?.name ?? o.candidateId} accepted the offer`);
  };

  const offerStatus = (o: Offer, status: Offer['status']) => {
    dispatch({ type: 'update', collection: 'offers', id: o.id, patch: { status } });
    audit(`Offer ${status.toLowerCase()}`, o.id);
    toast(`Offer ${status.toLowerCase()}.`, status === 'Sent' ? 'success' : 'info');
  };

  /* ---------------- onboarding ---------------- */
  const toggleOnboardingItem = (record: Onboarding, item: string) => {
    const done = record.done.includes(item) ? record.done.filter((x) => x !== item) : [...record.done, item];
    dispatch({ type: 'update', collection: 'onboarding', id: record.id, patch: { done } });
  };

  const completeOnboarding = (record: Onboarding) => {
    const cand = data.candidates.find((c) => c.id === record.candidateId);
    const offer = data.offers.find((o) => o.candidateId === record.candidateId && o.status === 'Accepted');
    const id = buildRosterId(record.name, data.employees.length);
    const employee: Employee = {
      id,
      name: record.name,
      email: cand?.email ?? `${record.name.toLowerCase().replace(/\s+/g, '.')}@cyethack.com`,
      phone: cand?.phone ?? '—',
      gender: 'Male',
      dob: '1998-01-01',
      dept: record.dept,
      designation: offer ? (data.jobs.find((j) => j.id === offer.jobId)?.designation ?? '—') : '—',
      manager: offer?.manager ?? null,
      location: 'Noida',
      employmentType: offer?.employmentType ?? 'Full-time',
      joining: record.joining,
      status: 'Probation',
      probation: true,
      experience: cand?.experience ?? '—',
      salary: offer?.salary ?? 0,
      grade: 'E1',
    };
    dispatch({ type: 'add', collection: 'employees', item: employee });
    dispatch({ type: 'update', collection: 'candidates', id: record.candidateId, patch: { stage: 'Hired' } });
    dispatch({ type: 'remove', collection: 'onboarding', id: record.id });
    audit('Onboarding completed', `${record.name} → ${id}`);
    notify(`${record.name} joined as ${employee.designation}`);
    toast(`${record.name} added to the roster (${id}).`, 'success');
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'jobs', label: `Jobs (${data.jobs.length})` },
    { key: 'candidates', label: `Candidates (${data.candidates.length})` },
    { key: 'interviews', label: `Interviews (${data.interviews.length})` },
    { key: 'offers', label: `Offers (${data.offers.length})` },
    { key: 'onboarding', label: `Onboarding (${data.onboarding.length})` },
  ];

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Recruitment</h2>
            <div className="sub">Open roles, the live pipeline, scheduling, offers and new-joiner onboarding</div>
          </div>
          <div className="tools">
            <span className="chip">
              {data.jobs.filter((j) => j.status === 'Open' || j.status === 'Published').length} open roles
            </span>
            <span className="chip">{data.candidates.filter((c) => c.stage !== 'Rejected' && c.stage !== 'Hired').length} active candidates</span>
          </div>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

        <div style={{ marginTop: 16 }}>
          {tab === 'jobs' ? (
            <ResourceView
              rows={data.jobs}
              rowId={(j) => j.id}
              columns={jobColumns}
              search={(j) => `${j.title} ${j.skills} ${deptName(data.departments, j.dept)}`}
              filters={[
                {
                  key: 'status',
                  label: 'All statuses',
                  options: ['Draft', 'Published', 'Open', 'On Hold', 'Closed'].map((s) => ({ value: s, label: s })),
                  match: (j, v) => j.status === v,
                },
                {
                  key: 'dept',
                  label: 'All departments',
                  options: data.departments.map((d) => ({ value: d.id, label: d.name })),
                  match: (j, v) => j.dept === v,
                },
              ]}
              summary={[
                { k: 'Open roles', v: data.jobs.filter((j) => j.status === 'Open' || j.status === 'Published').length },
                { k: 'Vacancies', v: data.jobs.filter((j) => j.status !== 'Closed').reduce((s, j) => s + j.vacancies, 0) },
                { k: 'Drafts', v: data.jobs.filter((j) => j.status === 'Draft').length },
                { k: 'Closed', v: data.jobs.filter((j) => j.status === 'Closed').length },
              ]}
              actions={(j) => {
                const acts: Array<{ key: string; label: string; variant?: 'outline' | 'danger' | 'ghost' }> = [];
                if (j.status === 'Draft') acts.push({ key: 'publish', label: 'Publish' });
                if (j.status === 'Published' || j.status === 'On Hold') acts.push({ key: 'open', label: 'Open' });
                if (j.status === 'Open') acts.push({ key: 'hold', label: 'Hold', variant: 'ghost' });
                if (j.status !== 'Closed') acts.push({ key: 'close', label: 'Close', variant: 'danger' });
                return acts;
              }}
              onAction={(key, j) => {
                if (key === 'publish') toggleJobStatus(j, 'Published');
                if (key === 'open') toggleJobStatus(j, 'Open');
                if (key === 'hold') toggleJobStatus(j, 'On Hold');
                if (key === 'close') toggleJobStatus(j, 'Closed');
              }}
              detail={(j) => [
                'Role',
                ['Title', j.title],
                ['Department', deptName(data.departments, j.dept)],
                ['Location', `${j.location} · ${j.workMode}`],
                ['Employment type', j.employmentType],
                ['Experience', j.experience],
                ['Qualification', j.qualification],
                ['Skills', j.skills],
                ...(canSeeSalary ? ([['Band', `${j.salMin} – ${j.salMax}`]] as Array<[string, ReactNode]>) : []),
                'Hiring',
                ['Vacancies', String(j.vacancies)],
                ['Deadline', niceDate(j.deadline)],
                ['Recruiter', empName(data.employees, j.recruiter)],
                ['Applicants', String(data.candidates.filter((c) => c.jobId === j.id).length)],
                ['Description', j.description],
              ]}
              form={jobForm}
              onCreate={createJob}
              onUpdate={updateJob}
              createLabel="Add job"
              searchPlaceholder="Search roles, skills…"
              emptyIcon="briefcase"
            />
          ) : null}

          {tab === 'candidates' ? (
            <>
              <div className="toolbar">
                <div className="segmented" role="tablist" aria-label="Candidate view">
                  <button className={`seg-btn${boardMode === 'board' ? ' on' : ''}`} onClick={() => setBoardMode('board')} type="button">
                    <Icon name="dashboard" size={13} /> Board
                  </button>
                  <button className={`seg-btn${boardMode === 'table' ? ' on' : ''}`} onClick={() => setBoardMode('table')} type="button">
                    <Icon name="clipboardList" size={13} /> Table
                  </button>
                </div>
                <span className="spacer" />
                <span className="chip">
                  {data.candidates.filter((c) => c.stage !== 'Rejected').length} active · {stageCount('Rejected')} rejected
                </span>
              </div>

              {boardMode === 'board' ? (
                <div className="board">
                  {PIPELINE.map((stage, i) => {
                    const items = data.candidates.filter((c) => c.stage === stage);
                    return (
                      <div className="board-col" key={stage}>
                        <h4>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="cal-dot" style={{ background: STAGE_COLORS[i % STAGE_COLORS.length] }} />
                            {stage}
                          </span>
                          <span>{items.length}</span>
                        </h4>
                        {items.map((c) => (
                          <button
                            key={c.id}
                            className="board-card"
                            style={{ width: '100%', textAlign: 'left' }}
                            onClick={() => setCandidateDetail(c)}
                            type="button"
                          >
                            <b>{c.name}</b>
                            <span>
                              {jobTitle(c.jobId)} · {c.experience}
                            </span>
                          </button>
                        ))}
                        {items.length === 0 ? (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Empty</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ResourceView
                  rows={data.candidates}
                  rowId={(c) => c.id}
                  columns={candidateColumns}
                  search={(c) => `${c.name} ${c.email} ${c.skills} ${jobTitle(c.jobId)}`}
                  filters={[
                    {
                      key: 'stage',
                      label: 'All stages',
                      options: PIPELINE.map((s) => ({ value: s, label: s })),
                      match: (c, v) => c.stage === v,
                    },
                    {
                      key: 'job',
                      label: 'All jobs',
                      options: data.jobs.map((j) => ({ value: j.id, label: j.title })),
                      match: (c, v) => c.jobId === v,
                    },
                  ]}
                  actions={(c) =>
                    c.stage === 'Rejected' || c.stage === 'Hired'
                      ? []
                      : [
                          { key: 'advance', label: 'Advance' },
                          { key: 'reject', label: 'Reject', variant: 'danger' as const },
                        ]
                  }
                  onAction={(key, c) => (key === 'advance' ? advanceCandidate(c) : rejectCandidate(c))}
                  detail={(c) => [
                    'Candidate',
                    ['Name', c.name],
                    ['Email', c.email],
                    ['Phone', c.phone],
                    ['Location', c.location],
                    ['Qualification', c.qualification],
                    ['Experience', c.experience],
                    ['Skills', c.skills],
                    'Application',
                    ['Applied for', jobTitle(c.jobId)],
                    ['Department', jobDept(c.jobId)],
                    ['Source', c.source],
                    ['Applied on', niceDate(c.applied)],
                    ['Recruiter', empName(data.employees, c.recruiter)],
                    ['Stage', <Pill status={c.stage} key="st" />],
                    ['Notes', c.notes || '—'],
                  ]}
                  form={candidateForm}
                  onCreate={createCandidate}
                  createLabel="Add candidate"
                  searchPlaceholder="Search candidates…"
                  emptyIcon="users"
                />
              )}
            </>
          ) : null}

          {tab === 'interviews' ? (
            <ResourceView
              rows={data.interviews}
              rowId={(i) => i.id}
              columns={interviewColumns}
              search={(i) => `${candidateName(i.candidateId)} ${i.type} ${i.interviewer}`}
              filters={[
                {
                  key: 'status',
                  label: 'All statuses',
                  options: ['Scheduled', 'Completed', 'Cancelled', 'Pending Feedback'].map((s) => ({ value: s, label: s })),
                  match: (i, v) => i.status === v,
                },
              ]}
              actions={(i) => (i.status === 'Scheduled' || i.status === 'Pending Feedback' ? [{ key: 'complete', label: 'Feedback' }] : [])}
              onAction={(_, i) => {
                setInterviewDone(i);
                setIntRating(i.rating || '4/5');
                setIntFeedback(i.feedback);
              }}
              detail={(i) => [
                'Interview',
                ['Candidate', candidateName(i.candidateId)],
                ['Round', i.type],
                ['Date', `${niceDate(i.date)} · ${i.time}`],
                ['Interviewer', empName(data.employees, i.interviewer)],
                ['Mode', i.mode],
                ['Meeting link', i.link || '—'],
                ['Status', <Pill status={i.status} key="st" />],
                ['Rating', i.rating || '—'],
                ['Feedback', i.feedback || '—'],
              ]}
              form={interviewForm}
              onCreate={createInterview}
              createLabel="Schedule interview"
              searchPlaceholder="Search interviews…"
              emptyIcon="calendar"
            />
          ) : null}

          {tab === 'offers' ? (
            <ResourceView
              rows={data.offers}
              rowId={(o) => o.id}
              columns={offerColumns}
              search={(o) => `${candidateName(o.candidateId)} ${jobTitle(o.jobId)}`}
              filters={[
                {
                  key: 'status',
                  label: 'All statuses',
                  options: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Withdrawn'].map((s) => ({ value: s, label: s })),
                  match: (o, v) => o.status === v,
                },
              ]}
              actions={(o) => {
                const acts: Array<{ key: string; label: string; variant?: 'danger' | 'ghost' }> = [];
                if (o.status === 'Draft') acts.push({ key: 'send', label: 'Send' });
                if (o.status === 'Sent') {
                  acts.push({ key: 'accept', label: 'Accept' });
                  acts.push({ key: 'withdraw', label: 'Withdraw', variant: 'danger' });
                }
                return acts;
              }}
              onAction={(key, o) => {
                if (key === 'send') offerStatus(o, 'Sent');
                if (key === 'accept') acceptOffer(o);
                if (key === 'withdraw') offerStatus(o, 'Withdrawn');
              }}
              detail={(o) => [
                'Offer',
                ['Candidate', candidateName(o.candidateId)],
                ['Role', jobTitle(o.jobId)],
                ['Department', jobDept(o.jobId)],
                ['Joining date', niceDate(o.joining)],
                ...(canSeeSalary ? ([['Monthly in-hand', money(o.salary)]] as Array<[string, ReactNode]>) : []),
                ['Employment type', o.employmentType],
                ['Reporting manager', empName(data.employees, o.manager)],
                ['Offer date', niceDate(o.offerDate)],
                ['Expiry', niceDate(o.expiry)],
                ['Status', <Pill status={o.status} key="st" />],
              ]}
              form={offerForm}
              onCreate={createOffer}
              createLabel="Create offer"
              searchPlaceholder="Search offers…"
              emptyIcon="fileText"
            />
          ) : null}

          {tab === 'onboarding' ? (
            data.onboarding.length === 0 ? (
              <EmptyState
                icon="userPlus"
                title="No new joiners in onboarding"
                sub="Accept an offer in the Offers tab and an onboarding checklist is created automatically."
              />
            ) : (
              <div className="grid">
                {data.onboarding.map((record) => {
                  const allDone = data.onboardingItems.every((item) => record.done.includes(item));
                  const doneCount = record.done.length;
                  return (
                    <section className="card span6" key={record.id}>
                      <div className="card-head">
                        <div>
                          <h2>{record.name}</h2>
                          <div className="sub">
                            {deptName(data.departments, record.dept)} · joining {niceDate(record.joining)}
                          </div>
                        </div>
                        <span className="chip">
                          {doneCount}/{data.onboardingItems.length}
                        </span>
                      </div>
                      <InlineBar value={(doneCount / data.onboardingItems.length) * 100} />
                      <ul className="checklist">
                        {data.onboardingItems.map((item) => {
                          const done = record.done.includes(item);
                          return (
                            <li key={item}>
                              <input
                                type="checkbox"
                                checked={done}
                                onChange={() => toggleOnboardingItem(record, item)}
                                id={`${record.id}-${item}`}
                              />
                              <label htmlFor={`${record.id}-${item}`} className={done ? 'done' : undefined} style={{ cursor: 'pointer' }}>
                                {item}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <div style={{ marginTop: 14 }}>
                        <button className="btn btn-primary btn-sm" disabled={!allDone} onClick={() => completeOnboarding(record)} type="button">
                          <Icon name="userCheck" size={14} /> {allDone ? 'Add to roster' : 'Complete the checklist first'}
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </section>

      {candidateDetail ? (
        <Modal
          title={`Candidate — ${candidateDetail.name}`}
          onClose={() => setCandidateDetail(null)}
          large
          footer={
            <>
              <button className="btn btn-danger-outline" onClick={() => rejectCandidate(candidateDetail)} type="button">
                Reject
              </button>
              <button className="btn btn-primary" onClick={() => advanceCandidate(candidateDetail)} type="button">
                <Icon name="arrowRightLeft" size={14} /> Advance stage
              </button>
            </>
          }
        >
          <DetailList
            rows={[
              'Candidate',
              ['Email', candidateDetail.email],
              ['Phone', candidateDetail.phone],
              ['Location', candidateDetail.location],
              ['Qualification', candidateDetail.qualification],
              ['Experience', candidateDetail.experience],
              ['Skills', candidateDetail.skills],
              'Application',
              ['Applied for', jobTitle(candidateDetail.jobId)],
              ['Department', jobDept(candidateDetail.jobId)],
              ['Source', candidateDetail.source],
              ['Applied on', niceDate(candidateDetail.applied)],
              ['Recruiter', empName(data.employees, candidateDetail.recruiter)],
              ['Stage', <Pill status={candidateDetail.stage} key="st" />],
              ['Notes', candidateDetail.notes || '—'],
            ]}
          />
          <div style={{ marginTop: 16 }}>
            <StatRow
              items={[
                { k: 'Interviews', v: data.interviews.filter((i) => i.candidateId === candidateDetail.id).length },
                { k: 'Offers', v: data.offers.filter((o) => o.candidateId === candidateDetail.id).length },
                { k: 'Pipeline position', v: `${PIPELINE.indexOf(candidateDetail.stage) + 1}/${PIPELINE.length}` },
              ]}
            />
          </div>
        </Modal>
      ) : null}

      {interviewDone ? (
        <Modal
          title={`Interview feedback — ${candidateName(interviewDone.candidateId)}`}
          onClose={() => setInterviewDone(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setInterviewDone(null)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveInterviewFeedback} type="button">
                Save feedback
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="int-rating">Rating</label>
            <select id="int-rating" value={intRating} onChange={(e) => setIntRating(e.target.value)}>
              {['1/5', '2/5', '3/5', '4/5', '5/5'].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="int-feedback">Feedback</label>
            <textarea id="int-feedback" value={intFeedback} onChange={(e) => setIntFeedback(e.target.value)} placeholder="Strengths, concerns, recommendation…" />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
