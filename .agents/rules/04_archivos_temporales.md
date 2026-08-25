# Archivos temporales

Cualquier archivo de script temporal, parche, o archivo de prueba creado por el agente (como los scripts de tipo `patch_...js` usados para inyectar o modificar código) debe guardarse exclusivamente dentro del directorio `/temp/` en la raíz del proyecto. 

Este directorio está excluido del control de versiones (añadido en `.gitignore`), lo que asegura que estos archivos no ensucian el repositorio de código ni requieren ser limpiados o excluidos manualmente al hacer un commit.
