import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PushToggle from './PushToggle';
import * as push from '../utils/push';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'tok' })
}));

vi.mock('../utils/push', () => ({
  getPushSupport: vi.fn(),
  getCurrentSubscription: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn()
}));

describe('PushToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(push.getPushSupport).mockReturnValue('supported');
    vi.mocked(push.getCurrentSubscription).mockResolvedValue(null);
  });

  it('subscribes this device when switched on', async () => {
    vi.mocked(push.subscribeToPush).mockResolvedValue();
    render(<PushToggle />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(push.subscribeToPush).toHaveBeenCalledWith('tok');
  });

  it('unsubscribes when switched off', async () => {
    vi.mocked(push.getCurrentSubscription).mockResolvedValue({} as PushSubscription);
    render(<PushToggle />);
    const toggle = screen.getByRole('switch');
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(push.unsubscribeFromPush).toHaveBeenCalledWith('tok');
  });

  it('shows the error and stays off when permission is denied', async () => {
    vi.mocked(push.subscribeToPush).mockRejectedValue(new Error('Has bloqueado las notificaciones.'));
    render(<PushToggle />);

    fireEvent.click(screen.getByRole('switch'));

    expect(await screen.findByText('Has bloqueado las notificaciones.')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('asks iPhone users to install the app first', () => {
    vi.mocked(push.getPushSupport).mockReturnValue('needs-install');
    render(<PushToggle />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument();
  });
});
