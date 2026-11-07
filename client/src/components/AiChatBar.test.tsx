import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AiChatBar from './AiChatBar';

vi.mock('../utils/location', () => ({
  getCurrentLocationName: vi.fn().mockResolvedValue('Calle Mayor, Madrid')
}));

const members = [{ _id: 'u1', nombre: 'Carlos' }, { _id: 'u2', nombre: 'Ana' }];

const draftsResponse = (data: unknown[]) => ({ ok: true, json: async () => ({ status: 'success', data }) });

const cena = { descripcion: 'Cena', monto: 45, fecha: '2026-11-06', categoria: ['Restaurante'], localization: '', pagado_por: 'u2' };

describe('AiChatBar', () => {
  const onExpensesAdded = vi.fn();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const renderBar = () => render(<AiChatBar groupId="g1" token="tok" members={members} onExpensesAdded={onExpensesAdded} />);

  const sendText = async (text: string) => {
    fireEvent.change(screen.getByLabelText('Describe un gasto para la IA'), { target: { value: text } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
  };

  it('muestra el micrófono con el campo vacío y el botón de enviar al escribir', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Describe un gasto para la IA'), { target: { value: 'Cena' } });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grabar nota de voz' })).not.toBeInTheDocument();
  });

  it('manda el texto a la IA y propone los gastos sin guardarlos', async () => {
    fetchMock.mockResolvedValueOnce(draftsResponse([cena]));
    renderBar();
    await sendText('Cena 45 euros, pagó Ana');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/expenses/ai-draft');
    expect((options.body as FormData).get('texto')).toBe('Cena 45 euros, pagó Ana');
    expect((options.body as FormData).get('grupo_id')).toBe('g1');

    expect(screen.getByText('Cena 45 euros, pagó Ana')).toBeInTheDocument();
    expect(await screen.findByText('Cena')).toBeInTheDocument();
    expect(screen.getByText(/pagó Ana/, { selector: '.ai-chat-bar__draft-meta' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpensesAdded).not.toHaveBeenCalled();
  });

  it('guarda los gastos confirmados en un solo envío', async () => {
    fetchMock
      .mockResolvedValueOnce(draftsResponse([cena]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    renderBar();
    await sendText('Cena 45 euros, pagó Ana');

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Guardar/ }));
    });

    await waitFor(() => expect(onExpensesAdded).toHaveBeenCalled());
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toContain('/expenses/batch');
    expect(JSON.parse(options.body)).toEqual({
      grupo_id: 'g1',
      gastos: [{ ...cena, localization: 'Calle Mayor, Madrid' }]
    });
    expect(screen.queryByText('Cena')).not.toBeInTheDocument();
  });

  it('permite corregir el importe y quitar gastos antes de guardar', async () => {
    fetchMock
      .mockResolvedValueOnce(draftsResponse([cena, { ...cena, descripcion: 'Taxi', monto: 12 }]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    renderBar();
    await sendText('Cena y taxi');

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Importe del gasto 1'), { target: { value: '40,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Taxi' }));
    expect(screen.getByRole('button', { name: /Guardar 40,50 €/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.gastos).toHaveLength(1);
    expect(body.gastos[0].monto).toBe(40.5);
    expect(body.gastos[0].descripcion).toBe('Cena');
  });

  it('no guarda si un importe no es válido', async () => {
    fetchMock.mockResolvedValueOnce(draftsResponse([cena]));
    renderBar();
    await sendText('Cena');

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Importe del gasto 1'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('importe mayor que 0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('avisa si la IA no encuentra gastos', async () => {
    fetchMock.mockResolvedValueOnce(draftsResponse([]));
    renderBar();
    await sendText('Hola');
    expect(await screen.findByText(/No he encontrado ningún gasto/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it('muestra el error del servidor', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'FALLO IA: sin cuota' }) });
    renderBar();
    await sendText('Cena 20');
    expect(await screen.findByRole('alert')).toHaveTextContent('FALLO IA: sin cuota');
  });

  it('manda un archivo adjunto', async () => {
    fetchMock.mockResolvedValueOnce(draftsResponse([cena]));
    renderBar();
    const file = new File(['img'], 'ticket.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('ai-file-input'), { target: { files: [file] } });
    });

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('media')).toBeInstanceOf(File);
    expect(body.get('texto')).toBeNull();
    expect(screen.getByText('📎 ticket.jpg')).toBeInTheDocument();
  });

  it('graba una nota de voz al pulsar el micrófono y la manda al pulsar enviar', async () => {
    const stopTrack = vi.fn();
    class FakeRecorder {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['abc']) });
        this.onstop?.();
      }
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) }
    });
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    fetchMock.mockResolvedValueOnce(draftsResponse([cena]));

    renderBar();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    });
    expect(screen.getByRole('timer')).toHaveTextContent('Grabando');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar nota de voz' }));
    });

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect((body.get('media') as File).type).toBe('audio/webm');
    expect(stopTrack).toHaveBeenCalled();
    expect(screen.getByText(/Nota de voz/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
