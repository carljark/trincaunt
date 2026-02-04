import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB maximum
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
}).single('receipt');

export const uploadReceipt = (req: Request, res: Response) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No se subió ninguna foto' });
    }

    // For now, just return the file info
    // In the future, this will trigger the expense processing
    res.status(200).json({
      message: 'Recibo subido con éxito',
      filename: req.file.filename,
      path: req.file.path,
    });
  });
};
