import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiService from '../../src/services/AiService';

// Hacemos mock de la librería de Google GenAI
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          text: () => JSON.stringify([
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
    expect(result[1]).toHaveProperty('descripcion', 'Bebidas');
    expect(result[1]).toHaveProperty('monto', 5.0);
  });

  it('debería lanzar un error si la IA devuelve un formato inválido', async () => {
    // Para sobreescribir el mock, accedemos a la instancia interna (truco para tests)
    const { GoogleGenAI } = await import('@google/genai');
    
    // Obtenemos una instancia fresca de la clase mockeada para este test
    const aiInstance = new GoogleGenAI({});
    aiInstance.models.generateContent = vi.fn().mockResolvedValue({
      text: () => 'Esto no es un JSON'
    });
    
    // Forzamos a AiService a usar nuestra instancia rota
    vi.spyOn(AiService as any, 'ai', 'get').mockReturnValue(aiInstance);

    const fakeImageBuffer = Buffer.from('fake image content');
    
    await expect(AiService.parseExpenseFromMedia(fakeImageBuffer, 'image/jpeg'))
      .rejects.toThrow('No se pudo interpretar la respuesta de la IA');
  });
});
