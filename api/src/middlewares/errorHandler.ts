import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/AppError';

export const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
  // Archivos subidos (fotos y audios de la IA): es un fallo de la petición, no del servidor
  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es demasiado grande' : err.message;
    res.status(400).json({ status: 'fail', message });
    return;
  }

  const statusCode = err.statusCode || 500;
  
  res.status(statusCode).json({
    status: err.status || 'error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};
