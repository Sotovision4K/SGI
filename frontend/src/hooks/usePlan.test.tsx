/**
 * Test: useUpdateTask — mutation hook (Phase 6: editable plan tasks)
 *
 * Verifies:
 *  - Calls updateTask(processId, taskId, input, { token })
 *  - On success invalidates ['plan', processId] and shows a success toast
 *  - On failure shows a danger toast with the mapped status message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockGetToken = vi.fn(() => 'test-token');
const mockGetFindings = vi.fn();
const mockSaveFindings = vi.fn();
const mockGeneratePlan = vi.fn();
const mockUpdateTask = vi.fn();
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

vi.mock('../api/plan', () => ({
  getFindings: (...a: unknown[]) => mockGetFindings(...a),
  saveFindings: (...a: unknown[]) => mockSaveFindings(...a),
  generatePlan: (...a: unknown[]) => mockGeneratePlan(...a),
  updateTask: (...a: unknown[]) => mockUpdateTask(...a),
}));

import { useUpdateTask } from './usePlan';
import type { PlanTask } from '../api/plan';

const UPDATED_TASK: PlanTask = {
  id: 'task-1',
  title: 'Nuevo título',
  description: 'Descripción inicial',
  priority: 'high',
  estimated_effort: '4 horas',
  owner_role: 'Responsable de calidad',
  sort_order: 0,
  source_clause: 'ISO 9001 - 5.2',
  require_document: true,
  document_title: 'Política de calidad',
};

function Harness({
  processId,
  onMutation,
}: {
  processId: string;
  onMutation: (m: UseMutationResult<unknown, unknown, unknown, unknown>) => void;
}) {
  const mutation = useUpdateTask(
    processId,
  ) as unknown as UseMutationResult<unknown, unknown, unknown, unknown>;
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

describe('useUpdateTask', () => {
  beforeEach(() => {
    mockGetFindings.mockReset();
    mockSaveFindings.mockReset();
    mockGeneratePlan.mockReset();
    mockUpdateTask.mockReset();
    toastSuccess.mockReset();
    toastDanger.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
  });

  it('calls updateTask with token and invalidates [plan, processId] on success', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mockUpdateTask.mockResolvedValue(UPDATED_TASK);

    const onMutation = (m: UseMutationResult<unknown, unknown, unknown, unknown>) => {
      m.mutateAsync({ taskId: 'task-1', input: { title: 'Nuevo título' } });
    };

    renderWithClient(client, <Harness processId="proc-1" onMutation={onMutation} />);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((c) => c[0]).map((q) => q?.queryKey);
      expect(keys).toContainEqual(['plan', 'proc-1']);
    });
    expect(mockUpdateTask).toHaveBeenCalledWith(
      'proc-1',
      'task-1',
      { title: 'Nuevo título' },
      { token: 'test-token' },
    );
    expect(toastSuccess).toHaveBeenCalledWith('Tarea actualizada correctamente');
  });

  it('shows a danger toast with the mapped message on failure', async () => {
    const client = makeClient();
    mockUpdateTask.mockRejectedValue({ status: 500 });

    const onMutation = (m: UseMutationResult<unknown, unknown, unknown, unknown>) => {
      m.mutateAsync({ taskId: 'task-1', input: { title: 'Nuevo título' } }).catch(() => {});
    };

    renderWithClient(client, <Harness processId="proc-1" onMutation={onMutation} />);

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalled();
    });
    expect(toastDanger).toHaveBeenCalledWith(
      'Error interno del servidor. Contacta al administrador.',
      { title: 'Error' },
    );
  });
});
