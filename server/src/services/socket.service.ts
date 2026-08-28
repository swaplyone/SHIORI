import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function initSocketServer(socketServer: SocketIOServer) {
  io = socketServer;

  io.on('connection', (socket) => {
    socket.on('join-user', (userId: string) => {
      socket.join(`user:${userId}`);
    });

    socket.on('join-workspace', (workspaceId: string) => {
      socket.join(`workspace:${workspaceId}`);
    });

    socket.on('join-task', (taskId: string) => {
      socket.join(`task:${taskId}`);
    });
  });

  console.log('Socket.IO initialized for realtime development updates.');
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

export function emitToWorkspace(workspaceId: string, event: string, data: any) {
  if (io) {
    io.to(`workspace:${workspaceId}`).emit(event, data);
  }
}

export function emitToTask(taskId: string, event: string, data: any) {
  if (io) {
    io.to(`task:${taskId}`).emit(event, data);
  }
}

export function broadcastEvent(event: string, data: any) {
  if (io) {
    io.emit(event, data);
  }
}
