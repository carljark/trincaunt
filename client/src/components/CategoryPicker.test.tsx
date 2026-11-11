import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CategoryPicker from './CategoryPicker';

const Harness: React.FC<{ initial?: string[] }> = ({ initial = [] }) => {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <CategoryPicker token="tok" value={value} onChange={setValue} />
      <button type="button">fuera</button>
    </>
  );
};

describe('CategoryPicker', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ category: 'Hogar', count: 4 }, { category: 'Ocio', count: 2 }] })
    })) as unknown as typeof fetch;
  });

  it('lists existing categories and adds the one picked as a chip', async () => {
    render(<Harness />);
    fireEvent.focus(screen.getByLabelText('Categoría'));
    fireEvent.mouseDown(await screen.findByText('Hogar'));
    expect(screen.getByRole('button', { name: 'Quitar Hogar' })).toBeInTheDocument();
    // Ya elegida, deja de aparecer en la lista
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Ocio']);
  });

  it('adds a new category with Enter and removes it from its chip', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Categoría');
    fireEvent.change(input, { target: { value: 'Seguros' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Seguros' }));
    expect(screen.queryByText('Seguros')).not.toBeInTheDocument();
  });

  it('keeps what was typed when the field loses focus', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Categoría');
    fireEvent.change(input, { target: { value: 'Coche' } });
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'fuera' }) });
    expect(screen.getByRole('button', { name: 'Quitar Coche' })).toBeInTheDocument();
  });
});
