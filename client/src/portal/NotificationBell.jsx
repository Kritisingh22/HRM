/* NotificationBell — shows unread notification count in topbar, opens dropdown. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';

export default function NotificationBell() {
  const { user } = useAuth();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/notifications?unread=true&limit=5');
      setNotifications(data.notifications || []);
      setCount(data.unreadCount || 0);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Poll every 60 seconds
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  async function markRead(id, e) {
    e.stopPropagation();
    try {
      await api.put('/api/notifications/' + id + '/read');
      setNotifications(ns => ns.filter(n => n._id !== id));
      setCount(c => Math.max(0, c - 1));
    } catch (err) {
      toast.error('Failed to mark as read.');
    }
  }

  async function markAllRead(e) {
    e.stopPropagation();
    try {
      await api.put('/api/notifications/read-all');
      setNotifications([]);
      setCount(0);
      toast.success('All marked as read.');
    } catch (err) {
      toast.error('Failed to mark all as read.');
    }
  }

  function goToNotifications(e) {
    e.stopPropagation();
    setOpen(false);
    window.location.href = '/employee/notifications';
  }

  if (count === 0 && notifications.length === 0) {
    // Still show bell but without badge
    return (
      <button className="ws-bell" onClick={() => setOpen(!open)} aria-label="Notifications">
        <span className="ws-bell-icon">🔔</span>
        {open && (
          <div className="ws-bell-dropdown">
            <div className="ws-bell-header">
              <strong>Notifications</strong>
              <span className="ws-muted" style={{ fontSize: 11 }}>No new notifications</span>
            </div>
            <div className="ws-bell-footer">
              <button className="ws-btn sm" onClick={goToNotifications}>View All</button>
            </div>
          </div>
        )}
      </button>
    );
  }

  return (
    <button className="ws-bell" onClick={() => setOpen(!open)} aria-label="Notifications">
      <span className="ws-bell-icon">🔔</span>
      <span className="ws-bell-badge">{count > 9 ? '9+' : count}</span>
      {open && (
        <div className="ws-bell-dropdown">
          <div className="ws-bell-header">
            <strong>Notifications</strong>
            <span className="ws-muted" style={{ fontSize: 11 }}>{count} unread</span>
          </div>
          <div className="ws-bell-list">
            {notifications.slice(0, 5).map((n) => (
              <div key={n._id} className="ws-bell-item" style={{ opacity: n.read ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.read ? 400 : 600, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.title}
                    </div>
                    <div className="ws-muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.message.slice(0, 60)}{n.message.length > 60 ? '…' : ''}
                    </div>
                  </div>
                  {!n.read && (
                    <button className="ws-btn sm ok" style={{ height: 24, padding: '0 8px', fontSize: 10.5 }} onClick={(e) => markRead(n._id, e)}>
                      Mark Read
                    </button>
                  )}
                </div>
                <div className="ws-muted" style={{ fontSize: 10, marginTop: 2 }}>
                  {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {notifications.length >= 5 && (
              <div className="ws-bell-more ws-muted" style={{ fontSize: 11, textAlign: 'center', padding: 8 }}>
                +{notifications.length - 5} more…
              </div>
            )}
          </div>
          <div className="ws-bell-footer">
            <button className="ws-btn sm" onClick={goToNotifications}>View All Notifications</button>
            {count > 0 && <button className="ws-btn sm" onClick={markAllRead}>Mark All Read</button>}
          </div>
        </div>
      )}
    </button>
  );
}