/**
 * Test: StepPreDiagnosis — loads pre_diagnosis questions, renders them, submits
 *
 * Verifies:
 * - Renders loading state while fetching
 * - Renders question groups and required asterisks
 * - Calls savePreDiagnosis on submit and notifies parent via onDone
 *
 * NOTE: useQuestionnaire is fully mocked (returns a plain object), so we do NOT
 * wrap with QueryClientProvider. In this project's test environment the React
 * Compiler + react-hook-form + QueryClientProvider combination throws a
 * "Objects are not valid as a React child" error unrelated to component logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { Questionnaire } from '../../../api/questionnaire';
import type { UseQueryResult } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuestionnaire: Questionnaire = {
  iso_standard: 'pre_diagnosis',
  title: 'Pre-diagnóstico',
  description: '',
  groups: [
    {
      id: 'g1',
      title: 'General',
      clauses: [],
      questions: [
        { id: 'q1', type: 'text', label: '¿Nombre del responsable?', required: true, placeholder: 'Nombre' },
        { id: 'q2', type: 'select', label: '¿Tiene sistema actual?', required: false, options: ['Sí', 'No'] },
      ],
    },
  ],
};

const mockGetToken = vi.fn(() => 'test-token');
const mockSavePreDiagnosis = vi.fn();

vi.mock('../../../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../../../hooks/useQuestionnaire', () => ({
  useQuestionnaire: vi.fn(() => ({
    data: mockQuestionnaire,
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../../../api/process', () => ({
  savePreDiagnosis: (...args: unknown[]) => mockSavePreDiagnosis(...args),
}));

import { useQuestionnaire } from '../../../hooks/useQuestionnaire';
import { StepPreDiagnosis } from './StepPreDiagnosis';

function setQuestionnaire(data: Questionnaire | undefined, isLoading: boolean, error: unknown) {
  vi.mocked(useQuestionnaire).mockReturnValue({
    data,
    isLoading,
    error,
  } as unknown as UseQueryResult<Questionnaire>);
}

describe('StepPreDiagnosis', () => {
  beforeEach(() => {
    mockSavePreDiagnosis.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
    setQuestionnaire(mockQuestionnaire, false, null);
  });

  it('renders loading state while fetching', () => {
    setQuestionnaire(undefined, true, null);
    render(
      <StepPreDiagnosis processId="p-1" onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(screen.getByText(/Cargando pre-diagnóstico/i)).toBeInTheDocument();
  });

  it('renders question group title, labels, and a required asterisk', () => {
    render(
      <StepPreDiagnosis processId="p-1" onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('¿Nombre del responsable?')).toBeInTheDocument();
    expect(screen.getByText('¿Tiene sistema actual?')).toBeInTheDocument();
    // One required question => one asterisk span (text-red-500 ml-1)
    expect(document.querySelectorAll('.text-red-500.ml-1').length).toBe(1);
  });

  it('calls savePreDiagnosis and onDone on submit', async () => {
    const onDone = vi.fn();
    mockSavePreDiagnosis.mockResolvedValue({ id: 'p-1' });
    render(
      <StepPreDiagnosis processId="p-1" onDone={onDone} onDirtyChange={vi.fn()} />,
    );
    // Fill required text input
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    await waitFor(() => {
      expect(mockSavePreDiagnosis).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ q1: 'Ana' }),
        { token: 'test-token' },
      );
      expect(onDone).toHaveBeenCalled();
    });
  });

  it('shows an error message and does NOT call onDone when savePreDiagnosis rejects', async () => {
    const onDone = vi.fn();
    mockSavePreDiagnosis.mockRejectedValue({ status: 500 });
    render(
      <StepPreDiagnosis processId="p-1" onDone={onDone} onDirtyChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
    await waitFor(() => {
      expect(mockSavePreDiagnosis).toHaveBeenCalled();
    });
    // The error message from error-utils for status 500
    expect(await screen.findByText(/Error interno del servidor/i)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});