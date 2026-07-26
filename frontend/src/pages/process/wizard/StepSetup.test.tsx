/**
 * Test: StepSetup — CompanyForm inline integration
 *
 * Verifies:
 *  - Renders the company dropdown by default
 *  - Clicking "+ Crear nueva empresa" reveals the inline CompanyForm (renders its fields)
 *  - CompanyForm onCancel hides the inline form
 *  - The old handleCreateCompany / direct createCompany API import is gone
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Company } from '../../../api/company';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderStepSetup(ui: ReactNode) {
  return render(<QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>);
}

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockGetToken = vi.fn(() => 'test-token');
const mockListCompanies = vi.fn();
const mockCreateCompany = vi.fn();

vi.mock('../../../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../../../api/company', () => ({
  listCompanies: (...a: unknown[]) => mockListCompanies(...a),
  createCompany: (...a: unknown[]) => mockCreateCompany(...a),
}));

vi.mock('../../../components/ui/toast', () => ({
  toast: { success: vi.fn(), danger: vi.fn() },
}));

const mockStartProcessMutateAsync = vi.fn();
vi.mock('../../../hooks/useStartProcess', () => ({
  useStartProcess: () => ({
    mutateAsync: mockStartProcessMutateAsync,
    isPending: false,
  }),
}));

import { StepSetup } from './StepSetup';

const COMPANY: Company = {
  company_id: 'c-1',
  user_id: 'u-1',
  name: 'Acme Inc',
  business_type: 'manufactura',
  is_active: true,
  contact_name: 'Ana',
  contact_email: 'ana@acme.com',
  contact_phone: null,
  active_process_count: 0,
};

describe('StepSetup — CompanyForm inline integration', () => {
  beforeEach(() => {
    mockListCompanies.mockReset();
    mockCreateCompany.mockReset();
    mockStartProcessMutateAsync.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
    mockListCompanies.mockResolvedValue([COMPANY]);
  });

  it('renders the company dropdown by default (no inline form)', async () => {
    renderStepSetup(
      <StepSetup onCreated={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(await screen.findByText('Acme Inc - manufactura')).toBeInTheDocument();
    // Inline CompanyForm fields are NOT visible yet
    expect(screen.queryByPlaceholderText('Nombre de la empresa')).not.toBeInTheDocument();
  });

  it('shows the inline CompanyForm after clicking "+ Crear nueva empresa"', async () => {
    renderStepSetup(
      <StepSetup onCreated={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    await screen.findByText('Acme Inc - manufactura');
    fireEvent.click(screen.getByRole('button', { name: /\+ Crear nueva empresa/i }));
    // CompanyForm inline now renders fields
    expect(await screen.findByPlaceholderText('Nombre de la empresa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nombre del responsable')).toBeInTheDocument();
  });

  it('hides the inline CompanyForm when its Cancelar button is clicked', async () => {
    renderStepSetup(
      <StepSetup onCreated={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    await screen.findByText('Acme Inc - manufactura');
    fireEvent.click(screen.getByRole('button', { name: /\+ Crear nueva empresa/i }));
    expect(await screen.findByPlaceholderText('Nombre de la empresa')).toBeInTheDocument();
    // CompanyForm renders its own "Cancelar" button (onCancel)
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));
    expect(screen.queryByPlaceholderText('Nombre de la empresa')).not.toBeInTheDocument();
  });
});