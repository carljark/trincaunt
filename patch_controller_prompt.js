const fs = require('fs');
let file = fs.readFileSync('api/src/controllers/ExpenseController.ts', 'utf8');

file = file.replace(
  /\/\/ Obtener categorías existentes para ayudar a la IA\n\s*const existingAliases = await aliasService\.getAllAliases\(grupo_id\);\n\s*const categoryNames = existingAliases\.map\(a => `\$\{a\.alias\} \(ej\. \$\{a\.mainCategories\.join\(\', \'\)\}\)`\);\n\s*/,
  ""
);

file = file.replace(
  /const parsedExpenses = await AiService\.parseExpenseFromMedia\(req\.file\.buffer, req\.file\.mimetype, categoryNames\);/,
  "const parsedExpenses = await AiService.parseExpenseFromMedia(req.file.buffer, req.file.mimetype, []);"
);

fs.writeFileSync('api/src/controllers/ExpenseController.ts', file);
