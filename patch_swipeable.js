const fs = require('fs');
let file = fs.readFileSync('client/src/components/SwipeableExpenseItem.tsx', 'utf8');

file = file.replace(
  /className="expense-actions desktop-actions"/g,
  'className="desktop-actions"'
);

fs.writeFileSync('client/src/components/SwipeableExpenseItem.tsx', file);
