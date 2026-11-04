import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import CategoryLimits from './CategoryLimits';
import { ILimiteCategoria } from '../types/budget';

const renderLimits = (limites: ILimiteCategoria[] = [], overrides: Partial<React.ComponentProps<typeof CategoryLimits>> = {}) => {
  const onSave = vi.fn().mockResolvedValue(true);
  const utils = render(<CategoryLimits limites={limites} categories={['Ocio', 'Restaurantes', 'Ropa']} isOwner onSave={onSave} {...overrides} />);
  return { ...utils, onSave };
};

const add = (categoria: string, importe: string) => {
  fireEvent.change(screen.getByLabelText('Categoría del nuevo límite'), { target: { value: categoria } });
  fireEvent.change(screen.getByLabelText('Importe del nuevo límite'), { target: { value: importe } });
  fireEvent.click(screen.getByRole('button', { name: 'Añadir límite' }));
};

describe('CategoryLimits', () => {
  it('adds limits and saves them, using the existing category name', async () => {
    const { onSave, rerender } = renderLimits();
    expect(screen.getByText('Aún no has puesto ningún límite.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar límites' })).toBeDisabled();

    add('ocio', '150,5');
    add('Gimnasio', '40');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar límites' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith([
      { categoria: 'Ocio', limite: 150.5 },
      { categoria: 'Gimnasio', limite: 40 }
    ]));
    // El padre recarga el grupo y pasa los límites guardados
    rerender(<CategoryLimits limites={onSave.mock.calls[0][0]} categories={['Ocio', 'Restaurantes', 'Ropa']} isOwner onSave={onSave} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Guardado');
    expect(screen.getByRole('button', { name: 'Guardar límites' })).toBeDisabled();
  });

  it('suggests only categories without a limit', () => {
    const { container } = renderLimits([{ categoria: 'Ocio', limite: 100 }]);
    const options = Array.from(container.querySelectorAll('datalist option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['Restaurantes', 'Ropa']);
  });

  it('edits and removes existing limits', async () => {
    const { onSave } = renderLimits([{ categoria: 'Ocio', limite: 100 }, { categoria: 'Ropa', limite: 50 }]);
    fireEvent.change(screen.getByLabelText('Límite de Ocio'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el límite de Ropa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar límites' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ categoria: 'Ocio', limite: 120 }]));
  });

  it('rejects duplicates, empty categories and bad amounts', () => {
    const { onSave } = renderLimits([{ categoria: 'Ocio', limite: 100 }]);
    add('OCIO', '20');
    expect(screen.getByRole('alert')).toHaveTextContent('OCIO ya tiene un límite.');
    add(' ', '20');
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe o elige una categoría.');
    add('Ropa', '0');
    expect(screen.getByRole('alert')).toHaveTextContent('mayor que 0');

    fireEvent.change(screen.getByLabelText('Límite de Ocio'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar límites' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El límite de Ocio tiene que ser mayor que 0.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds with Enter instead of submitting the form', () => {
    const { onSave } = renderLimits();
    fireEvent.change(screen.getByLabelText('Categoría del nuevo límite'), { target: { value: 'Ropa' } });
    fireEvent.change(screen.getByLabelText('Importe del nuevo límite'), { target: { value: '30' } });
    fireEvent.keyDown(screen.getByLabelText('Importe del nuevo límite'), { key: 'Enter' });
    expect(screen.getByLabelText('Límite de Ropa')).toHaveValue('30');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is read-only for non-owners and hidden when there is nothing to show', () => {
    const { unmount } = renderLimits([{ categoria: 'Ocio', limite: 100 }], { isOwner: false });
    expect(screen.getByLabelText('Límite de Ocio')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar límites' })).not.toBeInTheDocument();
    unmount();
    const { container } = renderLimits([], { isOwner: false });
    expect(container).toBeEmptyDOMElement();
  });
});
