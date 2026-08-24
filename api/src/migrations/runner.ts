import fs from 'fs';
import path from 'path';
import Migration from '../models/Migration';

export async function runMigrations() {
  console.log('Comprobando migraciones pendientes...');
  const migrationsDir = path.join(__dirname);
  
  // Leer todos los archivos del directorio, filtrar .ts o .js, y ordenarlos alfabéticamente
  const files = fs.readdirSync(migrationsDir)
    .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && f !== 'runner.ts' && f !== 'runner.js')
    .sort();

  for (const file of files) {
    const migrationName = file;
    
    // Comprobar si ya se ejecutó
    const applied = await Migration.findOne({ name: migrationName });
    if (applied) {
      continue; // Ya se ejecutó
    }

    console.log(`Ejecutando migración: ${migrationName}`);
    try {
      // Importar dinámicamente el archivo de migración
      const migrationModule = await import(path.join(migrationsDir, file));
      
      // Debe exportar una función "up"
      if (typeof migrationModule.up === 'function') {
        await migrationModule.up();
        // Registrar en BD
        await Migration.create({ name: migrationName });
        console.log(`✅ Migración completada: ${migrationName}`);
      } else {
        console.warn(`⚠️ La migración ${migrationName} no exporta una función 'up'.`);
      }
    } catch (error) {
      console.error(`❌ Error ejecutando la migración ${migrationName}:`, error);
      throw error; // Detenemos el arranque si una migración falla
    }
  }
  
  console.log('Todas las migraciones están al día.');
}
