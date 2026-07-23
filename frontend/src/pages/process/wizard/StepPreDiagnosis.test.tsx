/**
 * Test: StepPreDiagnosis — sub-step navigation, cards/chips rendering, review, submit
 *
 * Verifies:
 * - Renders loading state while fetching
 * - Renders fallback when isoStandard prop is missing
 * - Shows first group + progress bar ("Paso 1 de N+1") with required asterisks
 * - Next button is disabled until required text fields are filled, then advances
 * - "Sugerir con IA" button on chips questions populates the chips value
 * - "Revisar" navigates to the review step which lists answers as badges for chips
 * - "Enviar pre-diagnóstico" calls savePreDiagnosis and onDone
 * - Shows error message and does not call onDone when save rejects
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
      id: 'perfil',
      title: 'Perfil',
      clauses: [],
      questions: [
        { id: 'q1', type: 'text', label: '¿Nombre del responsable?', required: true, placeholder: 'Nombre' },
        { id: 'q2', type: 'chips', label: 'Objetivos', required: false, options: ['Reducir no conformidades', 'Mejorar trazabilidad'] },
      ],
    },
    {
      id: 'madurez',
      title: 'Madurez',
      clauses: [],
      questions: [
        { id: 'q3', type: 'cards', label: 'Nivel de madurez', required: true, options: ['Básico', 'Intermedio', 'Avanzado'] },
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

const ISO = 'iso9001' as const;

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
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(screen.getByText(/Cargando pre-diagnóstico/i)).toBeInTheDocument();
  });

  it('renders a fallback when isoStandard prop is missing', () => {
    render(
      // @ts-expect-error: intentionally omitting isoStandard to test fallback
      <StepPreDiagnosis processId="p-1" onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(screen.getByText(/Falta la norma ISO/i)).toBeInTheDocument();
  });

  it('renders first group title, labels, required asterisk and progress indicator', () => {
    render(
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(screen.getByText('Perfil')).toBeInTheDocument();
    expect(screen.getByText('¿Nombre del responsable?')).toBeInTheDocument();
    expect(screen.getByText('Objetivos')).toBeInTheDocument();
    // Only q1 (text) is required in the first group => one asterisk span
    expect(document.querySelectorAll('.text-red-500.ml-1').length).toBe(1);
    // Progress indicator text "Paso 1 de N+1" (groups.length=2 => 3 total steps)
    expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument();
  });

  it('Next is disabled until required text field is filled, then advances to the second group', () => {
    render(
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    const next = screen.getByRole('button', { name: /Siguiente/i });
    // Required q1 empty => disabled
    expect(next).toBeDisabled();
    // Fill required text field
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    // Second group rendered
    expect(screen.getByText('Madurez')).toBeInTheDocument();
    expect(screen.getByText('Nivel de madurez')).toBeInTheDocument();
  });

  it('"Sugerir con IA" button populates the chips value with suggested objectives', () => {
    const onDirtyChange = vi.fn();
    render(
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    // Fill required text field to allow navigation later
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    // Click IA suggestion button
    fireEvent.click(screen.getByRole('button', { name: /Sugerir con IA/i }));
    // The first suggested objective for iso9001 is "Reducir no conformidades",
    // which is also one of the options => it should now render as a selected chip.
    // Multiple chips may render "Reducir no conformidades"; assert at least one selected chip.
    const selectedChips = document.querySelectorAll('.bg-app-primary.text-white');
    expect(selectedChips.length).toBeGreaterThan(0);
  });

  it('"Revisar" navigates to the review step which lists answers, then "Enviar" submits', async () => {
    const onDone = vi.fn();
    mockSavePreDiagnosis.mockResolvedValue({ id: 'p-1' });
    render(
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={onDone} onDirtyChange={vi.fn()} />,
    );
    // --- Substep 0 (Perfil) ---
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    // --- Substep 1 (Madurez) ---
    const revisar = screen.getByRole('button', { name: /Revisar/i });
    // q3 (cards required) empty => disabled
    expect(revisar).toBeDisabled();
    // Click the "Avanzado" maturity card (MaturityCards renders its label as a clickable button via Card onClick)
    fireEvent.click(screen.getByText('Avanzado'));
    expect(revisar).toBeEnabled();
    fireEvent.click(revisar);

    // --- Substep 2 (Review) ---
    // Review step shows answers including the text value and selected maturity.
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Avanzado')).toBeInTheDocument();
    // Submit button present
    const submit = screen.getByRole('button', { name: /Enviar pre-diagnóstico/i });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(mockSavePreDiagnosis).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ q1: 'Ana', q3: 'Avanzado' }),
        { token: 'test-token' },
      );
      expect(onDone).toHaveBeenCalled();
    });
  });

  it('shows an error message and does NOT call onDone when savePreDiagnosis rejects', async () => {
    const onDone = vi.fn();
    mockSavePreDiagnosis.mockRejectedValue({ status: 500 });
    render(
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={onDone} onDirtyChange={vi.fn()} />,
    );
    // Fill required and advance through both groups to review.
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    fireEvent.click(screen.getByText('Avanzado'));
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enviar pre-diagnóstico/i }));
    await waitFor(() => {
      expect(mockSavePreDiagnosis).toHaveBeenCalled();
    });
    expect(await screen.findByText(/Error interno del servidor/i)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('"Anterior" returns to the previous sub-step', () => {
    render(
      <StepPreDiagnosis processId="p-1" isoStandard={ISO} onDone={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    // Now on substep 1 (Madurez) — "Anterior" should be visible
    const anterior = screen.getByRole('button', { name: /Anterior/i });
    fireEvent.click(anterior);
    expect(screen.getByText('Perfil')).toBeInTheDocument();
  });
});