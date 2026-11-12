/* ============================================================
   Sidebar — logo, role-filtered navigation, signed-in profile
   card and the desktop collapse control.
   ============================================================ */
import { NavLink } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { PAGE_PATH, navForRole } from '@/data/nav';
import logoMark from '../../../img/cyethack-logo.svg';

interface SidebarProps {
  rail: boolean;
  onToggleRail: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ rail, onToggleRail, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  if (!user) return null;
  /* user.nav is the server-signed allow-list; passing it keeps the sidebar
     and the route guard (which also uses user.nav) in perfect agreement. */
  const groups = navForRole(user.role, user?.nav);

  return (
    <aside className="sidebar" aria-label="Modules">
      <div className="logo">
        <img className="logo-img" src={logoMark} alt="" />
        <span className="logo-text">
          <span className="logo-name">CYETHACK</span>
          <span className="logo-sub">HRM Portal</span>
        </span>
      </div>

      <button
        className="collapse-btn"
        onClick={onToggleRail}
        aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
        title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        <Icon name="chevrons" size={13} />
      </button>

      <nav className="nav">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.page}
                to={PAGE_PATH[item.page] ?? '/'}
                end={PAGE_PATH[item.page] === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                title={item.label ?? item.page}
                onClick={onNavigate}
              >
                <Icon name={item.icon} size={18} />
                <span className="nav-text">{item.label ?? item.page}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="profile">
        <Avatar name={user.name} seed={user.email} size={36} />
        <span className="who">
          <b>{user.name}</b>
          <span>{user.designation ?? user.role}</span>
        </span>
      </div>
    </aside>
  );
}
