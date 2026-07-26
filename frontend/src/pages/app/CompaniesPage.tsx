import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { useCompanies } from '../../hooks/useCompanies';
import { CompanyForm } from '../../components/companies/CompanyForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/Dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/ui/Table';

export function CompaniesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: companies = [], isLoading } = useCompanies();

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-text flex items-center gap-2">
            <Building2 className="w-6 h-6 text-app-accent" />
            Empresas
          </h1>
          <p className="text-app-muted mt-1">Gestiona las empresas registradas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button
              className="inline-flex items-center gap-2 px-4 py-2 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors self-start"
            >
              <Plus className="w-4 h-4" />
              Nueva empresa
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar empresa</DialogTitle>
            </DialogHeader>
            <CompanyForm
              variant="inline"
              existingCompanyNames={companies.map((c) => c.name)}
              onSuccess={() => setDialogOpen(false)}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl border border-app-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-app-muted">Cargando...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nombre</TableHead>
                <TableHead>Industria</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Procesos Activos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-center text-app-muted py-8" colSpan={6}>
                    No hay empresas registradas
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((company) => (
                  <TableRow key={company.company_id} className="hover:bg-app-bg/50">
                    <TableCell className="font-medium text-app-text flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-app-accent/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-app-accent" />
                      </span>
                      {company.name}
                    </TableCell>
                    <TableCell className="text-app-text">{company.business_type}</TableCell>
                    <TableCell className="text-app-text">{company.contact_name ?? '—'}</TableCell>
                    <TableCell className="text-app-text">{company.contact_email ?? '—'}</TableCell>
                    <TableCell className="text-app-text">{company.contact_phone ?? '—'}</TableCell>
                    <TableCell className="text-right text-app-text">
                      {company.active_process_count ?? 0}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}