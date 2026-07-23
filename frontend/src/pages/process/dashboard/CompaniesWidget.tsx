import { Building2, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import type { Company } from '../../../api/company';

interface CompaniesWidgetProps {
  companies: Company[];
  navigateToNewProcess: () => void;
}

export function CompaniesWidget({ companies, navigateToNewProcess }: CompaniesWidgetProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-app-accent" />
          Empresas Vinculadas
        </CardTitle>
        <span className="text-2xl font-bold text-app-text">{companies.length}</span>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-app-muted mb-4">No hay empresas registradas</p>
            <button
              onClick={navigateToNewProcess}
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
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-app-bg transition-colors"
              >
                <span className="w-8 h-8 rounded-lg bg-app-accent/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-app-accent" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-app-text truncate">{company.name}</p>
                  {company.business_type && (
                    <p className="text-xs text-app-muted truncate">{company.business_type}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}