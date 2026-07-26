/**
 * Test: useCreateCompany — mutation hook
 *
 * Verifies:
 *  - On success it invalidates ['companies'] and ['processes'] query keys
 *  - On failure it shows a danger toast with the mapped message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockGetToken = vi.fn(() => 'test-token');
const mockCreateCompany = vi.fn();
const toastSuccess = vi.fn();
const toastDanger = vi.fn();

vi.mock('../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../components/ui/toast', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    danger: (...a: unknown[]) => toastDanger(...a),
  },
}));

vi.mock('../api/company', () => ({
  createCompany: (...a: unknown[]) => mockCreateCompany(...a),
}));

import { useCreateCompany } from './useCompanies';

function Harness({
  onMutation,
}: {
  onMutation: (m: UseMutationResult<unknown, unknown, unknown, unknown>) => void;
}) {
  const mutation = useCreateCompany() as unknown as UseMutationResult<unknown, unknown, unknown, unknown>;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    onMutation(mutation);
  }, [mutation, onMutation]);
  return null;
}

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return client;
}

function renderWithClient(client: QueryClient, ui: ReactNode) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('useCreateCompany', () => {
  beforeEach(() => {
    mockCreateCompany.mockReset();
    toastSuccess.mockReset();
    toastDanger.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
  });

  it('invalidates [companies] and [processes] on success', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mockCreateCompany.mockResolvedValue({ company_id: 'c1' });

    const payload = {
      name: 'Acme',
      business_type: 'general',
      contact_name: 'Ana',
      contact_email: 'ana@a.com',
    };
    const onMutation = (m: UseMutationResult<unknown, unknown, unknown, unknown>) => {
      m.mutateAsync(payload);
    };

    renderWithClient(client, <Harness onMutation={onMutation} />);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((c) => c[0]).map((q) => q?.queryKey);
      expect(keys).toContainEqual(['companies']);
      expect(keys).toContainEqual(['processes']);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Empresa registrada exitosamente');
  });

  it('shows a danger toast on failure', async () => {
    const client = makeClient();
    mockCreateCompany.mockRejectedValue({ status: 500 });

    const payload = {
      name: 'Acme',
      business_type: 'general',
      contact_name: 'Ana',
      contact_email: 'ana@a.com',
    };
    const onMutation = (m: UseMutationResult<unknown, unknown, unknown, unknown>) => {
      m.mutateAsync(payload).catch(() => {});
    };

    renderWithClient(client, <Harness onMutation={onMutation} />);

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalled();
    });
    expect(toastDanger.mock.calls[0][0]).toBe('Error interno del servidor. Contacta al administrador.');
  });
});