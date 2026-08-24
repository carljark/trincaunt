const fs = require('fs');
let file = fs.readFileSync('client/src/components/AudioRecorderModal.tsx', 'utf8');

if (!file.includes('createPortal')) {
  file = file.replace(
    /import React, \{ useState, useRef, useEffect \} from 'react';/,
    "import React, { useState, useRef, useEffect } from 'react';\nimport { createPortal } from 'react-dom';"
  );
  
  file = file.replace(
    /return \(\n\s*<div className="modal-overlay"/,
    "const modalContent = (\n    <div className=\"modal-overlay\""
  );
  
  file = file.replace(
    /<\/div>\n\s*\);\n\};\n\nexport default/,
    "</div>\n  );\n\n  return createPortal(modalContent, document.body);\n};\n\nexport default"
  );
  
  fs.writeFileSync('client/src/components/AudioRecorderModal.tsx', file);
}
