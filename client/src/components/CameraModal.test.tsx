import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import CameraModal from './CameraModal';

const stopTrack = vi.fn();
let getUserMedia: Mock;

describe('CameraModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMedia = vi.fn(async (): Promise<unknown> => ({ getTracks: () => [{ stop: stopTrack }] }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  });

  it('asks for the rear camera and turns it off when closed', async () => {
    const { unmount } = render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } }));
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDisabled();
    await new Promise(r => setTimeout(r, 0));
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('turns the camera off if closed before permission is granted', async () => {
    let grant: (s: unknown) => void = () => {};
    getUserMedia.mockImplementationOnce(() => new Promise(r => { grant = r; }));
    const { unmount } = render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} />);
    unmount();
    grant({ getTracks: () => [{ stop: stopTrack }] });
    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
  });

  it('explains when the camera is not available', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('denied'));
    render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo acceder a la cámara');
    expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument();
  });
});
