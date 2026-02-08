import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1', routes);

// Servir archivos estáticos del frontend en producción
if (process.env.NODE_ENV === 'production') {
  // Servir la carpeta 'dist' generada por Vite/React
  const clientDistPath = path.join(__dirname, '../../../client/dist');
  app.use(express.static(clientDistPath));

  // Para cualquier otra petición que no sea de la API, servir el index.html de React
  // Esto permite que el enrutamiento del lado del cliente de React funcione correctamente.
  app.get('*', (req, res) => {
    res.sendFile(
      path.resolve(
        clientDistPath, 'index.html'));
  });
}

// Global Error Handler
app.use(errorHandler);

export default app;
