import { NavLink } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import {
  Building2,
  ClipboardCheck,
  BarChart3,
  Settings,
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/cn';

const navItems = [
  { to: '/processes', label: 'Procesos', icon: FileText },
  { to: '/companies', label: 'Empresas', icon: Building2 },
  { to: '/audits', label: 'Auditorías', icon: ClipboardCheck },
  { to: '/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/settings', label: 'Configuración', icon: Settings },
];

interface SidebarProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  className?: string;
}

export function Sidebar({
  collapsed,
  onNavigate,
  onToggleCollapse,
  className,
}: SidebarProps) {
  const { user, signoutRedirect } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-white/10 text-white border-l-4 border-app-accent'
        : 'text-app-sidebar-link hover:text-white hover:bg-white/5',
      collapsed && 'justify-center px-0',
    ].join(' ');

  return (
    <aside
      className={cn(
        'flex flex-col bg-app-primary h-full shrink-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center border-b border-white/10 py-5',
          collapsed ? 'justify-center px-1' : 'gap-2 px-4',
        )}
      >
        {collapsed ? (
          onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expandir barra lateral"
              className="p-1.5 rounded-lg text-app-sidebar-link hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )
        ) : (
          <>
            <div className="w-8 h-8 rounded bg-app-accent/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-app-accent" />
            </div>
            <span className="text-white font-semibold text-lg">SGI Pro</span>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Colapsar barra lateral"
                className="ml-auto p-1.5 rounded-lg text-app-sidebar-link hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/processes'}
            title={label}
            className={linkClass}
            onClick={onNavigate}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className={cn(collapsed && 'hidden')}>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User block */}
      <div className={cn('py-4 border-t border-white/10', collapsed ? 'px-2' : 'px-4')}>
        <div className={cn('mb-3', collapsed && 'hidden')}>
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
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className={cn(
            'flex items-center gap-2 text-app-sidebar-link hover:text-white text-sm font-medium transition-colors',
            collapsed && 'justify-center',
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className={cn(collapsed && 'hidden')}>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
