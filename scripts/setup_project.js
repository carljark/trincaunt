const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

const structure = [
  // Backend (API)
  'api/src/config',
  'api/src/controllers',
  'api/src/dtos',
  'api/src/middlewares',
  'api/src/models',
  'api/src/routes',
  'api/src/services',
  'api/src/utils',
  'api/tests/unit',
  
  // Frontend (Client)
  'client/src/components',
  'client/src/hooks',
  'client/src/pages',
  'client/src/services',
  
  // E2E Tests
  'cypress/e2e',
  'cypress/support'
];

const files = [
  // Backend Files
  'api/package.json',
  'api/tsconfig.json',
  'api/src/server.ts',
  'api/src/app.ts',
  'api/src/config/db.ts',
  'api/src/utils/AppError.ts',
  'api/src/middlewares/errorHandler.ts',
  'api/src/models/User.ts',
  'api/src/models/Group.ts',
  'api/src/models/Expense.ts',
  'api/src/controllers/UserController.ts',
  'api/src/controllers/GroupController.ts',
  'api/src/controllers/ExpenseController.ts',
  'api/src/services/UserService.ts',
  'api/src/services/GroupService.ts',
  'api/src/services/ExpenseService.ts',
  'api/src/routes/index.ts',
  
  // Frontend Files (Skeleton)
  'client/package.json',
  'client/tsconfig.json',
  'client/src/App.tsx',
  'client/src/main.tsx',
  
  // Cypress
  'cypress/e2e/trincaunt.cy.ts'
];

structure.forEach(dir => {
  fs.mkdirSync(path.join(rootDir, dir), { recursive: true });
  console.log(`Created dir: ${dir}`);
});

files.forEach(file => {
  fs.writeFileSync(path.join(rootDir, file), '');
  console.log(`Created file: ${file}`);
});

console.log('Project structure generated successfully.');