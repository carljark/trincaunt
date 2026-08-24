const fs = require('fs');
let file = fs.readFileSync('api/src/services/AiService.ts', 'utf8');

file = file.replace(
  /Si puedes deducir la categoría del gasto[\s\S]*?o usa \["Varios"\]\./,
  `Deduce la categoría del gasto y añádela como un array de strings en el campo "categoria".
Queremos que seas muy preciso con la categoría (por ejemplo, si es Cerveza, usa ["Alcohol"] o ["Bebidas"] en lugar del genérico ["Ocio"]; si es un billete de tren, usa ["Tren"] en lugar de ["Transporte"]). 
No te ciñas a categorías genéricas preexistentes, sé lo más descriptivo y exacto posible.`
);

fs.writeFileSync('api/src/services/AiService.ts', file);
