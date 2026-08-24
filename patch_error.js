const fs = require('fs');
let file = fs.readFileSync('api/src/services/AiService.ts', 'utf8');
file = file.replace(
  /throw new AppError\(\`No se pudo interpretar la respuesta de la IA: \$\{error\.message \|\| 'Error desconocido'\}\`, 500\);/,
  "throw new AppError(`No se pudo interpretar la respuesta de la IA: ${(error as any).message || 'Error desconocido'}`, 500);"
);
fs.writeFileSync('api/src/services/AiService.ts', file);
