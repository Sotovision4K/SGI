/**
 * Test: PlanResultView — inline task editing (Phase 6: editable plan tasks)
 *
 * Verifies:
 *  - Read-only rendering intact; each card has an edit affordance ("Editar tarea")
 *  - Edit mode shows a form prefilled with the task values
 *  - Save sends only the changed fields via useUpdateTask
 *  - Toggling require_document off sends require_document:false + document_title:null
 *  - Saving with no changes exits edit mode without calling the mutation
 *  - Cancel discards local edits and returns to read-only
 *  - Only one card can be in edit mode at a time
 *  - document_title input appears only when require_document is checked
 *  - Empty title shows a validation error and blocks the mutation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Plan, PlanTask } from '../../api/plan';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockMutate = vi.fn();

vi.mock('../../hooks/usePlan', () => ({
  useUpdateTask: () => ({ mutate: mockMutate, isPending: false }),
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
  summary_md: '',
  generated_at: '2026-01-01T00:00:00Z',
  tasks: [TASK_1, TASK_2],
};

describe('PlanResultView — inline task editing', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    // Simulate TanStack mutate: invoke the per-call onSuccess so the card exits edit mode
    mockMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
  });

  it('renders read-only cards with an edit button per task', () => {
    render(<PlanResultView plan={PLAN} />);
    expect(screen.getByText('Revisar política de calidad')).toBeInTheDocument();
    expect(screen.getByText('Capacitar al personal')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar tarea' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('opens an inline edit form prefilled with the task values', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    expect(screen.getByDisplayValue('Revisar política de calidad')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Descripción inicial')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Prioridad' })).toHaveValue('high');
    expect(screen.getByDisplayValue('4 horas')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Responsable de calidad')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByDisplayValue('Política de calidad')).toBeInTheDocument();
  });

  it('save sends only the changed fields', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    fireEvent.change(screen.getByDisplayValue('Revisar política de calidad'), {
      target: { value: 'Nuevo título' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      { taskId: 'task-1', input: { title: 'Nuevo título' } },
      expect.anything(),
    );
    // Edit mode exits after a successful save
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar tarea' })).toHaveLength(2);
  });

  it('toggling require_document off sends require_document:false and document_title:null', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    fireEvent.click(screen.getByRole('checkbox')); // uncheck
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockMutate).toHaveBeenCalledWith(
      { taskId: 'task-1', input: { require_document: false, document_title: null } },
      expect.anything(),
    );
  });

  it('saving with no changes exits edit mode without calling the mutation', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar tarea' })).toHaveLength(2);
  });

  it('cancel discards changes and returns to read-only', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    fireEvent.change(screen.getByDisplayValue('Revisar política de calidad'), {
      target: { value: 'Cambio descartado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.getByText('Revisar política de calidad')).toBeInTheDocument();
  });

  it('only one card is in edit mode at a time', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    expect(screen.getByDisplayValue('Revisar política de calidad')).toBeInTheDocument();
    // task-1's card no longer shows an edit button; only task-2's remains
    const remaining = screen.getAllByRole('button', { name: 'Editar tarea' });
    expect(remaining).toHaveLength(1);
    fireEvent.click(remaining[0]); // start editing task-2 → cancels task-1
    expect(screen.queryByDisplayValue('Revisar política de calidad')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Capacitar al personal')).toBeInTheDocument();
  });

  it('document_title input appears only when require_document is checked', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[1]);
    expect(
      screen.queryByPlaceholderText(/Procedimiento de control/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox')); // check
    expect(screen.getByPlaceholderText(/Procedimiento de control/)).toBeInTheDocument();
  });

  it('shows a validation error on empty title and does not call the mutation', () => {
    render(<PlanResultView plan={PLAN} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar tarea' })[0]);
    fireEvent.change(screen.getByDisplayValue('Revisar política de calidad'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('El título es obligatorio')).toBeInTheDocument();
    // Still in edit mode
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });
});
