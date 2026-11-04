import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import BudgetSettings from './BudgetSettings';

const renderSettings = (overrides: Partial<React.ComponentProps<typeof BudgetSettings>> = {}) => {
  const props = {
    tipo: 'compartido' as const,
    memberCount: 1,
    isOwner: true,
    onSave: vi.fn().mockResolvedValue(true),
    ...overrides
  };
  render(<BudgetSettings {...props} />);
  return props;
};

describe('BudgetSettings', () => {
  it('turns a single-member group into a personal budget', () => {
    const { onSave } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Convertir en presupuesto personal' }));
    expect(onSave).toHaveBeenCalledWith({ tipo: 'personal' });
  });

  it('explains that groups with several members cannot be personal', () => {
    renderSettings({ memberCount: 3 });
    expect(screen.queryByRole('button', { name: 'Convertir en presupuesto personal' })).not.toBeInTheDocument();
    expect(screen.getByText(/único miembro/)).toBeInTheDocument();
  });

  it('shows nothing to non-owners of a shared group', () => {
    const { container } = render(<BudgetSettings tipo="compartido" memberCount={1} isOwner={false} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('saves payday, savings, the other-groups option (off by default) and the alerts (on by default)', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const initial = { diaInicioCiclo: 1, ahorroObjetivo: 0, incluirOtrosGrupos: false };
    const { rerender } = render(<BudgetSettings tipo="personal" presupuesto={initial} memberCount={1} isOwner onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Contar mi parte/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Avisarme/ })).toBeChecked();

    fireEvent.change(screen.getByRole('combobox', { name: 'Día de cobro' }), { target: { value: '28' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ahorro por ciclo' }), { target: { value: '150,5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Contar mi parte/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Avisarme/ }));
    fireEvent.click(save);

    const saved = { diaInicioCiclo: 28, ahorroObjetivo: 150.5, incluirOtrosGrupos: true, avisos: false };
    expect(onSave).toHaveBeenCalledWith({ presupuesto: saved });
    // La página recarga el grupo y pasa la configuración guardada
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    rerender(<BudgetSettings tipo="personal" presupuesto={saved} memberCount={1} isOwner onSave={onSave} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Guardado');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('rejects negative savings', () => {
    const { onSave } = renderSettings({ tipo: 'personal' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ahorro por ciclo' }), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('negativo');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('can go back to a shared group', async () => {
    const { onSave } = renderSettings({ tipo: 'personal' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a grupo compartido' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ tipo: 'compartido' }));
  });
});
