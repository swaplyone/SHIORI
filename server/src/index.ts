import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { initSocketServer } from './services/socket.service.js';
import { seedDatabase } from './db/seed.js';
import { authRouter } from './routes/auth.routes.js';
import { tasksRouter } from './routes/tasks.routes.js';
import { projectsRouter } from './routes/projects.routes.js';
import { workspacesRouter } from './routes/workspaces.routes.js';
import { connectionsRouter } from './routes/connections.routes.js';
import { friendsRouter } from './routes/friends.routes.js';
import { githubRouter } from './routes/github.routes.js';
import { activityRouter } from './routes/activity.routes.js';
import { journalRouter } from './routes/journal.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { simulatorRouter } from './routes/simulator.routes.js';
import { recoveryRouter } from './routes/recovery.routes.js';

const app = express();
const server = http.createServer(app);

// Configure Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});
initSocketServer(io);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/github', githubRouter);
app.use('/api/webhooks', githubRouter);
app.use('/api/activity', activityRouter);
app.use('/api/journal', journalRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/simulator', simulatorRouter);
app.use('/api/recovery', recoveryRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    app: 'SHIORI',
    tagline: 'Plan. Build. Verify.',
    brand: 'A SwaplyOne product',
    timestamp: new Date().toISOString()
  });
});

// Seed & Start Server
async function start() {
  try {
    await seedDatabase();
    server.listen(config.port, () => {
      console.log(`=========================================`);
      console.log(`  SHIORI API Server & WebSocket Engine  `);
      console.log(`  A SwaplyOne product                   `);
      console.log(`  Running on http://localhost:${config.port}`);
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error('Failed to start SHIORI backend:', error);
    process.exit(1);
  }
}

start();
