/**
 * Test: ObjectiveChips — multi-select chips for strategic objectives
 *
 * Verifies:
 * - Renders one chip per option from the `options` prop
 * - Clicking an unselected chip adds it (onChange called with joined string)
 * - Clicking a selected chip removes it (onChange called without it)
 * - Selected chips receive bg-app-primary text-white styling
 * - Unselected chips receive the default bg-app-bg styling
 * - Custom objective input + add button appends a new value to the selection
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObjectiveChips } from './ObjectiveChips';

const OPTIONS = [
  'Reducir no conformidades',
  'Mejorar satisfacción del cliente',
  'Optimizar procesos internos',
];

describe('ObjectiveChips', () => {
  it('renders one chip button per option', () => {
    render(<ObjectiveChips options={OPTIONS} value="" onChange={vi.fn()} />);
    OPTIONS.forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('adds a chip when clicking an unselected option', () => {
    const onChange = vi.fn();
    render(<ObjectiveChips options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Optimizar procesos internos' }));
    expect(onChange).toHaveBeenCalledWith('Optimizar procesos internos');
  });

  it('appends to existing selection preserving order', () => {
    const onChange = vi.fn();
    render(
      <ObjectiveChips
        options={OPTIONS}
        value="Reducir no conformidades"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mejorar satisfacción del cliente' }));
    expect(onChange).toHaveBeenCalledWith(
      'Reducir no conformidades,Mejorar satisfacción del cliente',
    );
  });

  it('removes a chip when clicking a selected option', () => {
    const onChange = vi.fn();
    render(
      <ObjectiveChips
        options={OPTIONS}
        value="Reducir no conformidades,Mejorar satisfacción del cliente"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reducir no conformidades' }));
    expect(onChange).toHaveBeenCalledWith('Mejorar satisfacción del cliente');
  });

  it('applies selected styling (bg-app-primary) to selected chips', () => {
    const { container } = render(
      <ObjectiveChips
        options={OPTIONS}
        value="Reducir no conformidades"
        onChange={vi.fn()}
      />,
    );
    const selected = container.querySelectorAll('.bg-app-primary.text-white');
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain('Reducir no conformidades');
  });

  it('applies default styling (bg-app-bg) to unselected chips', () => {
    const { container } = render(
      <ObjectiveChips
        options={OPTIONS}
        value="Reducir no conformidades"
        onChange={vi.fn()}
      />,
    );
    const unselected = container.querySelectorAll('.bg-app-bg.text-app-text');
    // Two unselected chips
    expect(unselected.length).toBe(2);
  });

  it('allows adding a custom objective via the input and add button', () => {
    const onChange = vi.fn();
    render(<ObjectiveChips options={OPTIONS} value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/otro objetivo/i);
    fireEvent.change(input, { target: { value: 'Capturar nuevo mercado' } });
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(onChange).toHaveBeenCalledWith('Capturar nuevo mercado');
  });

  it('does not add an empty custom objective', () => {
    const onChange = vi.fn();
    render(<ObjectiveChips options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('appends a custom objective to an existing selection', () => {
    const onChange = vi.fn();
    render(
      <ObjectiveChips
        options={OPTIONS}
        value="Reducir no conformidades"
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText(/otro objetivo/i);
    fireEvent.change(input, { target: { value: 'Innovar procesos' } });
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(onChange).toHaveBeenCalledWith('Reducir no conformidades,Innovar procesos');
  });
});