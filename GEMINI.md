# Reglas Globales del Asistente (Antigravity)

## 1. Control de Versiones
- **NUNCA** hagas commits automáticamente en el repositorio (Git).
- Limítate a escribir o modificar el código localmente. Si se requiere un commit, el usuario lo hará manualmente.

## 2. Documentación de Tareas y Diseño Técnico
- A partir de ahora, todo lo que implementes o desarrolles debe documentarse obligatoriamente en una carpeta llamada `tareas` en la raíz del proyecto.
- Si la carpeta `tareas` no existe, debes crearla.
- Por cada tarea importante que finalices, debes crear un archivo Markdown dentro de `tareas/`.
- **Nomenclatura:** El nombre del archivo debe estar numerado secuencialmente y reflejar la tarea de forma descriptiva. Ejemplo: `01_implementar_login.md`, `02_creacion_buscador.md`. (Antes de crear uno, revisa la carpeta para saber qué número toca).
- **Contenido del Documento:** El archivo debe redactarse como un "diseño técnico" profesional elaborado por un programador experto. Debe incluir:
  - **Propósito:** Qué se ha hecho y por qué.
  - **Arquitectura/Flujo:** Cómo interactúan las piezas creadas.
  - **Archivos Modificados:** Lista de archivos tocados o creados.
  - **Detalles Técnicos:** Explicación de las librerías usadas, patrones de diseño o decisiones complejas tomadas durante la implementación.
