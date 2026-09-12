import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { queryOne } from '../db/index.js';

let io: SocketIOServer | null = null;

export function initSocketServer(socketServer: SocketIOServer) {
  io = socketServer;

  // Socket.IO Middleware: Authenticate every connection via JWT
  io.use((socket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!rawToken) {
      console.warn('[SOCKET AUTH] Connection rejected: No authentication token provided.');
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(rawToken, config.jwtSecret) as any;
      if (!decoded || !decoded.id) {
        console.warn('[SOCKET AUTH] Connection rejected: Invalid token payload.');
        return next(new Error('Invalid token payload'));
      }

      socket.data.userId = decoded.id;
      socket.data.user = decoded;
      return next();
    } catch (err: any) {
      console.warn('[SOCKET AUTH] Connection rejected: Token verification failed.');
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const authUserId = socket.data.userId;
    if (!authUserId) {
      socket.disconnect(true);
      return;
    }

    // Automatically join the authenticated user's own room
    socket.join(`user:${authUserId}`);

    // Protected: Join user room (strictly restricted to own identity)
    socket.on('join-user', (targetUserId: string) => {
      if (targetUserId === authUserId) {
        socket.join(`user:${authUserId}`);
      } else {
        console.warn(`[SOCKET SECURITY] User ${authUserId} unauthorized to join user room "${targetUserId}".`);
      }
    });

    // Protected: Join workspace room (requires workspace membership)
    socket.on('join-workspace', async (workspaceId: string) => {
      if (!workspaceId) return;
      try {
        const member = await queryOne(
          'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
          [workspaceId, authUserId]
        );
        if (member) {
          socket.join(`workspace:${workspaceId}`);
        } else {
          console.warn(`[SOCKET SECURITY] User ${authUserId} unauthorized to join workspace "${workspaceId}".`);
        }
      } catch (err) {
        console.error('[SOCKET WORKSPACE JOIN ERROR]', err);
      }
    });

    // Protected: Join project room (requires project or workspace membership)
    socket.on('join-project', async (projectId: string) => {
      if (!projectId) return;
      try {
        const proj = await queryOne(`
          SELECT 1 FROM projects p
          WHERE p.id = ? AND (
            p.created_by = ? 
            OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
            OR p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)
          )
        `, [projectId, authUserId, authUserId, authUserId]);

        if (proj) {
          socket.join(`project:${projectId}`);
        } else {
          console.warn(`[SOCKET SECURITY] User ${authUserId} unauthorized to join project "${projectId}".`);
        }
      } catch (err) {
        console.error('[SOCKET PROJECT JOIN ERROR]', err);
      }
    });

    // Protected: Join task room (requires task access)
    socket.on('join-task', async (taskId: string) => {
      if (!taskId) return;
      try {
        const task = await queryOne(`
          SELECT 1 FROM tasks t
          WHERE (t.id = ? OR t.task_code = ?) AND (
            t.created_by = ?
            OR t.assignee_id = ?
            OR t.project_id IN (
              SELECT id FROM projects WHERE created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)
            )
            OR t.workspace_id IN (
              SELECT workspace_id FROM workspace_members WHERE user_id = ?
            )
          )
        `, [taskId, taskId.toUpperCase(), authUserId, authUserId, authUserId, authUserId, authUserId]);

        if (task) {
          socket.join(`task:${taskId}`);
        } else {
          console.warn(`[SOCKET SECURITY] User ${authUserId} unauthorized to join task "${taskId}".`);
        }
      } catch (err) {
        console.error('[SOCKET TASK JOIN ERROR]', err);
      }
    });
  });

  console.log('Socket.IO initialized with JWT authentication and strict room authorization.');
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

export function emitToProject(projectId: string, event: string, data: any) {
  if (io) {
    io.to(`project:${projectId}`).emit(event, data);
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
