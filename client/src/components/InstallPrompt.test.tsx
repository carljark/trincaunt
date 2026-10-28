import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import InstallPrompt from './InstallPrompt';

const setUserAgent = (ua: string) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
};

const setStandalone = (standalone: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

const fireBeforeInstallPrompt = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
  const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    setStandalone(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing on Android until the browser offers installation', () => {
    setUserAgent(ANDROID_UA);
    render(<InstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireBeforeInstallPrompt();
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument();
  });

  it('launches the native install dialog and hides once accepted', async () => {
    setUserAgent(ANDROID_UA);
    render(<InstallPrompt />);
    const event = fireBeforeInstallPrompt('accepted');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    });
    expect(event.prompt).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Add to Home Screen instructions on iOS', () => {
    setUserAgent(IPHONE_UA);
    render(<InstallPrompt />);
    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument();
  });

  it('stays hidden when already running as an installed app', () => {
    setUserAgent(IPHONE_UA);
    setStandalone(true);
    render(<InstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('remembers the dismissal', () => {
    setUserAgent(IPHONE_UA);
    const { unmount } = render(<InstallPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<InstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
