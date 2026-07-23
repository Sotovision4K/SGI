/**
 * Test: WizardStepper progress indicator
 *
 * Pure presentational component that renders a 4-step progress bar.
 * Each step circle should reflect its state: completed, active, or pending.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardStepper } from './WizardStepper';

const STEPS = ['Configuración', 'Pre-diagnóstico', 'Diagnóstico ISO', 'Plan'];

describe('WizardStepper', () => {
  it('renders all step labels', () => {
    render(<WizardStepper current={0} steps={STEPS} />);
    // The first step is always visible via the circle number (i + 1).
    expect(screen.getByText('1')).toBeInTheDocument();
    // Labels are hidden below sm, but jsdom doesn't apply `hidden` text display.
    STEPS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('marks no step as completed when current === 0', () => {
    const { container } = render(<WizardStepper current={0} steps={STEPS} />);
    // No completed (bg-success) step badges should be present
    expect(container.querySelectorAll('.rounded-full.bg-success').length).toBe(0);
    // Only the active step (step 0) uses the accent badge
    expect(container.querySelectorAll( '.rounded-full.bg-app-primary').length).toBe(1);
  });

  it('marks steps before current as completed (bg-success badge)', () => {
    const { container } = render(<WizardStepper current={1} steps={STEPS} />);
    // Current === 1 -> exactly one completed step badge (step 0)
    expect(container.querySelectorAll('.rounded-full.bg-success').length).toBe(1);
    expect(container.querySelectorAll( '.rounded-full.bg-app-primary').length).toBe(1);
  });

  it('marks the active step with the accent badge', () => {
    const { container } = render(<WizardStepper current={2} steps={STEPS} />);
    expect(container.querySelectorAll( '.rounded-full.bg-app-primary').length).toBe(1);
    expect(container.querySelectorAll('.rounded-full.bg-success').length).toBe(2);
  });

  it('renders with a nav element for accessibility', () => {
    render(<WizardStepper current={2} steps={STEPS} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Progreso del asistente');
  });
});