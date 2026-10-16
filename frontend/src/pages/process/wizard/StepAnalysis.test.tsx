/**
 * Test: StepAnalysis — runs profiling analysis, renders result, confirms
 *
 * Verifies:
 * - Calls analyzeProcessProfiling(processId, { token }) on mount
 * - Shows a loading state while the analysis is pending
 * - Renders the result via ProfilingResults once resolved
 * - "Confirmar" calls saveAnalysis(processId, result) then onDone
 * - On failure shows "Reintentar" which re-triggers the analysis
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProfilingResult } from '../../../api/profiling';
import { StepAnalysis } from './StepAnalysis';

const result: ProfilingResult = {
  pain_points_analysis: '## Falta de medición\n\nNo hay indicadores formales.',
  cost_estimation: { range_cop: '30 a 80 millones COP', breakdown: ['Consultoría'], confidence: 'high' },
  time_estimation: { months: 6, phases: ['Fase inicial'], confidence: 'medium' },
  action_plan: {
    phases: [{ name: 'Diagnóstico', duration_weeks: 4, activities: ['Levantar procesos'] }],
    milestones: ['Hito de lanzamiento'],
  },
};

const mockGetToken = vi.fn(() => 'test-token');
const mockAnalyzeProcessProfiling = vi.fn();
const mockSaveAnalysis = vi.fn();
const { mockToastDanger } = vi.hoisted(() => ({ mockToastDanger: vi.fn() }));

vi.mock('../../../lib/use-api-auth', () => ({
  useApiAuthBridge: () => ({ getToken: mockGetToken }),
}));

vi.mock('../../../api/profiling', () => ({
  analyzeProcessProfiling: (...a: unknown[]) => mockAnalyzeProcessProfiling(...a),
}));

vi.mock('../../../api/process', () => ({
  saveAnalysis: (...a: unknown[]) => mockSaveAnalysis(...a),
}));

vi.mock('../../../components/ui/toast', () => ({
  toast: { success: vi.fn(), danger: mockToastDanger },
}));

describe('StepAnalysis', () => {
  beforeEach(() => {
    mockAnalyzeProcessProfiling.mockReset();
    mockSaveAnalysis.mockReset();
    mockToastDanger.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue('test-token');
  });

  it('calls analyzeProcessProfiling and renders the result', async () => {
    mockAnalyzeProcessProfiling.mockResolvedValue(result);
    render(<StepAnalysis processId="p-1" onDone={vi.fn()} />);

    await waitFor(() => {
      expect(mockAnalyzeProcessProfiling).toHaveBeenCalledWith('p-1', { token: 'test-token' });
    });
    expect(await screen.findByText('Puntos críticos')).toBeInTheDocument();
  });

  it('shows a loading state while the analysis is pending', () => {
    mockAnalyzeProcessProfiling.mockReturnValue(new Promise(() => {}));
    render(<StepAnalysis processId="p-1" onDone={vi.fn()} />);
    expect(screen.getByText(/Generando análisis/i)).toBeInTheDocument();
  });

  it('Confirmar calls saveAnalysis then onDone', async () => {
    mockAnalyzeProcessProfiling.mockResolvedValue(result);
    mockSaveAnalysis.mockResolvedValue({ id: 'p-1' });
    const onDone = vi.fn();
    render(<StepAnalysis processId="p-1" onDone={onDone} />);

    await screen.findByText('Puntos críticos');
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    await waitFor(() => {
      expect(mockSaveAnalysis).toHaveBeenCalledWith('p-1', result, { token: 'test-token' });
      expect(onDone).toHaveBeenCalled();
    });
  });

  it('shows Reintentar on failure and retries', async () => {
    mockAnalyzeProcessProfiling
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce(result);
    render(<StepAnalysis processId="p-1" onDone={vi.fn()} />);

    const retry = await screen.findByRole('button', { name: /Reintentar/i });
    expect(mockToastDanger).toHaveBeenCalled();
    fireEvent.click(retry);

    await screen.findByText('Puntos críticos');
    expect(mockAnalyzeProcessProfiling).toHaveBeenCalledTimes(2);
  });
});
