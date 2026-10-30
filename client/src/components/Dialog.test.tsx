import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import Dialog from './Dialog';

describe('Dialog', () => {
  it('is an accessible modal named by its title', () => {
    render(<Dialog title="Registrar pago" onClose={vi.fn()}>contenido</Dialog>);
    expect(screen.getByRole('dialog', { name: 'Registrar pago' })).toHaveAttribute('aria-modal', 'true');
  });

  it('closes from the X, with Escape and by tapping the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<Dialog title="T" onClose={onClose}>contenido</Dialog>);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(container.querySelector('.dialog')!);
    fireEvent.mouseDown(screen.getByText('contenido'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close while busy', () => {
    const onClose = vi.fn();
    render(<Dialog title="T" onClose={onClose} busy>contenido</Dialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('submits from a footer button when given onSubmit', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<Dialog title="T" onClose={vi.fn()} onSubmit={onSubmit} footer={<button type="submit">Guardar</button>}>x</Dialog>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('locks the page scroll while open', () => {
    const { unmount } = render(<Dialog title="T" onClose={vi.fn()}>x</Dialog>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
