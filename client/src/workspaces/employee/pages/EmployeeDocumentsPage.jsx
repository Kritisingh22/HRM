'use strict';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { api, fullPath } from '../../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, DataTable, Modal } from 'ui';
import { useList } from '../../../hooks/useList';
import { getAccessToken } from '../../../services/api';

const COLUMNS = [
  { label: 'Document', get: (r) => <><strong>{r.title}</strong><div className="ws-muted" style={{fontSize:12}}>{r.originalName}</div></> },
  { label: 'Category', get: (r) => r.category, render: (v) => <span className="ws-badge">{v}</span> },
  { label: 'Visibility', get: (r) => r.visibility, render: (v) => <span className="ws-badge">{v}</span> },
  { label: 'Verified', get: (r) => r.isVerified, render: (v) => <span className={v ? 'ws-pill ok' : 'ws-pill warn'}>{v ? 'Yes' : 'No'}</span> },
  { label: 'Size', get: (r) => (r.fileSize/1024/1024).toFixed(2) + ' MB' },
  { label: 'Date', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
  { label: 'Action', get: (r) => <button className="ws-btn sm" onClick={() => handleDownload(r._id)}>Download</button> },
];

export default function EmployeeDocumentsPage() {
  const { user } = useAuth();
  const { rows, loading, error, reload } = useList('/api/employee-documents/my');
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'personal', file: null });

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) setForm(s => ({ ...s, file, title: s.title || file.name }));
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!form.file) return alert('Please select a file.');
    if (!form.title.trim()) return alert('Title is required.');

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', form.file);
      fd.append('title', form.title.trim());
      fd.append('category', form.category);
      fd.append('visibility', 'private');
      await api.post('/api/employee-documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('Document uploaded.');
      setShowUpload(false);
      setForm({ title: '', category: 'personal', file: null });
      reload();
    } catch (e) {
      alert(e?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(docId) {
    try {
      const res = await fetch(fullPath(`/api/employee-documents/${docId}/download`), {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error('Download failed');
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
      alert(e.message || 'Download failed.');
    }
  }

  const COLUMNS = [
    { label: 'Document', get: (r) => <><strong>{r.title}</strong><div className="ws-muted" style={{fontSize:12}}>{r.originalName}</div></> },
    { label: 'Category', get: (r) => r.category, render: (v) => <span className="ws-badge">{v}</span> },
    { label: 'Visibility', get: (r) => r.visibility, render: (v) => <span className="ws-badge">{v}</span> },
    { label: 'Verified', get: (r) => r.isVerified, render: (v) => <span className={v ? 'ws-pill ok' : 'ws-pill warn'}>{v ? 'Yes' : 'No'}</span> },
    { label: 'Size', get: (r) => (r.fileSize/1024/1024).toFixed(2) + ' MB' },
    { label: 'Date', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { label: 'Action', get: (r) => <button className="ws-btn sm" onClick={() => handleDownload(r._id)}>Download</button> },
  ];

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>My Documents</h1>
        <span className="ws-scope">Your personal documents</span>
        <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setShowUpload(true)}>+ Upload</button></div>
      </div>

      {showUpload && (
        <Card sub="Upload a document (will be private)">
          <form onSubmit={handleUpload} className="ws-form-grid">
            <div className="ws-field full">
              <label>File</label>
              <input type="file" required onChange={handleFileChange} disabled={uploading} />
            </div>
            <div className="ws-field">
              <label>Title</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Document title" disabled={uploading} />
            </div>
            <div className="ws-field">
              <label>Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} disabled={uploading}>
                <option value="personal">Personal</option>
                <option value="certificate">Certificate</option>
                <option value="id_proof">ID Proof</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="ws-field full" style={{flexDirection:'row',justifyContent:'flex-end'}}>
              <button type="button" className="ws-btn" onClick={() => {setShowUpload(false); setForm({title:'',category:'personal',file:null});}} disabled={uploading}>Cancel</button>
              <button type="submit" className="ws-btn primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          error={error}
          emptyText="No documents yet. Use “Upload” to add your first document."
        />
      </Card>
    </div>
  );
}