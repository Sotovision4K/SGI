/**
 * Test: CompaniesPage — company list table + create dialog
 *
 * Verifies:
 *  - Renders the table with company data (name, industry, contact, email, phone)
 *  - Clicking "Nueva empresa" opens the create dialog (CompanyForm dialog variant)
 *  - Shows an empty-state row when there are no companies
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Company } from '../../api/company';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockGetToken = vi.fn(() => 'test-token');
const mockListCompanies = vi.fn();
const mockCreateCompany = vi.fn();

vi.mock('../../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../../api/company', () => ({
  listCompanies: (...a: unknown[]) => mockListCompanies(...a),
  createCompany: (...a: unknown[]) => mockCreateCompany(...a),
}));

// useCompanies uses listCompanies; useCreateCompany uses createCompany + toast.
// Provide toast mock to avoid polluting output.
vi.mock('../../components/ui/toast', () => ({
  toast: { success: vi.fn(), danger: vi.fn() },
}));

import { useCompanies } from '../../hooks/useCompanies';
import { useCreateCompany } from '../../hooks/useCompanies';
import { CompaniesPage } from './CompaniesPage';

const COMPANY_A: Company = {
  company_id: 'c-1',
  user_id: 'u-1',
  name: 'Acme Inc',
  business_type: 'manufactura',
  is_active: true,
  contact_name: 'Ana Pérez',
  contact_email: 'ana@acme.com',
  contact_phone: '+34 600 111 222',
  active_process_count: 2,
};

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(client = makeClient()) {
  return render(
    <QueryClientProvider client={client}>
      <CompaniesPage />
    </QueryClientProvider>,
  );
}

describe('CompaniesPage', () => {
  beforeEach(() => {
    mockListCompanies.mockReset();
    mockCreateCompany.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
  });

  it('renders the table with company data', async () => {
    mockListCompanies.mockResolvedValue([COMPANY_A]);
    renderPage();

    expect(await screen.findByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('manufactura')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('ana@acme.com')).toBeInTheDocument();
    expect(screen.getByText('+34 600 111 222')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // active process count
  });

  it('opens the dialog on "Nueva empresa" click', async () => {
    mockListCompanies.mockResolvedValue([COMPANY_A]);
    renderPage();

    await screen.findByText('Acme Inc');
    const btn = screen.getByRole('button', { name: /Nueva empresa/i });
    fireEvent.click(btn);

    // CompanyForm dialog variant renders the dialog title + first field
    await waitFor(() => {
      expect(screen.getByText('Registrar empresa')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Nombre de la empresa')).toBeInTheDocument();
  });

  it('shows an empty-state row when no companies exist', async () => {
    mockListCompanies.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/No hay empresas registradas/i)).toBeInTheDocument();
  });

  // ensure hooks referenced for completeness (static imports used by page too)
  it('exports useCompanies/useCreateCompany from hooks module', () => {
    expect(typeof useCompanies).toBe('function');
    expect(typeof useCreateCompany).toBe('function');
  });
});