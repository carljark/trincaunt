import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import UpdatePrompt, { watchForUpdates } from './UpdatePrompt';

const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
let needRefresh = false;
let registered: ((url: string, r?: ServiceWorkerRegistration) => void) | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: { onRegisteredSW?: typeof registered }) => {
    registered = options.onRegisteredSW;
    return { needRefresh: [needRefresh, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker };
  }
}));

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    needRefresh = false;
  });

  it('shows nothing while the app is up to date', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByText('Hay una versión nueva')).not.toBeInTheDocument();
  });

  it('updates and reloads when accepted', () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    expect(screen.getByText('Hay una versión nueva')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled();
  });

  it('can be left for later', () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(screen.queryByText('Hay una versión nueva')).not.toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });
});

describe('watchForUpdates', () => {
  let update: Mock;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    update = vi.fn().mockResolvedValue(undefined);
    stop = watchForUpdates({ update } as unknown as ServiceWorkerRegistration);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('checks for a new version when the app comes back and every hour', () => {
    setVisibility('hidden');
    expect(update).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('stops checking once cleaned up', () => {
    stop();
    setVisibility('visible');
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).not.toHaveBeenCalled();
  });

  it('is wired to the service worker registration', () => {
    render(<UpdatePrompt />);
    expect(registered).toBeTypeOf('function');
  });
});
