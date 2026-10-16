/**
 * Test: StepSetup — module grid, dedup greying, certification toggle, submit payload
 *
 * Verifies:
 * - Renders the 5 module cards using MODULE_LABELS
 * - A module already taken by the company is disabled and visually muted
 * - Submit is blocked when the selected module is taken
 * - Submit calls startProcess with { company_id, perfilamiento_module, needs_certification }
 *   and forwards (processId, module) to onCreated
 * - The "Necesita certificación ISO" checkbox is present and toggles
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const mockDuplicates = { taken_modules: [] as string[], taken_iso_standards: [] as string[] };
const mockDuplicatesState = { isLoading: false, isFetching: false };
vi.mock('../../../hooks/useProcessDuplicates', () => ({
  useProcessDuplicates: () => ({
    data: mockDuplicates,
    isLoading: mockDuplicatesState.isLoading,
    isFetching: mockDuplicatesState.isFetching,
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

describe('StepSetup — module grid, dedup, certification, submit', () => {
  beforeEach(() => {
    mockListCompanies.mockReset();
    mockCreateCompany.mockReset();
    mockStartProcessMutateAsync.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
    mockListCompanies.mockResolvedValue([COMPANY]);
    mockDuplicates.taken_modules = [];
    mockDuplicates.taken_iso_standards = [];
    mockDuplicatesState.isLoading = false;
    mockDuplicatesState.isFetching = false;
  });

  it('disables submit while the duplicates check is loading', async () => {
    mockDuplicatesState.isLoading = true;
    mockDuplicatesState.isFetching = true;
    renderStepSetup(<StepSetup onCreated={vi.fn()} />);
    await screen.findByText('Acme Inc - manufactura');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c-1' } });
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeDisabled();
  });

  it('renders the 5 module cards with their labels', async () => {
    renderStepSetup(<StepSetup onCreated={vi.fn()} />);
    await screen.findByText('Acme Inc - manufactura');
    expect(screen.getByText('Optimización de Procesos')).toBeInTheDocument();
    expect(screen.getByText('Seguridad y salud en el trabajo')).toBeInTheDocument();
    expect(screen.getByText('Normas técnicas sectoriales')).toBeInTheDocument();
    expect(screen.getByText('Sostenibilidad y ambiental')).toBeInTheDocument();
    expect(screen.getByText('Planificación estratégica')).toBeInTheDocument();
  });

  it('greys out (disables) a module that is already taken', async () => {
    mockDuplicates.taken_modules = ['sst'];
    renderStepSetup(<StepSetup onCreated={vi.fn()} />);
    await screen.findByText('Acme Inc - manufactura');
    const takenRadio = screen.getByRole('radio', { name: /Seguridad y salud en el trabajo/ });
    expect(takenRadio).toBeDisabled();
    expect(screen.getByText('Ya existe un proceso')).toBeInTheDocument();
  });

  it('prevents submit when the selected module is taken', async () => {
    mockDuplicates.taken_modules = ['optimizacion'];
    renderStepSetup(<StepSetup onCreated={vi.fn()} />);
    await screen.findByText('Acme Inc - manufactura');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c-1' } });
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeDisabled();
  });

  it('submits the correct payload and calls onCreated', async () => {
    mockStartProcessMutateAsync.mockResolvedValue({ id: 'p-1' });
    const onCreated = vi.fn();
    renderStepSetup(<StepSetup onCreated={onCreated} />);
    await screen.findByText('Acme Inc - manufactura');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c-1' } });
    fireEvent.click(screen.getByRole('radio', { name: /Seguridad y salud en el trabajo/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Necesita certificación ISO/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    await waitFor(() => {
      expect(mockStartProcessMutateAsync).toHaveBeenCalledWith({
        company_id: 'c-1',
        perfilamiento_module: 'sst',
        needs_certification: true,
      });
      expect(onCreated).toHaveBeenCalledWith('p-1', 'sst');
    });
  });

  it('defaults needs_certification to false in the submit payload', async () => {
    mockStartProcessMutateAsync.mockResolvedValue({ id: 'p-1' });
    renderStepSetup(<StepSetup onCreated={vi.fn()} />);
    await screen.findByText('Acme Inc - manufactura');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    await waitFor(() => {
      expect(mockStartProcessMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ needs_certification: false, perfilamiento_module: 'optimizacion' }),
      );
    });
  });
});
