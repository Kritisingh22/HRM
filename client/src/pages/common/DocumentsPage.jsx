/* Documents Page — employee-facing view of permitted documents.
 *  - Organized into: HR Manual, Circular Documents, Personal Documents, Company Documents
 *  - HR/Admin/Manager sees scoped documents per backend RBAC
 *  - Download via backend-authorised endpoint (never direct file URLs)
 *  - Upload own documents (forced private by backend) */
import { useState, useEffect, useMemo } from 'react';
import { Card } from '../../components/ui';
import { api } from '../../services/api';
import { Spinner, EmptyState, ErrorNote, StatusPill, personName } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { getAccessToken } from '../../services/api';

const CATEGORIES = ['Personal Document', 'Company Document', 'HR Manual', 'Circular Document', 'Policy', 'Contract', 'Payslip', 'ID Proof', 'Certificate', 'Other'];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getVisibilityLabel = (vis) => {
  switch (vis) {
    case 'all': return { label: 'Company-wide', className: 'vis-public' };
    case 'hr': return { label: 'HR Only', className: 'vis-hr' };
    case 'private': return { label: 'Personal', className: 'vis-private' };
    default: return { label: vis, className: '' };
  }
};

// Section definitions for organized display
const DOCUMENT_SECTIONS = [
  { key: 'hrManual', label: 'HR Manual', filter: (d) => d.category === 'HR Manual', icon: '📋' },
  { key: 'circular', label: 'Circular Documents', filter: (d) => d.category === 'Circular Document', icon: '📢' },
  { key: 'personal', label: 'Personal Documents', filter: (d) => d.owner && d.visibility === 'private' && d.category !== 'HR Manual' && d.category !== 'Circular Document', icon: '👤' },
  { key: 'company', label: 'Company Documents', filter: (d) => (d.visibility === 'all' || d.visibility === 'hr') && d.category !== 'HR Manual' && d.category !== 'Circular Document', icon: '🏢' },
];

export default function DocumentsPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Personal Document', file: null });

  const canUpload = hasPermission('documents:create') || user?.role === 'EMPLOYEE';

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/api/documents');
      const arr = Array.isArray(data) ? data : Object.values(data).find((v) => Array.isArray(v)) || [];
      setDocs(arr);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      setForm((s) => ({ ...s, file, title: s.title || file.name }));
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!form.file) return toast.error('Please select a file.');
    if (!form.title.trim()) return toast.error('Title is required.');

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', form.file);
      fd.append('title', form.title.trim());
      fd.append('category', form.category);
      await api.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded.');
      setShowUpload(false);
      setForm({ title: '', category: 'Personal Document', file: null });
      loadDocuments();
    } catch (e) {
      toast.error(e?.data?.details?.[0] || e?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    try {
      const res = await fetch(`/api/documents/${doc._id}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Download failed' }));
        throw new Error(err.message || 'Download failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      toast.error(e.message || 'Download failed.');
    }
  }

  if (error) return <ErrorNote error={error} onRetry={loadDocuments} />;
  if (loading) return <Spinner />;

  // Organize documents into sections
  const sections = useMemo(() => {
    return DOCUMENT_SECTIONS.map(section => ({
      ...section,
      documents: docs.filter(section.filter)
    })).filter(section => section.documents.length > 0);
  }, [docs]);

  const totalDocs = docs.length;

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Documents</h1>
        <span className="ws-scope">{totalDocs} document{totalDocs === 1 ? '' : 's'}</span>
        {canUpload && (
          <div className="ws-page-actions">
            <button className="ws-btn primary" onClick={() => setShowUpload(true)}>+ Upload</button>
          </div>
        )}
      </div>

      {showUpload && (
        <Card sub="Upload a document (will be private to you)">
          <form onSubmit={handleUpload} className="ws-form-grid">
            <div className="ws-field full">
              <label>File</label>
              <input type="file" required onChange={handleFileChange} disabled={uploading} />
            </div>
            <div className="ws-field">
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Document title" disabled={uploading} />
            </div>
            <div className="ws-field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} disabled={uploading}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="ws-field full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <button type="button" className="ws-btn" onClick={() => { setShowUpload(false); setForm({ title: '', category: 'Personal Document', file: null }); }} disabled={uploading}>Cancel</button>
              <button type="submit" className="ws-btn primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </form>
        </Card>
      )}

      {sections.length > 0 ? (
        sections.map(section => (
          <Card key={section.key} sub={`${section.icon} ${section.label} (${section.documents.length})`}>
            <DocumentTable documents={section.documents} onDownload={handleDownload} showOwner={section.key !== 'personal'} />
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState>
            <div>No documents found.</div>
            {canUpload && <button className="ws-btn primary" style={{ marginTop: 12 }} onClick={() => setShowUpload(true)}>Upload your first document</button>}
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

function DocumentTable({ documents, onDownload, showOwner }) {
  return (
    <div className="ws-tablewrap">
      <table className="ws-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Category</th>
            {showOwner && <th>Owner</th>}
            <th>Visibility</th>
            <th className="r">Size</th>
            <th className="r">Date</th>
            <th className="r">Action</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d, i) => {
            const vis = getVisibilityLabel(d.visibility);
            return (
              <tr key={d._id || i}>
                <td>
                  <strong>{d.title}</strong>
                  <div className="ws-muted" style={{ fontSize: 12 }}>{d.originalName}</div>
                </td>
                <td><StatusPill value={d.category} /></td>
                {showOwner && <td>{d.owner ? personName(d.owner) : <span className="ws-muted">—</span>}</td>}
                <td><span className={`ws-badge ${vis.className}`}>{vis.label}</span></td>
                <td className="r">{fmtSize(d.size)}</td>
                <td className="r">{fmtDate(d.createdAt)}</td>
                <td className="r">
                  <button className="ws-btn sm" onClick={() => onDownload(d)}>Download</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}