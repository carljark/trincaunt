import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import ConfirmationModal from './ConfirmationModal';

describe('ConfirmationModal', () => {
  it('shows the message and confirms or cancels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmationModal title="Editar gastos" message="Se cambiarán 3 gastos." confirmLabel="Aplicar cambios" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: 'Editar gastos' })).toHaveTextContent('Se cambiarán 3 gastos.');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape', () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal message="¿Seguro?" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
