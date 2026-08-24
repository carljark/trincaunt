const fs = require('fs');
let file = fs.readFileSync('api/src/services/AiService.ts', 'utf8');

file = file.replace(
  /private ai: GoogleGenAI;\n\n  constructor\(\) \{\n    this.ai = new GoogleGenAI\(\{\}\);\n  \}/,
  `private get ai(): GoogleGenAI {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  constructor() {}`
);

fs.writeFileSync('api/src/services/AiService.ts', file);
