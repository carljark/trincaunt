import dotenv from 'dotenv';
dotenv.config();
import AiService from './src/services/AiService';
import fs from 'fs';

async function test() {
  try {
    // Generar un pequeño texto o imagen de prueba
    const buffer = Buffer.from("Hola Gemini, apúntame un gasto de 25 euros en gasolina.");
    console.log("Enviando a Gemini...");
    const result = await AiService.parseExpenseFromMedia(buffer, 'text/plain');
    console.log("Resultado exitoso:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error devuelto:", error);
  }
}

test();
