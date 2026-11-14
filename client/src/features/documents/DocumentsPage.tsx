/* ============================================================
   Documents — Company Resources & Employee Documents

   Company Resources: Company-wide documents (HR Manual, Policies, Circulars, Forms)
   Employee Documents: Employee-specific documents (offer letters, ID proofs, certificates)

   Server sessions: metadata comes from the authenticated register
   API; files are uploaded to Cloudflare R2 through the server and viewed/downloaded
   through authenticated endpoints — the browser never receives storage keys or
   provider links. Demo sessions keep the local register.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { Modal } from '@/components/ui/Modal';
import { Pill, Progress, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDrill } from '@/lib/useDrill';
import { isApiSession, SessionRequiredError } from '@/api/client';
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

interface UploadFileItem {
  file: File;
  preview: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface UploadModalProps {
  canManage: boolean;
  isAdmin: boolean;
  myId: string;
  employees: Array<{ id: string; name: string }>;
  onClose: () => void;
}

/** Server-session upload: file → Cloudflare R2 through the HR server API. */
function UploadDocumentModal({
  canManage,
  isAdmin,
  myId,
  employees,
  onClose,
}: UploadModalProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadFileItem[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Company Document');
  const [owner, setOwner] = useState('company-wide');
  const [visibility, setVisibility] = useState<'private' | 'hr' | 'all'>('private');
  const [docType, setDocType] = useState<'company' | 'employee'>('company');
  const [folder, setFolder] = useState('hr-manual');
  const [expiryDate, setExpiryDate] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isDragging = useRef(false);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    isDragging.current = true;
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    isDragging.current = false;
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    isDragging.current = false;
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) addFiles(dropped);
  };

  const addFiles = (newFiles: File[]) => {
    setError('');
    const valid = newFiles.filter((f) => {
      const allowed = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif',
        'text/plain',
      ];
      return allowed.includes(f.type);
    });
    if (valid.length !== newFiles.length) {
      setError('Some files were skipped — unsupported type.');
    }
    setFiles((prev) => [...prev, ...valid]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadItems((prev) => prev.filter((_, i) => i !== index));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const browseFiles = () => fileInputRef.current?.click();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const submit = async () => {
    if (files.length === 0) {
      setError('Choose at least one file to upload.');
      return;
    }
    if (!category) {
      setError('Choose a document category.');
      return;
    }

    const uploadOwner = owner === 'company-wide' ? null : owner;
    const uploadVisibility = owner === 'company-wide' ? 'all' : visibility;
    const uploadCategory = docType === 'company' ? folder : category;

    setBusy(true);
    setError('');

    // Upload files sequentially to avoid overwhelming the server.
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadItems((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'uploading' as const, progress: 0 } : item,
        ),
      );

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', (title || file.name).slice(0, 200));
        fd.append('category', uploadCategory);
        if (uploadOwner) fd.append('owner', uploadOwner);
        if (uploadVisibility) fd.append('visibility', uploadVisibility);
        if (description) fd.append('description', description);
        if (expiryDate) fd.append('expiryDate', expiryDate);

        await officialUploadDocument({
          file,
          title: title || file.name,
          category: uploadCategory,
          ownerEmployeeId: canManage && uploadOwner ? uploadOwner : null,
          visibility: canManage ? uploadVisibility : undefined,
        });

        setUploadItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'done' as const, progress: 100 } : item,
          ),
        );
      } catch (err) {
        failed++;
        setUploadItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'error' as const,
                  error: documentErrorMessage(err),
                }
              : item,
          ),
        );
      }
    }

    setBusy(false);
    if (failed === 0) {
      toast(`${files.length} file(s) uploaded to Cloudflare R2.`, 'success');
      setFiles([]);
      setUploadItems([]);
      setTitle('');
      setDescription('');
      setExpiryDate('');
      onClose();
    } else {
      toast(`${failed} of ${files.length} upload(s) failed.`, 'error');
    }
  };

  const uploadProgress = uploadItems.length
    ? Math.round(
        uploadItems.reduce((sum, item) => sum + item.progress, 0) / uploadItems.length,
      )
    : 0;

  return (
    <Modal
      title="Upload document"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            type="button"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            type="button"
            disabled={busy || files.length === 0}
          >
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
      large
    >
      <div className="form-2col">
        {/* Drag-and-drop zone */}
        <div
          className={`drop-zone${isDragging.current ? ' active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-outline"
            onClick={browseFiles}
            type="button"
            disabled={busy}
          >
            <Icon name="cloudUpload" size={14} /> Choose files
          </button>
          <span className="sub" style={{ marginLeft: 8 }}>
            Drag & drop here, or browse. PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG, PNG, TXT.
          </span>
        </div>

        {/* File list with progress */}
        {files.length > 0 && (
          <div className="file-list">
            {files.map((file, i) => {
              const item = uploadItems[i];
              return (
                <div
                  key={`${file.name}-${i}`}
                  className={`file-row ${item?.status || 'pending'}`}
                >
                  <span className="file-name" title={file.name}>
                    <Icon name="fileText" size={12} /> {file.name}
                  </span>
                  <span className="file-size">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                  {item && item.status === 'uploading' && (
                    <Progress value={item.progress} />
                  )}
                  {item && item.status === 'error' && (
                    <span className="sub" style={{ color: '#d92d20' }}>
                      {item.error}
                    </span>
                  )}
                  <button
                    className="icon-btn icon-btn-sm"
                    onClick={() => removeFile(i)}
                    type="button"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              );
            })}
            {busy && uploadItems.length > 0 && (
              <div className="progress-bar">
                <Progress value={uploadProgress} label="Uploading…" />
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="doc-title">Title (optional)</label>
          <input
            id="doc-title"
            className="input"
            value={title}
            placeholder={files.length === 1 ? files[0]?.name : 'Document name'}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="field-hint">Optional. Defaults to file name.</div>
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

        {canManage && (
          <>
            <div className="field">
              <label htmlFor="doc-type">Document Type</label>
              <select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value as 'company' | 'employee')}>
                <option value="company">Company Resource</option>
                <option value="employee">Employee Document</option>
              </select>
            </div>
            {docType === 'company' && canManage ? (
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
          </>
        )}

        <div className="field">
          <label htmlFor="doc-desc">Description</label>
          <textarea
            id="doc-desc"
            className="input"
            value={description}
            placeholder="Optional description of this document"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="doc-expiry">Expiry date (optional)</label>
          <input
            id="doc-expiry"
            type="date"
            className="input"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
          <div className="field-hint">Optional. After this date the document may require renewal.</div>
        </div>
      </div>

      {error ? (
        <p role="alert" style={{ marginTop: 10, color: '#d92d20' }}>
          {error}
        </p>
      ) : null}
      <p className="sub" style={{ marginTop: 10 }}>
        The file is stored in Cloudflare R2; the register keeps its metadata and
        access rules, and every view or download is authorised by the server.
      </p>
    </Modal>
  );
}

export function DocumentsPage() {
  const { data, dispatch, audit, nextId } = useApp();
  const { canManage, user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { query: seedQuery, clear } = useDrill();
  const [drill, setDrill] = useState(seedQuery);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'employee'>('company');
  const [docType, setDocType] = useState<'company' | 'employee'>('company');
  const [folder, setFolder] = useState('hr-manual');
  const api = isApiSession();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const myId = user?.employeeId ?? '';
  const role = user?.role;

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
      docs = docs.filter((d) =>
        `${d.name} ${d.type} ${ownerName(d.owner)}`.toLowerCase().includes(q),
      );
    }
    return docs;
  }, [data.documents, data.employees, data.candidates, drill, activeTab]);

  // For employees: only show their own documents
  const myDocuments = useMemo(() => {
    return data.documents.filter((d) => d.owner === myId);
  }, [data.documents, myId]);

  // Determine which documents to show based on role and active tab
  const rows = useMemo(() => {
    if (activeTab === 'company') {
      return companyResources;
    } else if (activeTab === 'employee') {
      // Managers and HR see all employee documents (global visibility)
      // Employees only see their own
      if (role === 'MANAGER' || role === 'HR' || role === 'ADMIN' || role === 'SUPER_ADMIN') {
        return employeeDocuments;
      }
      return myDocuments;
    }
    return [];
  }, [activeTab, companyResources, employeeDocuments, myDocuments, role]);

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
    {
      header: activeTab === 'company' ? 'Folder' : 'Owner',
      render: (d: DocumentRecord) =>
        activeTab === 'company' ? folderName(d.type) : ownerName(d.owner),
    },
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
      if (err instanceof SessionRequiredError) {
        /* No usable API session: stash the exact message (missing session /
           demo account) so the login page can surface it, clear the shell
           state, and send the user to login. */
        try {
          sessionStorage.setItem('cyethackHRM.loginMessage', err.message);
        } catch { /* sessionStorage blocked — the redirect still happens */ }
        toast(err.message, 'error');
        await logout();
        navigate('/login', { replace: true });
        return;
      }
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
            <h2>
              {activeTab === 'company'
                ? 'Company Resources'
                : role === 'EMPLOYEE'
                  ? 'My Documents'
                  : 'Employee Documents'}
            </h2>
            <div className="sub">
              {activeTab === 'company'
                ? 'Company-wide resources: HR Manual, Policies, Circulars, Forms, and other approved resources'
                : role === 'EMPLOYEE'
                  ? 'Your personal documents: offer letters, ID proofs, certificates, and letters'
                  : canManage
                    ? 'Employee-specific documents across all employees — offer letters, ID proofs, certificates, and personal records'
                    : 'Employee-specific documents: offer letters, ID proofs, certificates, and personal records'}
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
            ? 'Files are stored in Cloudflare R2 and streamed through the HR server — this register shows their metadata, access rules and verification status.'
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
