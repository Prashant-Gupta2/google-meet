
import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { attachSignaling } from './realtime/signaling.js';

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    console.log('MySQL connected successfully');
  } catch (error) {
    console.error('MySQL connection failed:', error);

    if (env.nodeEnv === 'production') {
      throw error;
    }
  }

  const httpServer = createServer(app);

  // Attach real-time signaling
  attachSignaling(httpServer);

  // Render requires the server to accept external connections
  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`Server running on port ${env.port}`);
  });
}

void startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
