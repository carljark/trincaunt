# Filosofía TDD y Estrategia de Testing

## Desarrollo Guiado por Pruebas (TDD)
- A partir de ahora, toda nueva "feature", componente o lógica de negocio debe implementarse siguiendo estrictamente la filosofía **TDD (Test Driven Development)**.
- **Flujo de trabajo obligatorio:**
  1. **Escribir el test primero:** Antes de tocar el código de producción, se debe crear o modificar el archivo de test correspondiente definiendo el comportamiento esperado (el test debe fallar inicialmente).
  2. **Implementar la feature:** Escribir el código mínimo necesario para que el test pase.
  3. **Refactorizar:** Limpiar y optimizar el código manteniendo el test en verde.

## Tecnologías de Testing en el Proyecto
- **Frontend (Client):** Los tests unitarios y de integración se ejecutarán con **Vitest** (configurado mediante Vite).
- **Backend (API):** Los tests unitarios y de integración se ejecutarán con **Jest** (según la configuración en `api/jest.config.js`).
- **Tests End-to-End (E2E):** Para las pruebas de flujo completo (simulando interacciones reales del usuario en el navegador), se utilizará **Cypress** (próxima integración). Las reglas de TDD también aplican a los flujos E2E cuando corresponda.
