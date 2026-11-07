import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Group from '../models/Group';

let io: SocketIOServer;

export const initSocket = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // En producción puedes restringir a tu dominio
      methods: ['GET', 'POST']
    }
  });

  // Middleware de autenticación para sockets
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Autenticación denegada: No hay token'));
    }

    // Sin valor por defecto: con una clave conocida cualquiera podría firmar tokens válidos
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return next(new Error('Autenticación denegada: JWT_SECRET no está configurado en el servidor'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      (socket as any).user = decoded;
      next();
    } catch (err) {
      next(new Error('Autenticación denegada: Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Usuario conectado al socket: ${(socket as any).user.id}`);

    // Cuando el cliente entra a la pantalla de un grupo
    // Solo los miembros reciben los avisos en vivo del grupo
    socket.on('join_group', async (groupId: string) => {
      const userId = (socket as any).user.id;
      try {
        if (!mongoose.isValidObjectId(groupId) || !(await Group.exists({ _id: groupId, miembros: userId }))) {
          console.warn(`Usuario ${userId} intentó unirse a la sala group_${groupId} sin ser miembro`);
          return;
        }
        socket.join(`group_${groupId}`);
        console.log(`Usuario ${userId} se unió a la sala group_${groupId}`);
      } catch (error) {
        console.error('Error al unirse a la sala del grupo:', error);
      }
    });

    // Cuando el cliente sale de la pantalla de un grupo
    socket.on('leave_group', (groupId: string) => {
      socket.leave(`group_${groupId}`);
      console.log(`Usuario ${(socket as any).user.id} salió de la sala group_${groupId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${(socket as any).user.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io no ha sido inicializado!');
  }
  return io;
};
