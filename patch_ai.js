const fs = require('fs');
let file = fs.readFileSync('api/src/services/AiService.ts', 'utf8');
file = file.replace(
  /export interface ParsedExpense \{([^}]+)\}/,
  "export interface ParsedExpense {\n  descripcion: string;\n  monto: number;\n  categoria?: string[];\n}"
);

file = file.replace(
  /\[[\s\S]*?"monto": 0.00\n\s*\}\n\]/,
  `[
  {
    "descripcion": "Descripción concisa del gasto",
    "monto": 0.00,
    "categoria": ["NombreCategoria"]
  }
]

Si puedes deducir la categoría del gasto (ej: Alimentación, Alcohol, Transporte, Restaurante, Hogar, Ocio...), añádela como un array de strings en el campo "categoria". Si no estás seguro, omite el campo o usa ["Varios"].`
);
fs.writeFileSync('api/src/services/AiService.ts', file);
