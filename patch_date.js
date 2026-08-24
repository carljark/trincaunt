const fs = require('fs');
let file = fs.readFileSync('client/src/pages/GroupDetailPage.tsx', 'utf8');

file = file.replace(
  /if \(dateToFilter && new Date\(expense\.fecha\) > new Date\(dateToFilter\)\) \{\n\s*return false;\n\s*\}/,
  `if (dateToFilter) {
      const filterDate = new Date(dateToFilter);
      filterDate.setUTCHours(23, 59, 59, 999);
      if (new Date(expense.fecha) > filterDate) {
        return false;
      }
    }`
);

fs.writeFileSync('client/src/pages/GroupDetailPage.tsx', file);
