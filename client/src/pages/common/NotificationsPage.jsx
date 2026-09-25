/* NotificationsPage — user's personal notification center.
 *  Displays all notifications for the logged-in user with read/unread status. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, personName } from '../../components/ui';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const PRIORITY_COLORS = {
  Low: '#64748b',
  Normal: '#3b82f6',
  High: '#f59e0b',
  Urgent: '#ef4444',
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all'); // all, unread

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter === 'unread') params.set('unread', 'true');
      params.set('limit', '100');
      const data = await api.get('/api/notifications?' + params.toString());
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await api.get('/api/notifications/unread-count');
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => { load(); loadUnreadCount(); }, [load, loadUnreadCount]);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  async function markRead(id) {
    try {
      await api.put('/api/notifications/' + id + '/read');
      setNotifications(ns => ns.map(n => n._id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (e) {
      toast.error('Failed to mark as read.');
    }
  }

  async function markAllRead() {
    try {
      await api.put('/api/notifications/read-all');
      setNotifications(ns => ns.map(n => ({ ...n, read: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      toast.success('All notifications marked as read.');
    } catch (e) {
      toast.error('Failed to mark all as read.');
    }
  }

  async function deleteNotification(id) {
    try {
      await api.del('/api/notifications/' + id);
      setNotifications(ns => ns.filter(n => n._id !== id));
      if (notifications.find(n => n._id === id && !n.read)) {
        setUnreadCount(c => Math.max(0, c - 1));
      }
    } catch (e) {
      toast.error('Failed to delete notification.');
    }
  }

  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (loading) return <Spinner />;

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Notifications</h1>
        <span className="ws-scope">{notifications.length} notification{notifications.length === 1 ? '' : 's'}{unreadCount > 0 ? ` · <span style="color:#ef4444;font-weight:700">${unreadCount} unread</span>` : ''}</span>
        <div className="ws-page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`ws-btn sm ${filter === 'all' ? 'primary' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`ws-btn sm ${filter === 'unread' ? 'primary' : ''}`} onClick={() => setFilter('unread')}>Unread</button>
          </div>
          {unreadCount > 0 && <button className="ws-btn sm" onClick={markAllRead}>Mark All Read</button>}
        </div>
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState>
            <div>No notifications.</div>
          </EmptyState>
        ) : (
          <div className="ws-tablewrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Status</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th style={{ width: 180 }}>Received</th>
                  <th style={{ width: 120 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n._id} style={{ background: n.read ? 'transparent' : 'rgba(80,152,136,0.05)' }}>
                    <td>
                      <span className={`ws-pill ${n.read ? 'neutral' : 'ok'}`}>
                        {n.read ? 'Read' : 'Unread'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                      <div className="ws-muted" style={{ fontSize: 12, maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.message}
                      </div>
                    </td>
                    <td><StatusPill value={n.type} /></td>
                    <td>
                      <span className="ws-badge" style={{ background: PRIORITY_COLORS[n.priority] + '22', color: PRIORITY_COLORS[n.priority], borderColor: PRIORITY_COLORS[n.priority] + '55' }}>
                        {n.priority}
                      </span>
                    </td>
                    <td className="r">{fmtDateTime(n.createdAt)}</td>
                    <td className="r">
                      <span className="ws-actions">
                        {!n.read && <button className="ws-btn sm ok" onClick={() => markRead(n._id)}>Mark Read</button>}
                        <button className="ws-btn sm bad" onClick={() => deleteNotification(n._id)}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}