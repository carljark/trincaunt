const fs = require('fs');
let file = fs.readFileSync('api/src/app.ts', 'utf8');

file = file.replace(
  /path\.join\(__dirname, '\.\.\/\.\.\/\.\.\/client\/dist'\)/,
  "path.join(__dirname, '../../client/dist')"
);

fs.writeFileSync('api/src/app.ts', file);
