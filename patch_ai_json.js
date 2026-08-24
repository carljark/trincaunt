const fs = require('fs');
let file = fs.readFileSync('api/src/services/AiService.ts', 'utf8');

file = file.replace(
  /const parsedData = JSON\.parse\(responseText\);/,
  `let cleanedText = responseText.trim();
      if (cleanedText.startsWith('\`\`\`json')) {
        cleanedText = cleanedText.replace(/^\`\`\`json\\n/, '').replace(/\\n\`\`\`$/, '');
      } else if (cleanedText.startsWith('\`\`\`')) {
        cleanedText = cleanedText.replace(/^\`\`\`\\n/, '').replace(/\\n\`\`\`$/, '');
      }
      
      let parsedData;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Raw AI Response:', responseText);
        throw parseError;
      }`
);

fs.writeFileSync('api/src/services/AiService.ts', file);
