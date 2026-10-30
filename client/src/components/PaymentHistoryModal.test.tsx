import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import PaymentHistoryModal from './PaymentHistoryModal';

vi.mock('axios');

const members = [{ _id: 'u1', nombre: 'Ana' }, { _id: 'u2', nombre: 'Luis' }];
const payments = [
  { _id: 'p1', from: { _id: 'u1', nombre: 'Ana' }, to: { _id: 'u2', nombre: 'Luis' }, amount: 20, paid: true, createdAt: '2026-10-01T10:00:00Z' },
  { _id: 'p2', from: { _id: 'u2', nombre: 'Luis' }, to: { _id: 'u1', nombre: 'Ana' }, amount: 7.5, paid: true, createdAt: '2026-10-20T10:00:00Z' }
];

describe('PaymentHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({ data: { data: payments } });
  });

  it('lists payments newest first with amount and date', async () => {
    render(<PaymentHistoryModal groupId="g1" token="tok" members={members} onClose={vi.fn()} onHistoryUpdated={vi.fn()} />);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Luis pagó a Ana');
    expect(items[0]).toHaveTextContent(/7,50\s€/);
    expect(items[1]).toHaveTextContent('Ana pagó a Luis');
  });

  it('deletes a payment after confirming and refreshes the parent', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(axios.delete).mockResolvedValue({});
    const onHistoryUpdated = vi.fn();
    render(<PaymentHistoryModal groupId="g1" token="tok" members={members} onClose={vi.fn()} onHistoryUpdated={onHistoryUpdated} />);
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar pago: Ana pagó a Luis/ }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(expect.stringContaining('/debt-transactions/p1'), expect.anything()));
    expect(onHistoryUpdated).toHaveBeenCalled();
  });

  it('shows an empty state', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });
    render(<PaymentHistoryModal groupId="g1" token="tok" members={members} onClose={vi.fn()} onHistoryUpdated={vi.fn()} />);
    expect(await screen.findByText('No hay historial de pagos registrado.')).toBeInTheDocument();
  });
});
