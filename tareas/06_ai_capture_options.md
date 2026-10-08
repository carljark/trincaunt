# Opciones de Captura para IA (Cámara, Micrófono, Archivos)

## Propósito
Mejorar la experiencia de usuario (UX) en dispositivos móviles para que la Inteligencia Artificial pueda recibir información directamente de la cámara o el micrófono, sin obligar al usuario a abrir la galería o tener archivos guardados previamente.

## Frontend
1. **Componente QuickExpenseFAB:**
   - Crear tres `refs` distintos:
     - `aiCameraRef`: `<input type="file" accept="image/*" capture="environment" />`
     - `aiAudioRef`: `<input type="file" accept="audio/*" capture="microphone" />`
     - `aiFileRef`: `<input type="file" accept="image/*,audio/*" />`
   - Crear un estado `showAiOptions` (booleano).
   - Cuando el usuario haga click principal en el FAB y el icono activo sea `✨`, en lugar de abrir el input directamente, se establecerá `showAiOptions(true)`.
   - Renderizar un sub-menú (similar a `icon-selector` pero con opciones de texto o iconos claros) que muestre:
     - 📸 Hacer Foto
     - 🎤 Grabar Audio
     - 📎 Subir Archivo
   - Al hacer click en una opción, se disparará el `click()` del input correspondiente y se ocultará el menú.
   - El manejador de archivos (`handleAiFileSelect`) será el mismo para los 3 inputs, centralizando la lógica asíncrona existente.
