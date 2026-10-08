import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickExpenseFAB from './QuickExpenseFAB';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user1', email: 'test@test.com' } })
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    addJob: vi.fn().mockReturnValue('job123'),
    updateJob: vi.fn()
  })
}));

describe('QuickExpenseFAB - Funcionalidad IA (TDD)', () => {
  const mockProps = {
    groupId: 'group1',
    token: 'token123',
    userId: 'user1',
    members: [],
    onExpenseAdded: vi.fn(),
    onOpenManual: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ descripcion: 'Pizza', monto: 12.5 })
    });
  });

  it('debería mostrar el input oculto de IA', () => {
    render(<QuickExpenseFAB {...mockProps} />);
    const fileInput = screen.getByTestId('ai-file-input');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
  });

  it('debería enviar el archivo al endpoint /api/expenses/ai-parse al seleccionar un medio', async () => {
    render(<QuickExpenseFAB {...mockProps} />);
    
    const fileInput = screen.getByTestId('ai-file-input') as HTMLInputElement;
    const file = new File(['dummy content'], 'ticket.jpg', { type: 'image/jpeg' });
    
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/expenses/ai-parse'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer token123'
          })
        })
      );
    });
  });
});

