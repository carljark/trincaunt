const fs = require('fs');
let file = fs.readFileSync('api/src/controllers/ExpenseController.ts', 'utf8');

if (!file.includes('CategoryAliasService')) {
  file = file.replace(
    /import \{ ExpenseService \} from '\.\.\/services\/ExpenseService';/,
    "import { ExpenseService } from '../services/ExpenseService';\nimport { CategoryAliasService } from '../services/CategoryAliasService';"
  );
  
  file = file.replace(
    /const expenseService = new ExpenseService\(\);/,
    "const expenseService = new ExpenseService();\nconst aliasService = new CategoryAliasService();"
  );
}

file = file.replace(
  /const existingCats = await expenseService\.getExpenseCategories\(grupo_id\);\n\s*const categoryNames = existingCats\.map\(c => c\.category\);/,
  `const existingAliases = await aliasService.getAllAliases(grupo_id);
    const categoryNames = existingAliases.map(a => \`\${a.alias} (ej. \${a.mainCategories.join(', ')})\`);`
);

fs.writeFileSync('api/src/controllers/ExpenseController.ts', file);
