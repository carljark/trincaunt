import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import RecordPaymentModal from './RecordPaymentModal';

vi.mock('axios');

const members = [{ _id: 'u1', nombre: 'Ana' }, { _id: 'u2', nombre: 'Luis' }];

describe('RecordPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = () => {
    const props = { groupId: 'g1', token: 'tok', members, onClose: vi.fn(), onPaymentRecorded: vi.fn() };
    render(<RecordPaymentModal {...props} />);
    return props;
  };

  const fill = (from: string, to: string, amount: string) => {
    fireEvent.change(screen.getByRole('combobox', { name: 'Quién paga' }), { target: { value: from } });
    fireEvent.change(screen.getByRole('combobox', { name: 'A quién' }), { target: { value: to } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Importe' }), { target: { value: amount } });
  };

  it('previews the payment and records it, accepting a decimal comma', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    const props = renderModal();
    fill('u1', 'u2', '12,5');
    expect(screen.getByText(/Ana paga 12,50\s€ a Luis/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/debt-transactions'),
      { group: 'g1', from: 'u1', to: 'u2', amount: 12.5 },
      expect.anything()
    ));
    expect(props.onPaymentRecorded).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('does not let the payer be the receiver', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox', { name: 'Quién paga' }), { target: { value: 'u1' } });
    expect(screen.getAllByRole('option', { name: 'Ana' })[1]).toBeDisabled();
  });

  it('rejects an invalid amount without calling the API', async () => {
    renderModal();
    fill('u1', 'u2', 'abc');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('monto válido');
    expect(axios.post).not.toHaveBeenCalled();
  });
});
