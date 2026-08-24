const fs = require('fs');
let file = fs.readFileSync('api/src/services/AiService.ts', 'utf8');

file = file.replace(
  /Intenta usar UNA de estas categorías ya existentes en el grupo si encaja bien:[\s\S]*?\}./,
  `Intenta usar UNA de estas categorías ya existentes (Alias o Categorías principales) en el grupo si encaja bien: \${existingCategories.length > 0 ? existingCategories.join(' | ') : 'Alimentación, Transporte, Ocio, etc'}.`
);

fs.writeFileSync('api/src/services/AiService.ts', file);
