import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickExpenseFAB from './QuickExpenseFAB';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'user1', email: 'test@test.com', role: 'admin', aiEnabled: true } })
}));

describe('QuickExpenseFAB', () => {
  const mockProps = {
    groupId: 'group1',
    token: 'token123',
    userId: 'user1',
    members: [],
    onExpenseAdded: vi.fn(),
    onOpenManual: vi.fn()
  };

  const mockPreferences = (quickExpense: unknown) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ quickExpense })
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferences(undefined);
  });

  it('ya no ofrece la IA: va en la barra de chat', () => {
    render(<QuickExpenseFAB {...mockProps} />);
    fireEvent.contextMenu(screen.getByTitle('Gasto rápido (Mantener para opciones)'));

    expect(screen.getByTitle('Cervezas')).toBeInTheDocument();
    expect(screen.queryByTitle('IA (Foto/Audio)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-file-input')).not.toBeInTheDocument();
  });

  it('si el último icono guardado era el de la IA, vuelve al de por defecto', async () => {
    mockPreferences({ lastIcon: '✨', prices: {} });
    render(<QuickExpenseFAB {...mockProps} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTitle('Gasto rápido (Mantener para opciones)')).toHaveTextContent('🍺');
  });

  it('se coloca encima de la barra de chat cuando la hay', () => {
    const { container } = render(<QuickExpenseFAB {...mockProps} aboveChatBar />);
    expect(container.firstChild).toHaveClass('quick-expense-fab', 'quick-expense-fab--above-chat-bar');
  });
});
