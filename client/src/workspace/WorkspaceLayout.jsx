/* Shared workspace shell: a role-specific sidebar (built from the workspace's nav
 * config), a topbar with the profile dropdown, and an <Outlet/> for the active
 * page. HRLayout/ManagerLayout/EmployeeLayout are thin wrappers that pass their
 * own config, so each workspace has its own navigation and identity while sharing
 * one responsive, accessible shell. */
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ProfileMenu from '../portal/ProfileMenu';
import NotificationBell from '../portal/NotificationBell';
import { initials } from '../components/ui';

export default function WorkspaceLayout({ config }) {
  const { user, hasPermission } = useAuth();
  const [open, setOpen] = useState(false); // mobile drawer
  const close = () => setOpen(false);

  // Filter nav items based on user permissions
  const filteredNav = config.nav.filter(item => {
    // If no permission required, show it
    if (!item.permission || item.permission.length === 0) return true;
    // Check if user has ANY of the required permissions
    return item.permission.some(p => hasPermission(p));
  });

  return (
    <div className="ws" style={{ '--ws-accent': config.accent }}>
      <aside className={'ws-side' + (open ? ' open' : '')}>
        <div className="ws-brand">
          <span className="ws-logo">C</span>
          <span className="ws-brandtext"><b>CYETHACK</b><small>{config.short}</small></span>
        </div>
        <nav className="ws-nav" onClick={close}>
          {filteredNav.map((item) => (
            <NavLink
              key={item.label}
              to={config.base + (item.path ? '/' + item.path : '')}
              end={item.path === ''}
              className={({ isActive }) => 'ws-navlink' + (isActive ? ' active' : '')}
            >
              <span className="ws-ic" aria-hidden="true">{item.icon}</span>
              <span className="ws-navlabel">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ws-sideuser">
          <span className="ws-av">{initials(user?.name)}</span>
          <div className="ws-su"><b>{user?.name}</b><span>{user?.role}</span></div>
        </div>
      </aside>

      {open && <div className="ws-scrim" onClick={close} />}

      <div className="ws-body">
        <header className="ws-topbar">
          <button className="ws-burger" aria-label="Menu" onClick={() => setOpen((v) => !v)}>☰</button>
          <h1 className="ws-title">{config.title}</h1>
          <div className="ws-spacer" />
          <NotificationBell />
          <ProfileMenu />
        </header>
        <main className="ws-main"><Outlet /></main>
      </div>
    </div>
  );
}
