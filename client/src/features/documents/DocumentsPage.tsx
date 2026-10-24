/* ============================================================
   Documents — Company Resources & Employee Documents
   
   Company Resources: Company-wide documents (HR Manual, Policies, Circulars, Forms)
   Employee Documents: Employee-specific documents (offer letters, ID proofs, certificates)
   
   Server sessions: metadata comes from the authenticated register
   API; files are uploaded to the server's file service (Google
   Drive behind the scenes) and viewed/downloaded through
   authenticated endpoints — the browser never receives storage
   keys or provider links. Demo sessions keep the local register.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { Modal } from '@/components/ui/Modal';
import { Pill, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDrill } from '@/lib/useDrill';
import { isApiSession } from '@/api/client';
import { downloadBlob, documentErrorMessage, fetchDocumentBlob, openDocument } from '@/api/documents';
import { officialUploadDocument, officialVerifyDocument } from '@/store/apiBridge';
import { niceDate } from '@/lib/date';
import { filterDemoEmployees } from '@/lib/lookups';
import type { DocumentRecord } from '@/types';

const DOC_TYPES = [
  'Offer Letter',
  'Joining Document',
  'ID Document',
  'Qualification',
  'Experience Letter',
  'Resume/CV',
  'Policy Acknowledgement',
  'Payslip',
  'HR Manual',
  'Company Circular',
];

const DOC_STATUSES: Array<DocumentRecord['status']> = ['Pending', 'Verified', 'Signed'];

/** Categories the server register accepts (enum on POST /api/documents). */
const API_CATEGORIES = [
  'Company Document',
  'HR Manual',
  'Policy',
  'Circular Document',
  'Contract',
  'Payslip',
  'ID Proof',
  'Certificate',
  'Personal Document',
  'Other',
];

/** Select sentinel for documents that belong to the whole company. */
const OWNER_ALL = 'ALL';

/** Company resource folders/categories for organization. */
const COMPANY_FOLDERS = [
  { id: 'hr-manual', name: 'HR Manual', icon: 'bookOpen' },
  { id: 'hr-policies', name: 'HR Policies', icon: 'shield' },
  { id: 'on-site-manual', name: 'On-site Manual', icon: 'bookOpen' },
  { id: 'on-site-policies', name: 'On-site Policies', icon: 'shield' },
  { id: 'code-of-conduct', name: 'Code of Conduct', icon: 'shield' },
  { id: 'employee-guidelines', name: 'Employee Guidelines', icon: 'bookOpen' },
  { id: 'company-circulars', name: 'Company Circulars', icon: 'megaphone' },
  { id: 'company-forms', name: 'Company Forms', icon: 'fileText' },
  { id: 'other', name: 'Other Resources', icon: 'folder' },
] as const;

interface UploadModalProps {
  canManage: boolean;
  isAdmin: boolean;
  myId: string;
  employees: Array<{ id: string; name: string }>;
  onClose: () => void;
}

