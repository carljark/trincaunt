import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import MemberToggleGroup from './MemberToggleGroup';

const options = [
  { value: 'u1', label: 'Ana' },
  { value: 'u2', label: 'Luis' },
  { value: 'u3', label: 'Marta' },
  { value: 'u4', label: 'Pablo' },
];

describe('MemberToggleGroup', () => {
  it('renders every member as a button with its pressed state', () => {
    render(<MemberToggleGroup options={options} selected={['u1']} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Ana/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Pablo/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds an unselected member on click', () => {
    const onChange = vi.fn();
    render(<MemberToggleGroup options={options} selected={['u1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Pablo/ }));
    expect(onChange).toHaveBeenCalledWith(['u1', 'u4']);
  });

  it('removes a selected member on click', () => {
    const onChange = vi.fn();
    render(<MemberToggleGroup options={options} selected={['u1', 'u2']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    expect(onChange).toHaveBeenCalledWith(['u2']);
  });

  it('selects all, or clears when everyone is already selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MemberToggleGroup options={options} selected={['u1']} onChange={onChange} showBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u2', 'u3', 'u4']);

    rerender(<MemberToggleGroup options={options} selected={['u1', 'u2', 'u3', 'u4']} onChange={onChange} showBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Ninguno' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('ignores clicks when disabled', () => {
    const onChange = vi.fn();
    render(<MemberToggleGroup options={options} selected={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
