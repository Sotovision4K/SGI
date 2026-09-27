/**
 * Test: PlanResultView — kanban board (3 columns, drag & drop, complete, modal)
 *
 * Verifies:
 *  - Renders the three kanban columns (Pendiente / Iniciada / Completada)
 *  - Tasks are grouped by their `status`
 *  - An empty `department` renders a "Por definir" tag; a set one renders its name
 *  - The "Completar" button moves a task via useUpdateTask (status: 'completed')
 *  - Completed tasks do not show a "Completar" button
 *  - Clicking a card opens the edit dialog ("Editar tarea")
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Plan, PlanTask } from '../../api/plan';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockMutate = vi.fn();

vi.mock('../../hooks/usePlan', () => ({
  useUpdateTask: () => ({ mutate: mockMutate, isPending: false }),
  useTaskComments: () => ({ data: [] }),
  useAddTaskComment: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PlanResultView } from './PlanResultView';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TASK_1: PlanTask = {
  id: 'task-1',
  title: 'Revisar política de calidad',
  description: 'Descripción inicial',
  priority: 'high',
  estimated_effort: '4 horas',
  owner_role: 'Responsable de calidad',
  department: '',
  status: 'pending',
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
  department: 'Recursos Humanos',
  status: 'completed',
  sort_order: 1,
  source_clause: 'ISO 9001 - 7.2',
  require_document: false,
  document_title: null,
};

const PLAN: Plan = {
  process_id: 'proc-1',
  summary_md: '',
  generated_at: '2026-01-01T00:00:00Z',
  tasks: [TASK_1, TASK_2],
};

describe('PlanResultView — kanban board', () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it('renders the three columns and both task titles', () => {
    render(<PlanResultView plan={PLAN} />);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Iniciada')).toBeInTheDocument();
    expect(screen.getByText('Completada')).toBeInTheDocument();
    expect(screen.getByText('Revisar política de calidad')).toBeInTheDocument();
    expect(screen.getByText('Capacitar al personal')).toBeInTheDocument();
    expect(screen.getByText('(2 tareas)')).toBeInTheDocument();
  });

  it('renders a "Por definir" tag for an empty department', () => {
    render(<PlanResultView plan={PLAN} />);
    expect(screen.getByText('Por definir')).toBeInTheDocument();
  });

  it('renders the department name when set', () => {
    render(<PlanResultView plan={PLAN} />);
    expect(screen.getByText('Recursos Humanos')).toBeInTheDocument();
  });

  it('moving a task to completed calls useUpdateTask with status completed', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Completar tarea' }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      { taskId: 'task-1', input: { status: 'completed' } },
    );
  });

  it('does not show a "Completar" button on an already-completed task', () => {
    render(<PlanResultView plan={PLAN} />);
    // Only the pending task has the button (the completed one does not).
    expect(screen.getAllByRole('button', { name: 'Completar tarea' })).toHaveLength(1);
  });

  it('opens the edit dialog when a card is clicked', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar política de calidad/ }));
    expect(screen.getByText('Editar tarea')).toBeInTheDocument();
  });
});
