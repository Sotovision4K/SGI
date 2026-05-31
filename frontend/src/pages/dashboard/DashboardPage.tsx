import { useAuth } from 'react-oidc-context';
import { Building2, FileText, ClipboardCheck, BarChart3, Settings, LogOut } from 'lucide-react';

export function DashboardPage() {
  const { user, signoutRedirect } = useAuth();

  const role = user?.profile?.['custom:role'] as string || 'customer';
  const fullName = user?.profile?.name || user?.profile?.email || 'Usuario';
  const email = user?.profile?.email || '';

  const handleLogout = () => {
    signoutRedirect();
  };

  const handleNavigate = (section: string) => {
    // Navigate to respective section - routes will be implemented
    console.log(`Navigating to ${section}`);
  };

  const isCompany = role === 'company';
  const isConsultant = role === 'consultant';

  return (
    <div className="min-h-screen bg-bg-soft">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white text-sm font-extrabold">
                SGI
              </div>
              <span className="text-xl font-bold text-primary">SGI Pro</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-text-main">{fullName}</p>
                <p className="text-xs text-text-muted">{email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-text-muted hover:text-red-500 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary">Panel de Control</h1>
          <p className="text-text-muted mt-1">
            {isCompany ? 'Gestiona la certificación de tu empresa' : 'Gestiona tus servicios de consultoría'}
          </p>
        </div>

        {/* Role Badge */}
        <div className="mb-8">
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
            isCompany ? 'bg-blue-100 text-blue-700' : 
            isConsultant ? 'bg-green-100 text-green-700' : 
            'bg-gray-100 text-gray-700'
          }`}>
            {isCompany ? (
              <>
                <Building2 className="w-4 h-4" />
                Empresa
              </>
            ) : isConsultant ? (
              <>
                <FileText className="w-4 h-4" />
                Consultor
              </>
            ) : (
              'Usuario'
            )}
          </span>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Diagnóstico */}
          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <ClipboardCheck className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Diagnóstico</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Evalúa el estado actual de tu empresa frente a los requisitos ISO.
            </p>
            <button
              onClick={() => handleNavigate('diagnostico')}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Iniciar Diagnóstico
            </button>
          </div>

          {/* Documentación */}
          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Documentación</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Genera y gestiona manuales, procedimientos y registros.
            </p>
            <button
              onClick={() => handleNavigate('documentacion')}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Ver Documentos
            </button>
          </div>

          {/* Auditorías */}
          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <ClipboardCheck className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Auditorías</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Planifica y ejecuta auditorías internas de forma guiada.
            </p>
            <button
              onClick={() => handleNavigate('auditorias')}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Gestionar Auditorías
            </button>
          </div>

          {/* Indicadores */}
          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Indicadores</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Visualiza KPIs y métricas de desempeño del SGI.
            </p>
            <button
              onClick={() => handleNavigate('indicadores')}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Ver Dashboard
            </button>
          </div>

          {/* Configuración */}
          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <Settings className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Configuración</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Administra usuarios, roles y configuraciones del sistema.
            </p>
            <button className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors">
              Abrir Configuración
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}