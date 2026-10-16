/**
 * Test: StepPerfilamiento — seeds base_08, submits to savePerfilamiento, error handling
 *
 * Verifies:
 * - The base_08 selector is pre-seeded from the `module` prop (and resolves the
 *   matching module group)
 * - Submit calls savePerfilamiento(processId, { answers, pain_points }) then onDone
 * - A rejected save shows a toast and does NOT advance (onDone not called)
 * - The submit button is disabled while required fields are empty
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProfilingQuestionnaire } from '../../../api/profiling';
import { StepPerfilamiento } from './StepPerfilamiento';

const mockQuestionnaire: ProfilingQuestionnaire = {
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
      id: 'selector',
      title: 'Necesidad principal',
      clauses: [],
      questions: [
        { id: 'base_08', type: 'select', label: 'Necesidad principal', required: true, options: ['Optimización de Procesos', 'Seguridad y salud en el trabajo'] },
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

const mockGetToken = vi.fn(() => 'test-token');
const mockSavePerfilamiento = vi.fn();
const { mockToastDanger } = vi.hoisted(() => ({ mockToastDanger: vi.fn() }));

vi.mock('../../../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../../../api/profiling', () => ({
  getProfilingQuestionnaire: () => mockQuestionnaire,
}));

vi.mock('../../../api/process', () => ({
  savePerfilamiento: (...a: unknown[]) => mockSavePerfilamiento(...a),
  MODULE_LABELS: {
    optimizacion: 'Optimización de Procesos',
    sst: 'Seguridad y salud en el trabajo',
    nts: 'Normas técnicas sectoriales',
    sos: 'Sostenibilidad y ambiental',
    planificacion: 'Planificación estratégica',
  },
}));

vi.mock('../../../components/ui/toast', () => ({
  toast: { success: vi.fn(), danger: mockToastDanger },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function selectOption(optionText: string) {
  const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
  const target = selects.find((s) => Array.from(s.options).some((o) => o.textContent === optionText));
  if (!target) throw new Error(`select containing option "${optionText}" not found`);
  fireEvent.change(target, { target: { value: optionText } });
}

function fillPainPoints(text: string, container: HTMLElement) {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
}

describe('StepPerfilamiento', () => {
  beforeEach(() => {
    mockSavePerfilamiento.mockReset();
    mockToastDanger.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
  });

  it('pre-seeds base_08 from the module prop and shows the module group', () => {
    render(<StepPerfilamiento processId="p-1" module="sst" onDone={vi.fn()} />);

    const selector = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.textContent === 'Seguridad y salud en el trabajo'),
    ) as HTMLSelectElement;
    expect(selector).toBeDefined();
    expect(selector.value).toBe('Seguridad y salud en el trabajo');
    expect(screen.getByText('Módulo: Seguridad y salud en el trabajo')).toBeInTheDocument();
  });

  it('disables submit while required fields are empty', () => {
    render(<StepPerfilamiento processId="p-1" module="sst" onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Generar análisis/i })).toBeDisabled();
  });

  it('calls savePerfilamiento and onDone on submit', async () => {
    mockSavePerfilamiento.mockResolvedValue({ id: 'p-1' });
    const onDone = vi.fn();
    const { container } = render(<StepPerfilamiento processId="p-1" module="sst" onDone={onDone} />);

    fireEvent.change(screen.getByPlaceholderText('Razón social'), { target: { value: 'Empresa SA' } });
    selectOption('Certificar ISO 45001');
    fillPainPoints('Observaciones del auditor', container);

    fireEvent.click(screen.getByRole('button', { name: /Generar análisis/i }));

    await waitFor(() => {
      expect(mockSavePerfilamiento).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({
          answers: expect.objectContaining({
            base_08: 'Seguridad y salud en el trabajo',
            sst_01: 'Certificar ISO 45001',
          }),
          pain_points: 'Observaciones del auditor',
        }),
        { token: 'test-token' },
      );
      expect(onDone).toHaveBeenCalled();
    });
  });

  it('shows a toast and does not advance when savePerfilamiento fails', async () => {
    mockSavePerfilamiento.mockRejectedValue({ status: 500 });
    const onDone = vi.fn();
    const { container } = render(<StepPerfilamiento processId="p-1" module="sst" onDone={onDone} />);

    fireEvent.change(screen.getByPlaceholderText('Razón social'), { target: { value: 'Empresa SA' } });
    selectOption('Certificar ISO 45001');
    fillPainPoints('Observaciones del auditor', container);

    fireEvent.click(screen.getByRole('button', { name: /Generar análisis/i }));

    await waitFor(() => {
      expect(mockSavePerfilamiento).toHaveBeenCalled();
      expect(mockToastDanger).toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    });
  });
});