/** Server-session upload: file → the document service behind the API. */
function UploadDocumentModal({ canManage, isAdmin, myId, employees, onClose }: UploadModalProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Company Document');
  const [owner, setOwner] = useState('company-wide');
  const [visibility, setVisibility] = useState<'private' | 'hr' | 'all'>('private');
  const [docType, setDocType] = useState<'company' | 'employee'>('company');
  const [folder, setFolder] = useState('hr-manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploadOwner = owner === 'company-wide' ? null : owner;
      const uploadVisibility = owner === 'company-wide' ? 'all' : visibility;
      const uploadCategory = docType === 'company' ? folder : category;
      await officialUploadDocument({
        file,
        title: title || file.name,
        category: uploadCategory,
        ownerEmployeeId: canManage && uploadOwner ? uploadOwner : null,
        visibility: canManage ? uploadVisibility : undefined,
      });
      toast(`"${title || file.name}" uploaded to the document service.`, 'success');
      onClose();
    } catch (err) {
      setError(documentErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Upload document"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button" disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} type="button" disabled={busy || !file}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      <div className="form-2col">
        <div className="field">
          <label htmlFor="doc-file">File</label>
          <input
            id="doc-file"
            type="file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError('');
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="doc-title">Title (optional)</label>
          <input
            id="doc-title"
            className="input"
            value={title}
            placeholder={file?.name ?? 'Document name'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="doc-cat">Category</label>
          <select id="doc-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {API_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {canManage ? (
          <div className="field">
            <label htmlFor="doc-type">Document Type</label>
            <select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="company">Company Resource</option>
              <option value="employee">Employee Document</option>
            </select>
          </div>
        ) : null}
        {canManage ? (
          <div className="field">
            <label htmlFor="doc-folder">Folder / Category</label>
            <select id="doc-folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
              {COMPANY_FOLDERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {canManage ? (
          <div className="field">
            <label htmlFor="doc-owner">Owner</label>
            <select id="doc-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="company-wide">Company-wide (all employees)</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.id})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {canManage ? (
          <div className="field">
            <label htmlFor="doc-vis">Access</label>
            <select
              id="doc-vis"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'private' | 'hr' | 'all')}
            >
              <option value="private">Private — the employee and HR</option>
              <option value="hr">HR only</option>
              <option value="all">Visible to all employees</option>
            </select>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" style={{ marginTop: 10, color: '#d92d20' }}>
          {error}
        </p>
      ) : null}
      <p className="sub" style={{ marginTop: 10 }}>
        The file is stored in the company document service (Google Drive); the register keeps its
        metadata and access rules, and every view or download is authorised by the server.
      </p>
    </Modal>
  );
}

