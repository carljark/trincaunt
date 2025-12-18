const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

const fileMappings = {
  // Configuración y Utilidades API
  'db.ts': 'api/src/config/db.ts',
  'AppError.ts': 'api/src/utils/AppError.ts',
  'errorHandler.ts': 'api/src/middlewares/errorHandler.ts',
  
  // Modelos API
  'User.ts': 'api/src/models/User.ts',
  'Group.ts': 'api/src/models/Group.ts',
  'Expense.ts': 'api/src/models/Expense.ts',
  
  // Servicios API
  'UserService.ts': 'api/src/services/UserService.ts',
  'GroupService.ts': 'api/src/services/GroupService.ts',
  'ExpenseService.ts': 'api/src/services/ExpenseService.ts',
  
  // Controladores API
  'UserController.ts': 'api/src/controllers/UserController.ts',
  'GroupController.ts': 'api/src/controllers/GroupController.ts',
  'ExpenseController.ts': 'api/src/controllers/ExpenseController.ts',
  
  // Core API
  'index.ts': 'api/src/routes/index.ts',
  'app.ts': 'api/src/app.ts',
  'server.ts': 'api/src/server.ts',
  'package.json': 'api/package.json',
  'tsconfig.json': 'api/tsconfig.json',
  
  // Frontend
  'App.tsx': 'client/src/App.tsx',
  
  // Tests E2E
  'trincaunt.cy.ts': 'cypress/e2e/trincaunt.cy.ts'
};

Object.entries(fileMappings).forEach(([srcFile, destPath]) => {
  const src = path.join(rootDir, srcFile);
  const dest = path.join(rootDir, destPath);
  
  if (fs.existsSync(src)) {
    // Asegurar que el directorio destino existe (por si acaso)
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    
    fs.renameSync(src, dest);
    console.log(`Movido: ${srcFile} -> ${destPath}`);
  }
});
console.log('Organización de archivos completada.');