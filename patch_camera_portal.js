const fs = require('fs');
let file = fs.readFileSync('client/src/components/CameraModal.tsx', 'utf8');

if (!file.includes('createPortal')) {
  file = file.replace(
    /import React, \{ useRef, useState, useEffect \} from 'react';/,
    "import React, { useRef, useState, useEffect } from 'react';\nimport { createPortal } from 'react-dom';"
  );
  
  file = file.replace(
    /return \(\n\s*<div className="modal-overlay"/,
    "const modalContent = (\n    <div className=\"modal-overlay\""
  );
  
  file = file.replace(
    /<\/div>\n\s*\);\n\};\n\nexport default/,
    "</div>\n  );\n\n  return createPortal(modalContent, document.body);\n};\n\nexport default"
  );
  
  fs.writeFileSync('client/src/components/CameraModal.tsx', file);
}