export function DocumentsPage() {
  const { data, dispatch, audit, nextId } = useApp();
  const { canManage, user } = useAuth();
  const { toast } = useToast();
  const { query: seedQuery, clear } = useDrill();
  const [drill, setDrill] = useState(seedQuery);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'employee'>('company');
  const [docType, setDocType] = useState<'company' | 'employee'>('company');
  const [folder, setFolder] = useState('hr-manual');
  const api = isApiSession();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const myId = user?.employeeId ?? '';

  /* lazy-sync the drill chip when a new global-search hit arrives */
  useEffect(() => {
    setDrill(seedQuery);
  }, [seedQuery]);

  const filteredEmployees = filterDemoEmployees(data.employees);

  const ownerName = (id: string | null) => {
    if (id === null) return 'Company-wide';
    if (id.startsWith('CAN-')) return data.candidates.find((c) => c.id === id)?.name ?? id;
    return data.employees.find((e) => e.id === id)?.name ?? id;
  };

  // Company resources: documents with owner === null (company-wide)
  const companyResources = useMemo(() => {
    let docs = data.documents.filter((d) => d.owner === null);
    if (activeTab === 'company' && drill) {
      const q = drill.toLowerCase();
      docs = docs.filter((d) => `${d.name} ${d.type}`.toLowerCase().includes(q));
    }
    return docs;
  }, [data.documents, drill, activeTab]);

  // Employee documents: documents with an owner (employee-specific)
  const employeeDocuments = useMemo(() => {
    let docs = data.documents.filter((d) => d.owner !== null);
    if (activeTab === 'employee' && drill) {
      const q = drill.toLowerCase();
      docs = docs.filter((d) => `${d.name} ${d.type} ${ownerName(d.owner)}`.toLowerCase().includes(q));
    }
    return docs;
  }, [data.documents, data.employees, data.candidates, drill, activeTab]);

  // For employees: only show their own documents
  const myDocuments = useMemo(() => {
    const myId = user?.employeeId ?? '';
    return data.documents.filter((d) => d.owner === myId);
  }, [data.documents, user?.employeeId]);

  // Determine which documents to show based on role and active tab
  const rows = useMemo(() => {
    if (activeTab === 'company') {
      return companyResources;
    } else if (activeTab === 'employee') {
      if (canManage) {
        return employeeDocuments;
      }
      // Employees only see their own documents
      return myDocuments;
    }
    return [];
  }, [activeTab, companyResources, employeeDocuments, myDocuments, canManage]);

  const folderName = (id: string) => {
    return COMPANY_FOLDERS.find((f) => f.id === id)?.name ?? id;
  };

  const columns = [
    {
      header: 'Document',
      render: (d: DocumentRecord) => (
        <b>
          {d.name}
          {api && d.uploadStatus === 'missing' ? (
            <span className="sub" style={{ marginLeft: 6 }}>
              (file missing)
            </span>
          ) : null}
        </b>
      ),
    },
    { header: 'Type', render: (d: DocumentRecord) => d.type },
    { header: activeTab === 'company' ? 'Folder' : 'Owner', render: (d: DocumentRecord) => activeTab === 'company' ? folderName(d.type) : ownerName(d.owner) },
    { header: 'Uploaded', render: (d: DocumentRecord) => <span className="num">{niceDate(d.uploaded)}</span> },
    { header: 'Status', render: (d: DocumentRecord) => <Pill status={d.status} /> },
  ];

  const form: FieldDef[] = [
    { key: 'name', label: 'Document name', required: true },
    { key: 'type', label: 'Type', type: 'select', options: DOC_TYPES.map((t) => ({ value: t, label: t })) },
    {
      key: 'owner',
      label: 'Owner',
      type: 'select',
      required: true,
      options: [
        { value: OWNER_ALL, label: 'Company-wide (all employees)' },
        ...data.employees.map((e) => ({ value: e.id, label: `${e.name} (employee)` })),
        ...data.candidates.map((c) => ({ value: c.id, label: `${c.name} (candidate)` })),
      ],
    },
    { key: 'uploaded', label: 'Uploaded on', type: 'date', required: true },
    { key: 'status', label: 'Status', type: 'select', options: DOC_STATUSES.map((s) => ({ value: s, label: s })) },
  ];

  const create = (values: Record<string, string>) => {
    const id = nextId('DOC-', 2);
    const isCompanyWide = values.owner === OWNER_ALL;
    dispatch({
      type: 'add',
      collection: 'documents',
      item: {
        id,
        name: values.name,
        type: values.type,
        owner: isCompanyWide ? null : values.owner,
        uploaded: values.uploaded,
        status: (values.status as DocumentRecord['status']) || 'Pending',
      } satisfies DocumentRecord,
    });
    audit('Document added', `${values.name} (${id})`);
    toast('Document added to the register.', 'success');
  };

  const update = (row: DocumentRecord, values: Record<string, string>) => {
    const isCompanyWide = values.owner === OWNER_ALL;
    dispatch({
      type: 'update',
      collection: 'documents',
      id: row.id,
      patch: {
        name: values.name,
        type: values.type,
        owner: isCompanyWide ? null : values.owner,
        uploaded: values.uploaded,
        status: values.status,
      },
    });
    audit('Document updated', row.id);
    toast('Document updated.', 'success');
  };

  const verify = (row: DocumentRecord) => {
    dispatch({ type: 'update', collection: 'documents', id: row.id, patch: { status: 'Verified' } });
    audit('Document verified', row.id);
    toast(`"${row.name}" verified.`, 'success');
  };

  /** Row actions — server sessions stream files through the API. */
  const runAction = async (key: string, d: DocumentRecord) => {
    if (!api) {
      if (key === 'verify') verify(d);
      return;
    }
    try {
      if (key === 'open') {
        await openDocument(d.id, d.name);
      } else if (key === 'download') {
        const { blob, filename } = await fetchDocumentBlob(d.id, { download: true, fallbackName: d.name });
        downloadBlob(blob, filename);
      } else if (key === 'verify') {
        await officialVerifyDocument(d.id);
        audit('Document verified', d.id);
        toast(`"${d.name}" verified.`, 'success');
      }
    } catch (err) {
      toast(documentErrorMessage(err), 'error');
    }
  };

  const rowActions = (d: DocumentRecord) => {
    if (api) {
      const base: Array<{ key: string; label: string }> = [
        { key: 'open', label: 'Open file' },
        { key: 'download', label: 'Download' },
      ];
      if (canManage && d.status === 'Pending') base.push({ key: 'verify', label: 'Verify' });
      return base;
    }
    return canManage && d.status === 'Pending' ? [{ key: 'verify', label: 'Verify' }] : [];
  };

  // Tab configuration based on role
  const tabs = canManage
    ? [
        { key: 'company', label: `Company Resources (${companyResources.length})` },
        { key: 'employee', label: `Employee Documents (${employeeDocuments.length})` },
      ]
    : [{ key: 'employee', label: `My Documents (${myDocuments.length})` }];

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{activeTab === 'company' ? 'Company Resources' : canManage ? 'Employee Documents' : 'My Documents'}</h2>
            <div className="sub">
              {activeTab === 'company'
                ? 'Company-wide resources: HR Manual, Policies, Circulars, Forms, and other approved resources'
                : canManage
                  ? 'Employee-specific documents: offer letters, ID proofs, certificates, and personal records'
                  : 'Your personal documents: offer letters, ID proofs, certificates, and letters'}
            </div>
          </div>
          {api && canManage ? (
            <button className="btn btn-primary" type="button" onClick={() => setUploadOpen(true)}>
              <Icon name="plus" size={14} /> Upload document
            </button>
          ) : null}
        </div>

        {activeTab === 'company' ? (
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COMPANY_FOLDERS.map((f) => (
              <button
                key={f.id}
                className={`pill${folder === f.id ? ' active' : ''}`}
                onClick={() => setFolder(f.id)}
                type="button"
              >
                <Icon name={f.icon} size={14} /> {f.name}
              </button>
            ))}
          </div>
        ) : null}

        {drill ? (
          <div style={{ marginBottom: 12 }}>
            <span className="ana-drill-note">
              Search: "{drill}"
              <button onClick={() => { setDrill(''); clear(); }} type="button" aria-label="Clear search">
                ✕
              </button>
            </span>
          </div>
        ) : null}

        <ResourceView
          rows={rows}
          rowId={(d) => d.id}
          columns={columns}
          search={(d) => `${d.name} ${d.type} ${activeTab === 'company' ? d.type : ownerName(d.owner)}`}
          filters={[
            { key: 'type', label: 'All types', options: DOC_TYPES.map((t) => ({ value: t, label: t })), match: (d, v) => d.type === v },
            { key: 'status', label: 'All statuses', options: DOC_STATUSES.map((s) => ({ value: s, label: s })), match: (d, v) => d.status === v },
          ]}
          summary={[
            { k: 'Documents', v: rows.length },
            { k: 'Verified', v: rows.filter((d) => d.status === 'Verified').length },
            { k: 'Signed', v: rows.filter((d) => d.status === 'Signed').length },
            { k: 'Pending', v: rows.filter((d) => d.status === 'Pending').length },
          ]}
          actions={rowActions}
          onAction={(key, d) => void runAction(key, d)}
          detail={(d) => [
            'Document',
            ['Name', d.name],
            ['Type', d.type],
            ['Folder', activeTab === 'company' ? folderName(d.type) : '—'],
            ['Owner', ownerName(d.owner)],
            ['Uploaded', niceDate(d.uploaded)],
            ['Status', <Pill status={d.status} key="st" />],
            ['Record id', d.id],
          ]}
          form={canManage && !api ? form : undefined}
          onCreate={canManage && !api ? create : undefined}
          onUpdate={canManage && !api ? update : undefined}
          createLabel="Add document"
          searchPlaceholder="Search documents…"
          emptyIcon="fileText"
        />

        <div className="card-foot">
          {api
            ? 'Files are stored in the company document service (Google Drive) and streamed through the HR server — this register shows their metadata, access rules and verification status.'
            : 'Upload and download are enabled once the backend file service is connected — this register tracks document metadata today.'}
        </div>
      </section>

      {uploadOpen ? (
        <UploadDocumentModal
          canManage={canManage}
          isAdmin={isAdmin}
          myId={myId}
          employees={data.employees.map((e) => ({ id: e.id, name: e.name }))}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </div>
  );
}