const fs = require('fs');
let file = fs.readFileSync('client/src/components/QuickExpenseFAB.tsx', 'utf8');

file = file.replace(
  /const resLoc = await fetch\(\`https:\/\/nominatim\.openstreetmap\.org\/reverse\?format=json&lat=\$\{pos\.coords\.latitude\}&lon=\$\{pos\.coords\.longitude\}\`\);/,
  `const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const resLoc = await fetch(\`https://nominatim.openstreetmap.org/reverse?format=json&lat=\${pos.coords.latitude}&lon=\${pos.coords.longitude}\`, { signal: controller.signal });
          clearTimeout(timeoutId);`
);

file = file.replace(
  /const res = await fetch\(\`https:\/\/nominatim\.openstreetmap\.org\/reverse\?format=json&lat=\$\{pos\.coords\.latitude\}&lon=\$\{pos\.coords\.longitude\}\`\);/,
  `const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(\`https://nominatim.openstreetmap.org/reverse?format=json&lat=\${pos.coords.latitude}&lon=\${pos.coords.longitude}\`, { signal: controller.signal });
      clearTimeout(timeoutId);`
);

// also fix the other getPosition just in case
file = file.replace(
  /const getPosition = \(\) => new Promise<GeolocationPosition>\(\(resolve, reject\) => \{\n\s*navigator\.geolocation\.getCurrentPosition\(resolve, reject, \{ timeout: 10000 \}\);\n\s*\}\);\n\s*const pos = await getPosition\(\);/,
  `const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('No geolocation'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 0 });
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Geolocalización expirada')), 4000));
      const pos = await Promise.race([getPosition(), timeoutPromise]) as GeolocationPosition;`
);

fs.writeFileSync('client/src/components/QuickExpenseFAB.tsx', file);
