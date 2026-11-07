import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useAudioRecorder, formatRecordingTime } from './useAudioRecorder';

const stopTrack = vi.fn();

class FakeRecorder {
  static instance: FakeRecorder;
  static nextMimeType = 'audio/webm;codecs=opus';
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    this.mimeType = FakeRecorder.nextMimeType;
    FakeRecorder.instance = this;
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc']) });
    this.onstop?.();
  }
}

describe('useAudioRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeRecorder.nextMimeType = 'audio/webm;codecs=opus';
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) }
    });
    vi.stubGlobal('MediaRecorder', FakeRecorder);
  });

  it('devuelve el audio con el formato del grabador (mp4 en iPhone)', async () => {
    FakeRecorder.nextMimeType = 'audio/mp4';
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    expect(result.current.isRecording).toBe(true);

    let file: File | null = null;
    await act(async () => { file = await result.current.stop(); });

    expect(file!.type).toBe('audio/mp4');
    expect(file!.name).toMatch(/\.m4a$/);
    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it('quita los codecs del tipo', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    let file: File | null = null;
    await act(async () => { file = await result.current.stop(); });
    expect(file!.type).toBe('audio/webm');
  });

  it('cancelar apaga el micrófono', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    act(() => result.current.cancel());
    expect(FakeRecorder.instance.state).toBe('inactive');
    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it('apaga el micrófono al desmontar aunque se esté grabando', async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    unmount();
    expect(FakeRecorder.instance.state).toBe('inactive');
    expect(stopTrack).toHaveBeenCalled();
  });

  it('cuenta los segundos', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(65000); });
    expect(formatRecordingTime(result.current.seconds)).toBe('1:05');
    vi.useRealTimers();
  });

  it('avisa si no hay micrófono', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));
    const { result } = renderHook(() => useAudioRecorder());
    await act(() => result.current.start());
    expect(result.current.error).toContain('No se pudo acceder al micrófono');
    expect(result.current.isRecording).toBe(false);
  });
});
