const fs = require('fs');
let file = fs.readFileSync('api/src/controllers/ExpenseController.ts', 'utf8');

file = file.replace(
  /const parsedExpenses = await AiService\.parseExpenseFromMedia\(req\.file\.buffer, req\.file\.mimetype\);/,
  `// Obtener categorías existentes para ayudar a la IA
    const existingCats = await expenseService.getExpenseCategories(grupo_id);
    const categoryNames = existingCats.map(c => c.category);
    
    const parsedExpenses = await AiService.parseExpenseFromMedia(req.file.buffer, req.file.mimetype, categoryNames);`
);

fs.writeFileSync('api/src/controllers/ExpenseController.ts', file);
