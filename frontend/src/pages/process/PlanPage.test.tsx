/**
 * Test: PlanPage — standalone read-only plan view
 *
 * Verifies:
 *  - Renders the plan: header title, company/ISO subtitle, back link, summary, tasks
 *  - Subtitle is hidden while the process data is not present
 *  - Loading state shows "Cargando plan..."
 *  - Error state shows ErrorState with the mapped message and a retry action
 *  - Missing plan (no data, no error) shows a not-found message
 *  - Read-only: no "Editar tarea" buttons are rendered
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Process } from '../../api/process';
import type { Plan, PlanTask } from '../../api/plan';

// ── Mocks ──────────────────────────────────────────────────────────────────

interface QueryResultLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

let processResult: QueryResultLike<Process>;
let planResult: QueryResultLike<Plan>;

vi.mock('../../hooks/useProcess', () => ({
  useProcess: () => processResult,
}));

vi.mock('../../hooks/usePlan', () => ({
  usePlan: () => planResult,
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../components/ui/toast', () => ({
  toast: { success: vi.fn(), danger: vi.fn() },
}));

import { PlanPage } from './PlanPage';

// ── Fixtures ───────────────────────────────────────────────────────────────

const PROCESS: Process = {
  id: 'proc-1',
  consultant_id: 'user-1',
  company_id: 'comp-1',
  company_name: 'Acme Inc',
  iso_standard: 'iso9001',
  status: 'plan_ready',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const TASK_1: PlanTask = {
  id: 'task-1',
  title: 'Revisar política de calidad',
  description: 'Descripción inicial',
  priority: 'high',
  estimated_effort: '4 horas',
  owner_role: 'Responsable de calidad',
  sort_order: 0,
  source_clause: 'ISO 9001 - 5.2',
  require_document: true,
  document_title: 'Política de calidad',
};

const TASK_2: PlanTask = {
  id: 'task-2',
  title: 'Capacitar al personal',
  description: '',
  priority: 'low',
  estimated_effort: '2 horas',
  owner_role: 'RRHH',
  sort_order: 1,
  source_clause: 'ISO 9001 - 7.2',
  require_document: false,
  document_title: null,
};

const PLAN: Plan = {
  process_id: 'proc-1',
  summary_md: 'El plan prioriza controles documentales y formación del personal.',
  generated_at: '2026-01-01T00:00:00Z',
  tasks: [TASK_1, TASK_2],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/processes/proc-1/plan']}>
      <Routes>
        <Route path="/processes/:processId/plan" element={<PlanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlanPage', () => {
  beforeEach(() => {
    processResult = {
      data: PROCESS,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    planResult = {
      data: PLAN,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  it('renders the plan with header title, company subtitle, summary and task titles', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Plan de acción', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Acme Inc · iso9001')).toBeInTheDocument();
    expect(screen.getByText(/El plan prioriza controles documentales/)).toBeInTheDocument();
    expect(screen.getByText('Revisar política de calidad')).toBeInTheDocument();
    expect(screen.getByText('Capacitar al personal')).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: 'Volver al proceso' });
    expect(backLink).toHaveAttribute('href', '/processes/proc-1');
  });

  it('hides the company subtitle while the process data is not present', () => {
    processResult = { ...processResult, data: undefined };
    renderPage();

    expect(screen.getByRole('heading', { name: 'Plan de acción', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('Acme Inc · iso9001')).not.toBeInTheDocument();
  });

  it('shows the loading message while the plan is loading', () => {
    planResult = { ...planResult, data: undefined, isLoading: true };
    renderPage();

    expect(screen.getByText('Cargando plan...')).toBeInTheDocument();
  });

  it('shows the error state with the mapped message and a retry action', () => {
    planResult = { ...planResult, data: undefined, isError: true, error: new Error('boom') };
    renderPage();

    expect(screen.getByText('No se pudo cargar el plan')).toBeInTheDocument();
    expect(screen.getByText('Error inesperado. Contacta al administrador.')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);
    expect(planResult.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a not-found message when there is no plan for the process', () => {
    planResult = { ...planResult, data: undefined };
    renderPage();

    expect(screen.getByText('No se encontró el plan para este proceso.')).toBeInTheDocument();
  });

  it('renders the plan read-only (no edit buttons)', () => {
    renderPage();

    expect(screen.queryAllByRole('button', { name: 'Editar tarea' })).toHaveLength(0);
  });
});
