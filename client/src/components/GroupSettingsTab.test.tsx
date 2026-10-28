import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import GroupSettingsTab from './GroupSettingsTab';
import { IUser } from '../types/user';

const members = [
  { _id: 'u1', nombre: 'Ana', email: 'ana@test.com' },
  { _id: 'u2', nombre: 'Luis', email: 'luis@test.com' }
] as IUser[];

const renderTab = (overrides: Partial<React.ComponentProps<typeof GroupSettingsTab>> = {}) => {
  const props = {
    groupName: 'Viaje',
    members,
    isOwner: true,
    onRename: vi.fn().mockResolvedValue(true),
    onAddMember: vi.fn().mockResolvedValue(true),
    onLeave: vi.fn(),
    ...overrides
  };
  render(<GroupSettingsTab {...props} />);
  return props;
};

describe('GroupSettingsTab', () => {
  it('shows the group name, member count and members', () => {
    renderTab();
    expect(screen.getByText('Viaje')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Luis')).toBeInTheDocument();
  });

  it('only lets the owner edit the name', () => {
    renderTab({ isOwner: false });
    expect(screen.queryByRole('button', { name: 'Editar nombre del grupo' })).not.toBeInTheDocument();
  });

  it('renames the group from the pencil icon', async () => {
    const props = renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Editar nombre del grupo' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del grupo' }), { target: { value: 'Viaje a Roma ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(props.onRename).toHaveBeenCalledWith('Viaje a Roma'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument());
  });

  it('adds a member from the user-plus icon and keeps the form open on failure', async () => {
    const props = renderTab({ onAddMember: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir miembro' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email del nuevo miembro' }), { target: { value: 'eva@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

    await waitFor(() => expect(props.onAddMember).toHaveBeenCalledWith('eva@test.com'));
    expect(screen.getByRole('textbox', { name: 'Email del nuevo miembro' })).toHaveValue('eva@test.com');
  });

  it('calls onLeave', () => {
    const props = renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Salir del grupo' }));
    expect(props.onLeave).toHaveBeenCalled();
  });
});
