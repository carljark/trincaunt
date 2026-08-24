const fs = require('fs');
let file = fs.readFileSync('client/src/components/QuickExpenseFAB.tsx', 'utf8');

file = file.replace(
  /if \(isMobileDevice\(\)\) aiAudioRef\.current\?\.click\(\);\n\s*else \{ setShowAiOptions\(false\); setShowAudioModal\(true\); \}/,
  "setShowAiOptions(false); setShowAudioModal(true);"
);

fs.writeFileSync('client/src/components/QuickExpenseFAB.tsx', file);
