import app from './app';
import { connectDB } from './config/db';
import dotenv from 'dotenv';
import { runMigrations } from './migrations/runner';

dotenv.config();

const PORT = process.env.PORT || 3000;

connectDB().then(async () => {
  try {
    await runMigrations();
  } catch (error) {
    console.error('Fallo crítico ejecutando migraciones:', error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});