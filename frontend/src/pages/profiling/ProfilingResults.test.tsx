/**
 * Test: ProfilingResults — displays profiling analysis output
 *
 * Verifies:
 * - Renders all four section headings (Puntos críticos, Estimación de costos,
 *   Estimación de tiempo, Plan de acción)
 * - Renders the markdown heading from pain points via MarkdownRenderer
 * - Renders the cost range and the confidence badge for cost (high → Alta confianza)
 * - Renders the time estimate and the confidence badge for time (medium → Confianza media)
 * - Renders action plan phases (name, duration weeks, activities) and milestones
 * - Renders "Por definir" and "Baja confianza" when months === 0
 * - The "Volver" button calls onBack
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilingResults } from './ProfilingResults';
import type { ProfilingResult } from '../../api/profiling';

const result: ProfilingResult = {
  pain_points_analysis: '## Falta de medición\n\nNo hay indicadores formales.',
  cost_estimation: { range_cop: '30 a 80 millones COP', breakdown: ['Consultoría', 'Auditoría'], confidence: 'high' },
  time_estimation: { months: 6, phases: ['Fase inicial', 'Fase de cierre'], confidence: 'medium' },
  action_plan: {
    phases: [{ name: 'Diagnóstico', duration_weeks: 4, activities: ['Levantar procesos'] }],
    milestones: ['Hito de lanzamiento'],
  },
};

describe('ProfilingResults', () => {
  it('renders all four section headings', () => {
    render(<ProfilingResults result={result} onBack={vi.fn()} />);

    expect(screen.getByText('Puntos críticos')).toBeInTheDocument();
    expect(screen.getByText('Estimación de costos')).toBeInTheDocument();
    expect(screen.getByText('Estimación de tiempo')).toBeInTheDocument();
    expect(screen.getByText('Plan de acción')).toBeInTheDocument();
  });

  it('renders the markdown heading from pain points', () => {
    render(<ProfilingResults result={result} onBack={vi.fn()} />);

    expect(screen.getByText('Falta de medición')).toBeInTheDocument();
  });

  it('renders the cost range and confidence badge for high confidence', () => {
    render(<ProfilingResults result={result} onBack={vi.fn()} />);

    expect(screen.getByText('30 a 80 millones COP')).toBeInTheDocument();
    expect(screen.getByText('Alta confianza')).toBeInTheDocument();
  });

  it('renders the time estimate and confidence badge for medium confidence', () => {
    render(<ProfilingResults result={result} onBack={vi.fn()} />);

    expect(screen.getByText('≈ 6 meses')).toBeInTheDocument();
    expect(screen.getByText('Confianza media')).toBeInTheDocument();
  });

  it('renders action plan phase and milestone', () => {
    render(<ProfilingResults result={result} onBack={vi.fn()} />);

    expect(screen.getByText('Diagnóstico')).toBeInTheDocument();
    expect(screen.getByText('4 semanas')).toBeInTheDocument();
    expect(screen.getByText('Levantar procesos')).toBeInTheDocument();
    expect(screen.getByText('Hito de lanzamiento')).toBeInTheDocument();
  });

  it('renders "Por definir" and "Baja confianza" when months is 0', () => {
    const zeroMonthsResult: ProfilingResult = {
      ...result,
      time_estimation: { months: 0, phases: [], confidence: 'low' },
    };
    render(<ProfilingResults result={zeroMonthsResult} onBack={vi.fn()} />);

    expect(screen.getByText('Por definir')).toBeInTheDocument();
    expect(screen.getByText('Baja confianza')).toBeInTheDocument();
  });

  it('calls onBack when the Volver button is clicked', () => {
    const onBack = vi.fn();
    render(<ProfilingResults result={result} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /Volver/i }));

    expect(onBack).toHaveBeenCalled();
  });
});
