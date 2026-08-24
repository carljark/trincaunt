import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

async function list() {
  try {
    const ai = new GoogleGenAI({});
    const response = await ai.models.list();
    for await (const model of response) {
      console.log(model.name);
    }
  } catch (error) {
    console.error("Error devuelto:", error);
  }
}

list();
