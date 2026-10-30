import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import UserMenu from './UserMenu';

const logout = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', nombre: 'Carlos', email: 'carlos@example.com' }, token: 'tok', logout })
}));

const renderMenu = (props = {}) => render(<MemoryRouter><UserMenu {...props} /></MemoryRouter>);

describe('UserMenu', () => {
  it('opens and closes the menu from the trigger and with Escape', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Menú de usuario' });
    expect(screen.queryByRole('link', { name: 'Preferencias' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Preferencias' })).toHaveAttribute('href', '/preferences');
    expect(screen.getByText('Carlos')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('link', { name: 'Preferencias' })).not.toBeInTheDocument();
  });

  it('only offers the Excel export when the page provides it', () => {
    const onExportXLSX = vi.fn();
    renderMenu({ onExportXLSX });
    fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    expect(onExportXLSX).toHaveBeenCalled();
  });

  it('logs out and hides the admin database options from other users', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    expect(screen.queryByRole('button', { name: /BD/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });
});
