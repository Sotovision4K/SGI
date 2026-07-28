import { Building2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Company } from '../../../api/company';

interface CompaniesWidgetProps {
  companies: Company[];
  navigateToNewProcess: () => void;
}

export function CompaniesWidget({ companies }: CompaniesWidgetProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-app-border rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text mb-4">
        <Building2 className="w-4 h-4 text-app-accent" />
        Empresas Vinculadas
      </h3>
      {companies.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-app-muted mb-4">No hay empresas registradas</p>
          <button
            onClick={() => navigate('/companies')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar empresa
          </button>
        </div>
      ) : (
        <ul className="space-y-1">
          {companies.map((company) => (
            <li
              key={company.company_id}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#F1F5F9] transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-[#0066CC]/10 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-[#0066CC]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-app-text truncate">{company.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {company.business_type && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EEF2F8] text-app-muted">
                      {company.business_type}
                    </span>
                  )}
                  <span className="text-[11px] text-app-muted">
                    {company.active_process_count ?? 0} activos
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
