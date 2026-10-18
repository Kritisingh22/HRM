/* ============================================================
   Documents — the employee document register (offer letters,
   ID proofs, certificates), with verification status.

   Server sessions: metadata comes from the authenticated register
   API; files are uploaded to the server's file service (Google
   Drive behind the scenes) and viewed/downloaded through
   authenticated endpoints — the browser never receives storage
   keys or provider links. Demo sessions keep the local register.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { ResourceView, type FieldDef } from '@/components/ui/ResourceView';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDrill } from '@/lib/useDrill';
import { isApiSession } from '@/api/client';
import { downloadBlob, documentErrorMessage, fetchDocumentBlob, openDocument } from '@/api/documents';
import { officialUploadDocument, officialVerifyDocument } from '@/store/apiBridge';
import { niceDate } from '@/lib/date';
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
  const [owner, setOwner] = useState(isAdmin ? OWNER_ALL : myId);
  const [visibility, setVisibility] = useState<'private' | 'hr' | 'all'>('private');
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
      await officialUploadDocument({
        file,
        title: title || file.name,
        category,
        ownerEmployeeId: canManage && owner !== OWNER_ALL ? owner : null,
        visibility: canManage ? visibility : undefined,
      });
      toast(`“${title || file.name}” uploaded to the document service.`, 'success');
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
            <label htmlFor="doc-owner">Owner</label>
            <select id="doc-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {isAdmin ? <option value={OWNER_ALL}>Company-wide (all employees)</option> : null}
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
  const api = isApiSession();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const myId = user?.employeeId ?? '';

  /* lazy-sync the drill chip when a new global-search hit arrives */
  useEffect(() => {
    setDrill(seedQuery);
  }, [seedQuery]);

  const ownerName = (id: string | null) => {
    if (id === null) return 'Company-wide';
    if (id.startsWith('CAN-')) return data.candidates.find((c) => c.id === id)?.name ?? id;
    return data.employees.find((e) => e.id === id)?.name ?? id;
  };

  const rows = useMemo(() => {
    /* Role scope: HR/Admin see the whole register; everyone else sees
       their own employee-specific documents plus company-wide ones. */
    const scoped = canManage ? data.documents : data.documents.filter((d) => d.owner === myId || d.owner === null);
    if (!drill) return scoped;
    const q = drill.toLowerCase();
    return scoped.filter((d) => `${d.name} ${d.type} ${ownerName(d.owner)}`.toLowerCase().includes(q));
  }, [data.documents, data.employees, data.candidates, drill, canManage, myId]);

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
    { header: 'Owner', render: (d: DocumentRecord) => ownerName(d.owner) },
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
    dispatch({
      type: 'add',
      collection: 'documents',
      item: {
        id,
        name: values.name,
        type: values.type,
        owner: values.owner && values.owner !== OWNER_ALL ? values.owner : null,
        uploaded: values.uploaded,
        status: (values.status as DocumentRecord['status']) || 'Pending',
      } satisfies DocumentRecord,
    });
    audit('Document added', `${values.name} (${id})`);
    toast('Document added to the register.', 'success');
  };

  const update = (row: DocumentRecord, values: Record<string, string>) => {
    dispatch({
      type: 'update',
      collection: 'documents',
      id: row.id,
      patch: {
        name: values.name,
        type: values.type,
        owner: values.owner && values.owner !== OWNER_ALL ? values.owner : null,
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
    toast(`“${row.name}” verified.`, 'success');
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
        toast(`“${d.name}” verified.`, 'success');
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

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{canManage ? 'Documents' : 'My Documents'}</h2>
            <div className="sub">Offer letters, ID proofs, qualifications and letters in one register</div>
          </div>
          {api ? (
            <button className="btn btn-primary" type="button" onClick={() => setUploadOpen(true)}>
              Upload document
            </button>
          ) : null}
        </div>

        {drill ? (
          <div style={{ marginBottom: 12 }}>
            <span className="ana-drill-note">
              Search: “{drill}”
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
          search={(d) => `${d.name} ${d.type} ${ownerName(d.owner)}`}
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
