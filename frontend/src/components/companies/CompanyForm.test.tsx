/**
 * Test: CompanyForm — two-phase (edit → review) company registration form
 *
 * Verifies:
 *  - All fields render (name, business_type, contact_name, contact_email,
 *    contact_email_confirm, contact_phone)
 *  - "otro" custom industry input appears only when business_type = 'otro'
 *  - Required-field validation on empty submit
 *  - Email format validation
 *  - Email confirmation mismatch validation
 *  - contact_name required
 *  - Duplicate-name soft warning + "create anyway" checkbox
 *  - Transitions to review step and back to edit
 *  - Calls onSuccess with the returned company on confirm
 *  - business_type_custom required when business_type = 'otro'
 *  - contact_phone is optional
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Company } from '../../api/company';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockMutateAsync = vi.fn();

vi.mock('../../hooks/useCompanies', () => ({
  useCreateCompany: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { CompanyForm } from './CompanyForm';

const VALID = {
  name: 'Acme Inc',
  business_type: 'manufactura',
  contact_name: 'Ana Pérez',
  contact_email: 'ana@acme.com',
  contact_email_confirm: 'ana@acme.com',
  contact_phone: '+34 600 111 222',
};

function fillValid(overrides: Partial<typeof VALID> = {}) {
  const v = { ...VALID, ...overrides };
  fireEvent.change(screen.getByPlaceholderText('Nombre de la empresa'), {
    target: { value: v.name },
  });
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: v.business_type },
  });
  fireEvent.change(screen.getByPlaceholderText('Nombre del responsable'), {
    target: { value: v.contact_name },
  });
  fireEvent.change(screen.getByPlaceholderText('correo@empresa.com'), {
    target: { value: v.contact_email },
  });
  fireEvent.change(screen.getByPlaceholderText('Confirme correo electrónico'), {
    target: { value: v.contact_email_confirm },
  });
  fireEvent.change(screen.getByPlaceholderText('+34 600 000 000'), {
    target: { value: v.contact_phone },
  });
}

describe('CompanyForm', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
  });

  it('renders all fields', () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    expect(screen.getByPlaceholderText('Nombre de la empresa')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nombre del responsable')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('correo@empresa.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirme correo electrónico')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+34 600 000 000')).toBeInTheDocument();
  });

  it('shows the "otro" custom industry input only when business_type = "otro"', () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    expect(screen.queryByPlaceholderText('Especifique el tipo')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'otro' } });
    expect(screen.getByPlaceholderText('Especifique el tipo')).toBeInTheDocument();
  });

  it('validates required fields on empty submit', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    expect(await screen.findByText(/El nombre debe tener al menos 2 caracteres/i)).toBeInTheDocument();
    expect(await screen.findByText(/Seleccione el tipo de industria/i)).toBeInTheDocument();
    expect(await screen.findByText(/El responsable es obligatorio/i)).toBeInTheDocument();
  });

  it('validates email format', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fillValid({ contact_email: 'notanemail', contact_email_confirm: 'notanemail' });
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    // Both email fields are invalid → two error messages appear
    const errors = await screen.findAllByText(/Correo electrónico inválido/i);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('validates email confirmation mismatch', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fillValid({ contact_email_confirm: 'other@acme.com' });
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    expect(await screen.findByText(/Los correos no coinciden/i)).toBeInTheDocument();
  });

  it('validates contact_name is required', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fillValid({ contact_name: '' });
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    expect(await screen.findByText(/El responsable es obligatorio/i)).toBeInTheDocument();
  });

  it('shows the duplicate-name warning and "create anyway" checkbox', () => {
    render(
      <CompanyForm
        variant="inline"
        onSuccess={vi.fn()}
        existingCompanyNames={['Acme Inc']}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Nombre de la empresa'), {
      target: { value: 'acme inc' },
    });
    expect(screen.getByText(/Ya tienes una empresa llamada/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sí, crear de todas formas/i)).toBeInTheDocument();
  });

  it('transitions to review and back to edit', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    // Review step shows the entered name as a read-only summary
    expect(await screen.findByText('Acme Inc')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Confirmar y registrar/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Volver a editar/i }));
    // Back to edit — the input is visible again
    expect(await screen.findByPlaceholderText('Nombre de la empresa')).toBeInTheDocument();
  });

  it('calls onSuccess with the returned company on confirm', async () => {
    const onSuccess = vi.fn();
    const company: Company = {
      company_id: 'c-1',
      user_id: 'u-1',
      name: 'Acme Inc',
      business_type: 'manufactura',
      is_active: true,
      contact_name: 'Ana Pérez',
      contact_email: 'ana@acme.com',
      contact_phone: '+34 600 111 222',
      active_process_count: 0,
    };
    mockMutateAsync.mockResolvedValue(company);

    render(<CompanyForm variant="inline" onSuccess={onSuccess} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    await screen.findByRole('button', { name: /Confirmar y registrar/i });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar y registrar/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Inc',
          business_type: 'manufactura',
          contact_name: 'Ana Pérez',
          contact_email: 'ana@acme.com',
        }),
      );
      expect(onSuccess).toHaveBeenCalledWith(company);
    });
  });

  it('validates business_type_custom is required when business_type = "otro"', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fillValid({ business_type: 'otro', business_type_custom: undefined as unknown as string });
    // clear any custom value just in case
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'otro' } });
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    expect(await screen.findByText(/Especifique el tipo de industria/i)).toBeInTheDocument();
  });

  it('treats contact_phone as optional (no error when empty)', async () => {
    render(<CompanyForm variant="inline" onSuccess={vi.fn()} />);
    fillValid({ contact_phone: '' });
    fireEvent.click(screen.getByRole('button', { name: /Revisar/i }));
    // Reaching the review step means validation passed
    expect(await screen.findByRole('button', { name: /Confirmar y registrar/i })).toBeInTheDocument();
  });
});