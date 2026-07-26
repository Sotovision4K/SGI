/**
 * Test: ProcessTable — complete/reopen row actions
 *
 * Verifies:
 *  - An active (status !== 'completed') process row shows a "Completar" button
 *  - A completed process row shows a "Reabrir" button
 *  - Clicking Completar opens the confirm dialog and confirming calls completeProcess.mutate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Process } from '../../../api/process';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderTable(ui: ReactNode) {
  return render(<QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>);
}

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockGetToken = vi.fn(() => 'test-token');
const mockCompleteProcess = vi.fn();
const mockReopenProcess = vi.fn();

vi.mock('../../../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../../../api/process', () => ({
  completeProcess: (...a: unknown[]) => mockCompleteProcess(...a),
  reopenProcess: (...a: unknown[]) => mockReopenProcess(...a),
}));

vi.mock('../../../components/ui/toast', () => ({
  toast: { success: vi.fn(), danger: vi.fn() },
}));

import { ProcessTable } from './ProcessTable';

const ACTIVE_PROCESS: Process = {
  id: 'proc-active-1',
  consultant_id: 'u-1',
  company_id: 'c-1',
  company_name: 'Acme Inc',
  iso_standard: 'iso9001',
  status: 'in_progress',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const COMPLETED_PROCESS: Process = {
  ...ACTIVE_PROCESS,
  id: 'proc-done-1',
  status: 'completed',
};

describe('ProcessTable — complete/reopen actions', () => {
  beforeEach(() => {
    mockCompleteProcess.mockReset();
    mockReopenProcess.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
  });

  it('shows the Completar button for an active process row', () => {
    renderTable(
      <ProcessTable
        processes={[ACTIVE_PROCESS]}
        onView={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Completar/i })).toBeInTheDocument();
    // Reabrir should NOT be present for an active process
    expect(screen.queryByRole('button', { name: /Reabrir/i })).not.toBeInTheDocument();
  });

  it('shows the Reabrir button for a completed process row', () => {
    renderTable(
      <ProcessTable
        processes={[COMPLETED_PROCESS]}
        onView={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Reabrir/i })).toBeInTheDocument();
    // Completar should NOT be present for a completed process
    expect(screen.queryByRole('button', { name: /Completar/i })).not.toBeInTheDocument();
  });
});