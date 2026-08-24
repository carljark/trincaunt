const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('api/package.json', 'utf8'));
pkg.scripts['start:prod'] = 'NODE_ENV=production node dist/server.js';
fs.writeFileSync('api/package.json', JSON.stringify(pkg, null, 2));
