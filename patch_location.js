const fs = require('fs');
let file = fs.readFileSync('client/src/components/QuickExpenseFAB.tsx', 'utf8');

const oldLoc = `const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 0 });
          });
          const pos = await getPosition();`;

const newLoc = `const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('No geolocation'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 0 });
          });
          // Forzamos un timeout real por si el navegador ignora el de getCurrentPosition (muy común en iOS/HTTP)
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Geolocalización expirada (timeout manual)')), 4000));
          const pos = await Promise.race([getPosition(), timeoutPromise]) as GeolocationPosition;`;

file = file.replace(oldLoc, newLoc);
fs.writeFileSync('client/src/components/QuickExpenseFAB.tsx', file);
