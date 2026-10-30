import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AudioRecorderModal from './AudioRecorderModal';

const stopTrack = vi.fn();

class FakeRecorder {
  static instance: FakeRecorder;
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    this.mimeType = FakeRecorder.nextMimeType;
    FakeRecorder.instance = this;
  }
  static nextMimeType = 'audio/webm;codecs=opus';
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc']) });
    this.onstop?.();
  }
}

describe('AudioRecorderModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeRecorder.nextMimeType = 'audio/webm;codecs=opus';
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) }
    });
    vi.stubGlobal('MediaRecorder', FakeRecorder);
  });

  const start = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Empezar a grabar' }));
    });
  };

  it('sends the recording with the recorder format (mp4 on iPhone)', async () => {
    FakeRecorder.nextMimeType = 'audio/mp4';
    const onCapture = vi.fn();
    render(<AudioRecorderModal onClose={vi.fn()} onCapture={onCapture} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Detener y enviar' }));

    const file: File = onCapture.mock.calls[0][0];
    expect(file.type).toBe('audio/mp4');
    expect(file.name).toMatch(/\.m4a$/);
    expect(stopTrack).toHaveBeenCalled();
  });

  it('strips the codecs from the type', async () => {
    const onCapture = vi.fn();
    render(<AudioRecorderModal onClose={vi.fn()} onCapture={onCapture} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'Detener y enviar' }));
    expect(onCapture.mock.calls[0][0].type).toBe('audio/webm');
  });

  it('turns the microphone off without sending when closed mid-recording', async () => {
    const onCapture = vi.fn();
    const { unmount } = render(<AudioRecorderModal onClose={vi.fn()} onCapture={onCapture} />);
    await start();
    expect(FakeRecorder.instance.state).toBe('recording');
    unmount();
    expect(FakeRecorder.instance.state).toBe('inactive');
    expect(stopTrack).toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('shows the elapsed time as m:ss', async () => {
    vi.useFakeTimers();
    render(<AudioRecorderModal onClose={vi.fn()} onCapture={vi.fn()} />);
    await start();
    act(() => { vi.advanceTimersByTime(65000); });
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    vi.useRealTimers();
  });

  it('explains when the microphone is not available', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));
    render(<AudioRecorderModal onClose={vi.fn()} onCapture={vi.fn()} />);
    await start();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo acceder al micrófono');
  });
});
