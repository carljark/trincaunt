import { describe, it, expect, vi, beforeEach } from 'vitest';
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
