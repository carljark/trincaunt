import { GoogleGenAI } from '@google/genai';
import { AppError } from '../utils/AppError';

// Respaldo de Gemini (fotos y audios) cuando éste falla
const OPENROUTER_MODEL = 'qwen/qwen3.8-omni-flash';

// OpenRouter pide el formato del audio por nombre, no por mimetype
const AUDIO_FORMATS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-m4a': 'm4a',
};

export interface ParsedExpense {
  descripcion: string;
  monto: number;
  categoria?: string[];
  localization?: string;
  fecha?: string;
}

class AiService {
  private get ai(): GoogleGenAI {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  constructor() {}

  public async parseExpenseFromMedia(buffer: Buffer, mimeType: string, existingCategories: string[] = []): Promise<ParsedExpense[]> {
    if (mimeType.startsWith('video/')) {
      throw new AppError('Gemini no soporta vídeos. Por favor graba solo nota de voz o sube una foto.', 400);
    }
    const prompt = `Eres un asistente financiero ultra-preciso. 
Te voy a pasar un archivo (puede ser una imagen de un ticket/factura, o una grabación de voz mía diciéndote gastos).
Hoy es ${this.today()}. Usa esta fecha para resolver fechas relativas como "ayer", "anteayer" o "el lunes", y para completar el año si el ticket no lo indica.
Tu única tarea es extraer la información de los gastos y devolverla ESTRICTAMENTE en formato JSON, sin texto adicional, sin markdown, solo el objeto JSON crudo.

El JSON debe ser un ARRAY de objetos con exactamente esta estructura:
[
  {
    "descripcion": "Descripción concisa del gasto",
    "monto": 0.00,
    "categoria": ["NombreCategoria"],
    "localization": "Lugar o establecimiento (si se menciona o aparece en el ticket)",
    "fecha": "Fecha en formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) si aparece o se menciona. Si no hay hora, asume 12:00:00Z"
  }
]

Deduce la categoría del gasto y añádela como un array de strings en el campo "categoria".
Queremos que seas muy preciso con la categoría (por ejemplo, si es Cerveza, usa ["Alcohol"] o ["Bebidas"] en lugar del genérico ["Ocio"]; si es un billete de tren, usa ["Tren"] en lugar de ["Transporte"]). 
No te ciñas a categorías genéricas preexistentes, sé lo más descriptivo y exacto posible.

Si la imagen es un recibo con múltiples productos o ítems, agrúpalos si es lógico o devuélvelos como elementos separados en el array, según lo que parezca más un 'gasto individual'. Si el archivo no contiene información sobre un gasto, devuelve un array vacío [].`;

    const data = buffer.toString('base64');
    try {
      return this.parseResponse(await this.askGemini(prompt, data, mimeType));
    } catch (geminiError) {
      console.error('Error procesando archivo con Gemini:', geminiError);
      if (!process.env.OPENROUTER_API_KEY) {
        throw this.toAppError(geminiError);
      }
      try {
        return this.parseResponse(await this.askOpenRouter(prompt, data, mimeType));
      } catch (fallbackError) {
        console.error('Error procesando archivo con OpenRouter:', fallbackError);
        throw this.toAppError(fallbackError);
      }
    }
  }

  // Fecha de hoy en España (el servidor corre en UTC), p. ej. "viernes, 30 de octubre de 2026 (2026-10-30)"
  private today(): string {
    const now = new Date();
    const timeZone = 'Europe/Madrid';
    const long = now.toLocaleDateString('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const iso = now.toLocaleDateString('sv-SE', { timeZone });
    return `${long} (${iso})`;
  }

  private async askGemini(prompt: string, data: string, mimeType: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [prompt, { inlineData: { data, mimeType } }],
      config: {
        responseMimeType: 'application/json',
      }
    });
    return response.text || '';
  }

  private async askOpenRouter(prompt: string, data: string, mimeType: string): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            this.toOpenRouterMedia(data, mimeType),
          ],
        }],
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
    }
    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content || '';
  }

  private toOpenRouterMedia(data: string, mimeType: string) {
    if (mimeType.startsWith('audio/')) {
      const format = AUDIO_FORMATS[mimeType] || mimeType.slice('audio/'.length);
      return { type: 'input_audio', input_audio: { data, format } };
    }
    return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } };
  }

  private parseResponse(responseText: string): ParsedExpense[] {
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
  }

  private toAppError(error: unknown): AppError {
    const errorStr = error instanceof Error ? error.message : String(error);
    return new AppError(`FALLO IA: ${errorStr}`, 500);
  }
}

export default new AiService();
