import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { attachSignaling } from './realtime/signaling.js';

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
  } catch (error) {
    console.warn('MySQL is not available. The API will still start, but database routes will fail.');
    if (env.nodeEnv === 'production') {
      throw error;
    }
  }

  const httpServer = createServer(app);
  attachSignaling(httpServer);
  httpServer.listen(env.port, () => {
    console.log(`API running at http://localhost:${env.port}`);
  });
}

void startServer();
