# Scripts de migración y refactorización masiva

Para tareas de refactorización masiva, reemplazos globales complejos o migraciones de código en múltiples ficheros, el agente debe seguir las siguientes pautas:

1. **Crear script dedicado:** En lugar de encadenar comandos bash complejos o de usar repetitivamente herramientas de reemplazo de texto, se debe crear un script en Node.js o Python dedicado exclusivamente a realizar el procesado de los archivos.
2. **Ubicación en scratch:** Dicho script debe ser escrito utilizando la herramienta nativa y guardarse siempre en la carpeta temporal de trabajo interna del agente (`scratch/` dentro del directorio `<appDataDir>/brain/<conversation-id>`).
3. **Evitar cat y scripts en la raíz:** Nunca se debe utilizar `cat` en terminales de bash para crear scripts, ni escribir archivos de este tipo en la raíz del proyecto para evitar molestar al usuario pidiendo permisos de ejecución manuales.
4. **Limpieza posterior:** Una vez ejecutado con éxito el script de refactorización, el agente debe eliminar el archivo temporal de su carpeta `scratch/` para no dejar residuos.
