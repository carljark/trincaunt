# Asistente de IA para Inserción de Gastos (Multimodal)

## Propósito
Facilitar enormemente la entrada de datos en la aplicación Trincaunt. En lugar de rellenar manualmente formularios (descripción, monto, grupo), el usuario podrá subir una foto de un ticket o grabar un audio (ej. "He pagado 25 euros por las cervezas de esta noche en el grupo Viaje a Madrid"). El sistema utilizará el modelo de IA Gemini para procesar la entrada multimodal y extraer un objeto `Expense` estructurado.

## Arquitectura/Flujo
1. **Frontend (FAB):** Se añadirá una nueva acción al `QuickExpenseFAB` existente que permita invocar la cámara/galería o el micrófono del dispositivo.
2. **Endpoint API (`POST /api/expenses/ai-parse`):** Recibirá un archivo (imagen o audio) mediante `multipart/form-data` utilizando `multer`.
3. **Servicio de IA (`AiService`):** Aislará la lógica de la llamada al SDK `@google/genai`. Formateará el prompt del sistema y le pasará el archivo binario al modelo `gemini-3.6-flash` (o `gemini-3.6-pro` si es necesario mayor razonamiento).
4. **Respuesta Estructurada:** El modelo de IA devolverá un JSON validado con los campos: `descripcion`, `monto` y (si se deduce) `categoria` o `grupoId`.
5. **Aprobación del Usuario:** El Frontend mostrará los datos pre-rellenados en el modal habitual para que el usuario dé el "OK" definitivo antes de guardar en base de datos.

## Archivos a Modificar / Crear
- **Backend:**
  - `api/tests/services/AiService.test.ts` (NUEVO - Test TDD)
  - `api/src/services/AiService.ts` (NUEVO)
  - `api/src/controllers/ExpenseController.ts` (Nuevo método)
  - `api/src/routes/expenseRoutes.ts` (Nueva ruta)
  - `api/package.json` (Añadir `@google/genai`)
- **Frontend:**
  - `client/src/components/QuickExpenseFAB.tsx` (Nuevo botón y lógica de captura)

## Detalles Técnicos
- **Metodología TDD:** Todo el código del backend será impulsado por tests en Vitest antes de su implementación real.
- **Multimodalidad:** Se aprovechará la capacidad de Gemini para ingerir `mimeType` y `data` en base64 o buffers, evitando tener que usar APIs de OCR o Speech-to-Text por separado.
- **JSON Mode:** Se forzará al modelo a devolver el resultado con `responseSchema` o usando JSON Mode para garantizar que el backend no tenga que hacer parseo frágil mediante Regex.
