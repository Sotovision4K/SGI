import { NavLink } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import {
  Building2,
  ClipboardCheck,
  BarChart3,
  Settings,
  FileText,
  LogOut,
} from 'lucide-react';

const navItems = [
  { to: '/processes', label: 'Procesos', icon: FileText },
  { to: '/companies', label: 'Empresas', icon: Building2 },
  { to: '/audits', label: 'Auditorías', icon: ClipboardCheck },
  { to: '/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/settings', label: 'Configuración', icon: Settings },
];

export function Sidebar() {
  const { user, signoutRedirect } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-white/10 text-white border-l-4 border-app-accent'
        : 'text-app-sidebar-link hover:text-white hover:bg-white/5',
    ].join(' ');

  return (
    <aside className="w-64 bg-app-primary min-h-screen flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded bg-app-accent/20 flex items-center justify-center">
          <FileText className="w-5 h-5 text-app-accent" />
        </div>
        <span className="text-white font-semibold text-lg">SGI Pro</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/processes'} className={linkClass}>
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User block */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="mb-3">
          <p className="text-white text-sm font-medium truncate">
            {user?.profile?.name ?? user?.profile?.email ?? 'Usuario'}
          </p>
          {user?.profile?.email && (
            <p className="text-app-sidebar-link text-xs truncate">
              {user.profile.email}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => signoutRedirect()}
          className="flex items-center gap-2 text-app-sidebar-link hover:text-white text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}