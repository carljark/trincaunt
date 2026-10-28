import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import BalancesTab from './BalancesTab';

const renderTab = (overrides: Partial<React.ComponentProps<typeof BalancesTab>> = {}) => {
  const props = {
    totalExpenses: 120,
    myShare: 40,
    myPayments: 60,
    mySettled: 0,
    myBalance: 20,
    balances: [
      { id: 'u1', nombre: 'Ana', email: 'a@t.com', balance: 20 },
      { id: 'u2', nombre: 'Luis', email: 'l@t.com', balance: -20 }
    ],
    settlements: [{ from: { id: 'u2', nombre: 'Luis' }, to: { id: 'u1', nombre: 'Ana' }, amount: 20 }],
    onRecordPayment: vi.fn(),
    onShowPaymentHistory: vi.fn(),
    ...overrides
  };
  render(<BalancesTab {...props} />);
  return props;
};

// toLocaleString usa espacio duro antes de €; se normaliza para comparar
const textOf = (el: HTMLElement) => el.textContent?.replace(/\s/g, ' ');

describe('BalancesTab', () => {
  it('says the group owes you when your balance is positive', () => {
    renderTab();
    const label = screen.getByText('Te deben');
    expect(textOf(label.nextElementSibling as HTMLElement)).toBe('20,00 €');
  });

  it('says you owe when your balance is negative, without the minus sign', () => {
    renderTab({ myBalance: -15.5 });
    const label = screen.getByText('Debes');
    expect(textOf(label.nextElementSibling as HTMLElement)).toBe('15,50 €');
  });

  it('colours member balances by sign', () => {
    renderTab();
    const ana = screen.getAllByText('Ana')[0].closest('li') as HTMLElement;
    const luis = screen.getAllByText('Luis')[0].closest('li') as HTMLElement;
    expect(ana.querySelector('.balances__amount--positive')).not.toBeNull();
    expect(luis.querySelector('.balances__amount--negative')).not.toBeNull();
  });

  it('shows an empty state when there is nothing to settle', () => {
    renderTab({ settlements: [] });
    expect(screen.getByText(/No hay deudas pendientes/)).toBeInTheDocument();
  });

  it('wires the payment buttons', () => {
    const props = renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    fireEvent.click(screen.getByRole('button', { name: 'Historial de pagos' }));
    expect(props.onRecordPayment).toHaveBeenCalled();
    expect(props.onShowPaymentHistory).toHaveBeenCalled();
  });
});
