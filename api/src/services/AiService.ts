import { GoogleGenAI } from '@google/genai';
import { AppError } from '../utils/AppError';

export interface ParsedExpense {
  descripcion: string;
  monto: number;
  categoria?: string[];
}

class AiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({});
  }

  public async parseExpenseFromMedia(buffer: Buffer, mimeType: string, existingCategories: string[] = []): Promise<ParsedExpense[]> {
    if (mimeType.startsWith('video/')) {
      throw new AppError('Gemini no soporta vídeos. Por favor graba solo nota de voz o sube una foto.', 400);
    }
    const prompt = `Eres un asistente financiero ultra-preciso. 
Te voy a pasar un archivo (puede ser una imagen de un ticket/factura, o una grabación de voz mía diciéndote gastos).
Tu única tarea es extraer la información de los gastos y devolverla ESTRICTAMENTE en formato JSON, sin texto adicional, sin markdown, solo el objeto JSON crudo.

El JSON debe ser un ARRAY de objetos con exactamente esta estructura:
[
  {
    "descripcion": "Descripción concisa del gasto",
    "monto": 0.00,
    "categoria": ["NombreCategoria"]
  }
]

Si puedes deducir la categoría del gasto, añádela como un array de strings en el campo "categoria".
Intenta usar UNA de estas categorías ya existentes (Alias o Categorías principales) en el grupo si encaja bien: ${existingCategories.length > 0 ? existingCategories.join(' | ') : 'Alimentación, Transporte, Ocio, etc'}.
Si ninguna encaja bien o la lista está vacía, puedes inventar una nueva (ej: Alcohol, Restaurante, Hogar). Si no estás seguro, omite el campo o usa ["Varios"].

Si la imagen es un recibo con múltiples productos o ítems, agrúpalos si es lógico o devuélvelos como elementos separados en el array, según lo que parezca más un 'gasto individual'. Si el archivo no contiene información sobre un gasto, devuelve un array vacío [].`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          prompt,
          {
            inlineData: {
              data: buffer.toString('base64'),
              mimeType: mimeType
            }
          }
        ],
        config: {
          responseMimeType: 'application/json',
        }
      });

      const responseText = response.text || '';
      if (!responseText) throw new Error('Respuesta vacía');

      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\n/, '').replace(/\n```$/, '');
      }
      
      let parsedData;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Raw AI Response:', responseText);
        throw parseError;
      }
      
      if (!Array.isArray(parsedData)) {
        throw new Error('Formato JSON inválido devuelto por la IA (no es un array)');
      }

      for (const item of parsedData) {
        if (typeof item.descripcion !== 'string' || typeof item.monto !== 'number') {
          throw new Error('Formato JSON inválido devuelto por la IA dentro del array');
        }
      }

      return parsedData as ParsedExpense[];

    } catch (error) {
      console.error('Error procesando archivo con IA:', error);
      throw new AppError(`No se pudo interpretar la respuesta de la IA: ${(error as any).message || 'Error desconocido'}`, 500);
    }
  }
}

export default new AiService();
