import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AiService from '../../src/services/AiService';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify([
            { descripcion: 'Cena en el Mercadona', monto: 15.5 },
            { descripcion: 'Bebidas', monto: 5.0 }
          ])
        })
      };
    }
  };
});

describe('AiService (TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debería recibir un archivo multimedia (buffer) y devolver un array de gastos', async () => {
    const fakeAudioBuffer = Buffer.from('fake audio content');
    const mimeType = 'audio/mp3';

    const result = await AiService.parseExpenseFromMedia(fakeAudioBuffer, mimeType);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('descripcion', 'Cena en el Mercadona');
    expect(result[0]).toHaveProperty('monto', 15.5);
  });

  it('debería detectar localización y fecha si existen en el recibo o audio', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    const aiInstance = new GoogleGenAI({});
    aiInstance.models.generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { descripcion: 'Hotel', monto: 120.0, localization: 'Madrid', fecha: '2026-08-25T12:00:00Z' }
      ])
    });
    vi.spyOn(AiService as any, 'ai', 'get').mockReturnValue(aiInstance);

    const fakeImageBuffer = Buffer.from('fake image content');
    const result = await AiService.parseExpenseFromMedia(fakeImageBuffer, 'image/jpeg');
    
    expect(result[0]).toHaveProperty('localization', 'Madrid');
    expect(result[0]).toHaveProperty('fecha', '2026-08-25T12:00:00Z');
  });

  it('debería lanzar un error si la IA devuelve un formato inválido', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    const aiInstance = new GoogleGenAI({});
    aiInstance.models.generateContent = vi.fn().mockResolvedValue({
      text: 'Esto no es un JSON'
    });
    vi.spyOn(AiService as any, 'ai', 'get').mockReturnValue(aiInstance);

    const fakeImageBuffer = Buffer.from('fake image content');
    
    await expect(AiService.parseExpenseFromMedia(fakeImageBuffer, 'image/jpeg'))
      .rejects.toThrow('FALLO IA:');
  });
});

describe('AiService - respaldo OpenRouter', () => {
  const geminiFailing = async () => {
    const { GoogleGenAI } = await import('@google/genai');
    const aiInstance = new GoogleGenAI({});
    aiInstance.models.generateContent = vi.fn().mockRejectedValue(new Error('503 overloaded'));
    vi.spyOn(AiService as any, 'ai', 'get').mockReturnValue(aiInstance);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('debería usar OpenRouter con una foto si Gemini falla', async () => {
    await geminiFailing();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n[{"descripcion":"Taxi","monto":12}]\n```' } }]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AiService.parseExpenseFromMedia(Buffer.from('img'), 'image/png');

    expect(result).toEqual([{ descripcion: 'Taxi', monto: 12 }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('qwen/qwen3.8-omni-flash');
    expect(body.messages[0].content[1].image_url.url).toBe(`data:image/png;base64,${Buffer.from('img').toString('base64')}`);
  });

  it.each([
    ['audio/webm', 'webm'],
    ['audio/mp4', 'mp4'],
    ['audio/mpeg', 'mp3'],
  ])('debería usar OpenRouter con un audio %s si Gemini falla', async (mimeType, format) => {
    await geminiFailing();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '[{"descripcion":"Taxi","monto":12}]' } }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AiService.parseExpenseFromMedia(Buffer.from('aud'), mimeType);

    expect(result).toEqual([{ descripcion: 'Taxi', monto: 12 }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content[1]).toEqual({
      type: 'input_audio',
      input_audio: { data: Buffer.from('aud').toString('base64'), format }
    });
  });

  it('no debería usar OpenRouter sin clave configurada', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await geminiFailing();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(AiService.parseExpenseFromMedia(Buffer.from('img'), 'image/jpeg'))
      .rejects.toThrow('FALLO IA: 503 overloaded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debería informar del error de OpenRouter si también falla', async () => {
    await geminiFailing();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => 'no credits' }));

    await expect(AiService.parseExpenseFromMedia(Buffer.from('img'), 'image/jpeg'))
      .rejects.toThrow('FALLO IA: OpenRouter 402: no credits');
  });
});

describe('AiService - fecha actual en el prompt', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debería incluir la fecha de hoy en España para resolver fechas relativas', async () => {
    vi.useFakeTimers();
    // 23:30 UTC del 30 de octubre ya es 31 de octubre en Madrid
    vi.setSystemTime(new Date('2026-10-30T23:30:00Z'));
    const { GoogleGenAI } = await import('@google/genai');
    const aiInstance = new GoogleGenAI({});
    const generateContent = vi.fn().mockResolvedValue({ text: '[]' });
    aiInstance.models.generateContent = generateContent;
    vi.spyOn(AiService as any, 'ai', 'get').mockReturnValue(aiInstance);

    await AiService.parseExpenseFromMedia(Buffer.from('aud'), 'audio/webm');

    const prompt = generateContent.mock.calls[0][0].contents[0];
    expect(prompt).toContain('Hoy es sábado, 31 de octubre de 2026 (2026-10-31)');
  });
});
