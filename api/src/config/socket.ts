import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

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

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'trincaunt_secret');
      (socket as any).user = decoded;
      next();
    } catch (err) {
      next(new Error('Autenticación denegada: Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Usuario conectado al socket: ${(socket as any).user.id}`);

    // Cuando el cliente entra a la pantalla de un grupo
    socket.on('join_group', (groupId: string) => {
      socket.join(`group_${groupId}`);
      console.log(`Usuario ${(socket as any).user.id} se unió a la sala group_${groupId}`);
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
