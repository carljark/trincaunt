import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AiChatBar from './AiChatBar';

vi.mock('../utils/location', () => ({
  getCurrentLocationName: vi.fn().mockResolvedValue('Calle Mayor, Madrid')
}));

const reply = (acciones: unknown[], respuesta = '') => ({ ok: true, json: async () => ({ status: 'success', data: { respuesta, acciones } }) });
const draftsResponse = (gastos: unknown[]) => reply(gastos);
const applied = (resultados: unknown[]) => ({ ok: true, json: async () => ({ status: 'success', data: { resultados } }) });

const cenaDatos = { descripcion: 'Cena', monto: 45, fecha: '2026-11-06', categoria: ['Restaurante'], localization: '', pagado_por: 'u2' };
const nuevoGasto = (datos: typeof cenaDatos) => ({
  tipo: 'crear_gasto', datos, peligro: false, resumen: `Nuevo gasto «${datos.descripcion}»`, detalle: '6 nov 2026 · Restaurante · pagó Ana'
});
const cena = nuevoGasto(cenaDatos);
const borrarCervezas = { tipo: 'borrar_gasto', id: 'e1', peligro: true, resumen: 'Borrar gasto «Cervezas» · 12,00 € · 3 nov 2026' };

describe('AiChatBar', () => {
  const onExpensesAdded = vi.fn();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const renderBar = () => render(<AiChatBar groupId="g1" token="tok" onExpensesAdded={onExpensesAdded} />);

  const sendText = async (text: string) => {
    fireEvent.change(screen.getByLabelText('Escribe a la IA'), { target: { value: text } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
  };

  it('muestra el micrófono con el campo vacío y el botón de enviar al escribir', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Escribe a la IA'), { target: { value: 'Cena' } });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grabar nota de voz' })).not.toBeInTheDocument();
  });

  it('manda el texto a la IA y propone los gastos sin guardarlos', async () => {
    fetchMock.mockResolvedValueOnce(draftsResponse([cena]));
    renderBar();
    await sendText('Cena 45 euros, pagó Ana');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/groups/g1/assistant');
    expect((options.body as FormData).get('texto')).toBe('Cena 45 euros, pagó Ana');
    expect((options.body as FormData).get('historial')).toBe('[]');

    expect(screen.getByText('Cena 45 euros, pagó Ana')).toBeInTheDocument();
    expect(await screen.findByText('Cena')).toBeInTheDocument();
    expect(screen.getByText(/pagó Ana/, { selector: '.ai-chat-bar__draft-meta' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpensesAdded).not.toHaveBeenCalled();
  });

  it('guarda los gastos confirmados en un solo envío', async () => {
    fetchMock
      .mockResolvedValueOnce(draftsResponse([cena]))
      .mockResolvedValueOnce(applied([{ resumen: 'Nuevo gasto «Cena»', ok: true }]));
    renderBar();
    await sendText('Cena 45 euros, pagó Ana');

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Guardar/ }));
    });

    await waitFor(() => expect(onExpensesAdded).toHaveBeenCalled());
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toContain('/groups/g1/assistant/apply');
    expect(JSON.parse(options.body)).toEqual({
      acciones: [{ ...cena, datos: { ...cenaDatos, localization: 'Calle Mayor, Madrid' } }]
    });
    expect(screen.queryByText('Cena')).not.toBeInTheDocument();
  });

  it('permite corregir el importe y quitar gastos antes de guardar', async () => {
    fetchMock
      .mockResolvedValueOnce(draftsResponse([cena, nuevoGasto({ ...cenaDatos, descripcion: 'Taxi', monto: 12 })]))
      .mockResolvedValueOnce(applied([{ resumen: 'Nuevo gasto «Cena»', ok: true }]));
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
    expect(body.acciones).toHaveLength(1);
    expect(body.acciones[0].datos.monto).toBe(40.5);
    expect(body.acciones[0].datos.descripcion).toBe('Cena');
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

  it('contesta preguntas sin proponer nada que confirmar', async () => {
    fetchMock.mockResolvedValueOnce(reply([], 'Te quedan 246 € este ciclo.'));
    renderBar();
    await sendText('¿Cuánto me queda?');
    expect(await screen.findByText('Te quedan 246 € este ciclo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar|Confirmar/ })).not.toBeInTheDocument();
  });

  it('manda la conversación reciente para poder contestar a lo que pregunta', async () => {
    fetchMock
      .mockResolvedValueOnce(reply([], '¿La cerveza del lunes o la del martes?'))
      .mockResolvedValueOnce(reply([borrarCervezas]));
    renderBar();
    await sendText('borra la cerveza');
    await screen.findByText('¿La cerveza del lunes o la del martes?');
    await sendText('la del lunes');

    expect(JSON.parse(fetchMock.mock.calls[1][1].body.get('historial'))).toEqual([
      { rol: 'usuario', texto: 'borra la cerveza' },
      { rol: 'asistente', texto: '¿La cerveza del lunes o la del martes?' }
    ]);
  });

  it('propone cambios de cualquier tipo, marca los borrados y los aplica al confirmar', async () => {
    const subirFacsa = { tipo: 'editar_partida', id: 'p1', datos: { importe: 55 }, peligro: false, resumen: 'Cambiar partida fija «Facsa»', detalle: 'importe: 50,00 € → 55,00 €' };
    fetchMock
      .mockResolvedValueOnce(reply([subirFacsa, borrarCervezas], 'Te propongo esto:'))
      .mockResolvedValueOnce(applied([{ resumen: 'Cambiar partida fija «Facsa»', ok: true }, { resumen: 'Borrar gasto «Cervezas»', ok: true }]));
    renderBar();
    await sendText('sube facsa a 55 y borra las cervezas');

    expect(await screen.findByText('importe: 50,00 € → 55,00 €')).toBeInTheDocument();
    expect(screen.getByText(/Borrar gasto «Cervezas»/).closest('li')).toHaveClass('ai-chat-bar__draft--danger');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ acciones: [subirFacsa, borrarCervezas] });
    await waitFor(() => expect(onExpensesAdded).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Respuesta de la IA' })).not.toBeInTheDocument();
  });

  it('deja quitar una acción antes de confirmar', async () => {
    fetchMock.mockResolvedValueOnce(reply([cena, borrarCervezas]));
    renderBar();
    await sendText('cena 45 y borra las cervezas');

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: `Quitar ${borrarCervezas.resumen}` }));
    expect(screen.queryByText(/Cervezas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar 45,00 €/ })).toBeInTheDocument();
  });

  it('enseña lo que no se ha podido aplicar', async () => {
    fetchMock
      .mockResolvedValueOnce(reply([borrarCervezas, cena]))
      .mockResolvedValueOnce(applied([
        { resumen: 'Borrar gasto «Cervezas»', ok: false, error: 'Gasto no encontrado' },
        { resumen: 'Nuevo gasto «Cena»', ok: true }
      ]));
    renderBar();
    await sendText('borra las cervezas y apunta la cena');
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    });

    expect(await screen.findByText(/✗ Borrar gasto «Cervezas»: Gasto no encontrado/)).toBeInTheDocument();
    expect(screen.getByText(/✓ Nuevo gasto «Cena»/)).toBeInTheDocument();
    expect(onExpensesAdded).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
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
