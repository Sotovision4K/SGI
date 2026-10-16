/**
 * Test: ProfilingForm — adaptive group visibility, validation, chips, submit payload
 *
 * Verifies:
 * - Renders the always-visible base groups (perfil, contexto, selector) and the
 *   callout, with no module group shown until a need is selected
 * - Submit button is disabled while any visible required question is empty
 * - Selecting a need reveals its module group and hides the callout
 * - Switching the selector swaps the visible module group
 * - Chips buttons toggle their `aria-pressed` state
 * - Happy path: filling required fields produces a correct ProfilingSubmission
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilingForm } from './ProfilingForm';
import type { ProfilingQuestionnaire } from '../../api/profiling';

// ── Fixture ────────────────────────────────────────────────────────────────

const questionnaire: ProfilingQuestionnaire = {
  iso_standard: 'profiling',
  title: 'Perfilamiento',
  description: '',
  groups: [
    {
      id: 'perfil',
      title: 'Perfil de la empresa',
      clauses: [],
      questions: [
        { id: 'base_01', type: 'text', label: 'Razón social y NIT', required: true, placeholder: 'Razón social' },
      ],
    },
    {
      id: 'contexto',
      title: 'Contexto y madurez',
      clauses: [],
      questions: [
        { id: 'base_05', type: 'select', label: 'Nivel de madurez', required: true, options: ['Básico', 'Avanzado'] },
      ],
    },
    {
      id: 'selector',
      title: 'Necesidad principal',
      clauses: [],
      questions: [
        { id: 'base_08', type: 'select', label: 'Necesidad principal', required: true, options: ['Optimización de Procesos', 'Seguridad y salud en el trabajo'] },
      ],
    },
    {
      id: 'optimizacion',
      title: 'Módulo: Optimización de Procesos',
      clauses: [],
      questions: [
        { id: 'opt_01', type: 'select', label: 'Objetivo en procesos', required: true, options: ['Estandarizar', 'Certificar'] },
        { id: 'opt_02', type: 'chips', label: 'Normas a integrar', required: false, options: ['ISO 14001', 'ISO 45001'] },
      ],
    },
    {
      id: 'sst',
      title: 'Módulo: Seguridad y salud en el trabajo',
      clauses: [],
      questions: [
        { id: 'sst_01', type: 'select', label: 'Objetivo SST', required: true, options: ['Cumplir', 'Certificar ISO 45001'] },
      ],
    },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Find the <select> whose options include `optionText`, then fire a change. */
function selectOption(optionText: string) {
  const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
  const target = selects.find((s) => Array.from(s.options).some((o) => o.textContent === optionText));
  if (!target) throw new Error(`select containing option "${optionText}" not found`);
  fireEvent.change(target, { target: { value: optionText } });
}

/** Fill the pain-points textarea (the only <textarea> in the form). */
function fillPainPoints(text: string, container: HTMLElement) {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProfilingForm', () => {
  it('renders base groups + selector, no module initially, shows callout', () => {
    render(<ProfilingForm questionnaire={questionnaire} onSubmit={vi.fn()} />);

    expect(screen.getByText('Perfil de la empresa')).toBeInTheDocument();
    expect(screen.getByText('Contexto y madurez')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Necesidad principal' })).toBeInTheDocument();
    expect(screen.queryByText('Módulo: Optimización de Procesos')).not.toBeInTheDocument();
    expect(screen.getByText(/Seleccione la necesidad principal/i)).toBeInTheDocument();
  });

  it('disables submit while required fields are empty', () => {
    render(<ProfilingForm questionnaire={questionnaire} onSubmit={vi.fn()} />);

    const submit = screen.getByRole('button', { name: /Generar análisis/i });
    expect(submit).toBeDisabled();
  });

  it('reveals the selected module questions and hides the callout', () => {
    render(<ProfilingForm questionnaire={questionnaire} onSubmit={vi.fn()} />);

    selectOption('Optimización de Procesos');

    expect(screen.getByText('Módulo: Optimización de Procesos')).toBeInTheDocument();
    expect(screen.getByText('Objetivo en procesos')).toBeInTheDocument();
    expect(screen.queryByText(/Seleccione la necesidad principal/i)).not.toBeInTheDocument();
  });

  it('swaps the visible module group when the selector changes', () => {
    render(<ProfilingForm questionnaire={questionnaire} onSubmit={vi.fn()} />);

    selectOption('Optimización de Procesos');
    selectOption('Seguridad y salud en el trabajo');

    expect(screen.getByText('Módulo: Seguridad y salud en el trabajo')).toBeInTheDocument();
    expect(screen.queryByText('Objetivo en procesos')).not.toBeInTheDocument();
  });

  it('toggles chips via aria-pressed', () => {
    render(<ProfilingForm questionnaire={questionnaire} onSubmit={vi.fn()} />);

    selectOption('Optimización de Procesos');

    const chip = screen.getByRole('button', { name: 'ISO 14001' });
    fireEvent.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('pre-seeds pain points from defaultValues on resume/edit', () => {
    const { container } = render(
      <ProfilingForm
        questionnaire={questionnaire}
        onSubmit={vi.fn()}
        defaultValues={{ pain_points: 'Observaciones previas' }}
      />,
    );

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Observaciones previas');
  });

  it('submits the correct payload on the happy path', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <ProfilingForm questionnaire={questionnaire} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByPlaceholderText('Razón social'), { target: { value: 'Empresa SA' } });
    selectOption('Básico');
    selectOption('Optimización de Procesos');
    selectOption('Estandarizar');
    fillPainPoints('Observaciones del auditor', container);

    fireEvent.click(screen.getByRole('button', { name: /Generar análisis/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'optimizacion',
        painPoints: 'Observaciones del auditor',
        answers: expect.objectContaining({
          base_01: 'Empresa SA',
          base_08: 'Optimización de Procesos',
          opt_01: 'Estandarizar',
        }),
      }),
    );
  });
});
