import app from './app';
import http from 'http';
import { initSocket } from './config/socket';
import { connectDB } from './config/db';
import dotenv from 'dotenv';
import { runMigrations } from './migrations/runner';
import BudgetReminderService from './services/BudgetReminderService';

dotenv.config();

const PORT = process.env.PORT || 3000;

connectDB().then(async () => {
  try {
    await runMigrations();
  } catch (error) {
    console.error('Fallo crítico ejecutando migraciones:', error);
    process.exit(1);
  }

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Recordatorios del presupuesto por push: se comprueba cada hora (y al poco de arrancar)
  const HOUR = 60 * 60 * 1000;
  setTimeout(() => void BudgetReminderService.notifyDue(), 60 * 1000);
  setInterval(() => void BudgetReminderService.notifyDue(), HOUR);
});