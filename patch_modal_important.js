const fs = require('fs');
let file = fs.readFileSync('client/src/components/AddExpenseModal.scss', 'utf8');

file = file.replace(
  /align-items: flex-start;/,
  'align-items: flex-start !important;'
);
file = file.replace(
  /padding-top: calc\(env\(safe-area-inset-top, 20px\) \+ 10px\);/,
  'padding-top: calc(env(safe-area-inset-top, 20px) + 10px) !important;'
);
file = file.replace(
  /max-height: calc\(100vh - env\(safe-area-inset-top, 20px\) - env\(safe-area-inset-bottom, 20px\) - 20px\);/,
  'max-height: calc(100vh - env(safe-area-inset-top, 20px) - env(safe-area-inset-bottom, 20px) - 20px) !important;'
);

fs.writeFileSync('client/src/components/AddExpenseModal.scss', file);
