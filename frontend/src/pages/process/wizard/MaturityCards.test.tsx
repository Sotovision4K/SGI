/**
 * Test: MaturityCards — card-based maturity level selector
 *
 * Verifies:
 * - Renders one card per option from the `options` prop
 * - Clicking a card calls onChange with that option value
 * - The selected card (matching `value`) receives the selected styling (border-app-primary)
 * - Unselected cards get the default border (border-app-border)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaturityCards } from './MaturityCards';

const OPTIONS = ['Básico', 'Intermedio', 'Avanzado'];

describe('MaturityCards', () => {
  it('renders one card per option', () => {
    render(<MaturityCards options={OPTIONS} value="" onChange={vi.fn()} />);
    OPTIONS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('calls onChange with the clicked option value', () => {
    const onChange = vi.fn();
    render(<MaturityCards options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Avanzado'));
    expect(onChange).toHaveBeenCalledWith('Avanzado');
  });

  it('applies selected styling to the card matching value', () => {
    const { container } = render(
      <MaturityCards options={OPTIONS} value="Intermedio" onChange={vi.fn()} />,
    );
    const selectedCards = container.querySelectorAll('.border-app-primary');
    expect(selectedCards.length).toBe(1);
    // The selected card contains the matching label text
    expect(selectedCards[0].textContent).toContain('Intermedio');
  });

  it('applies default border styling to unselected cards', () => {
    const { container } = render(
      <MaturityCards options={OPTIONS} value="Básico" onChange={vi.fn()} />,
    );
    const unselectedCards = container.querySelectorAll('.border-app-border');
    // Two unselected cards: Intermedio and Avanzado
    expect(unselectedCards.length).toBe(2);
  });

  it('renders a description for each card', () => {
    render(<MaturityCards options={OPTIONS} value="" onChange={vi.fn()} />);
    // Card descriptions are present (non-empty)
    expect(screen.getByText(/Básico/i)).toBeInTheDocument();
    // There should be descriptive text beyond just the labels — check for
    // elements with the description class.
    const descriptions = document.querySelectorAll('[data-testid="maturity-desc"]');
    expect(descriptions.length).toBe(3);
    descriptions.forEach((d) => {
      expect(d.textContent).not.toBe('');
    });
  });
});