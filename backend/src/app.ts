import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { sequelize } from './config/database.js';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';

export const app = express();

app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "https://google-meet-frontend-rosy.vercel.app",
  "https://google-meet-frontend-6e77q4w4w.vercel.app"
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use('/api/auth', authRouter);

const healthHandler = (_request: express.Request, response: express.Response) => {
  response.json({ status: 'ok', service: 'google-meet-clone-api' });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

const databaseHealthHandler = async (_request: express.Request, response: express.Response) => {
  try {
    await sequelize.authenticate();
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'error', database: 'unavailable' });
  }
};

app.get('/health/db', databaseHealthHandler);
app.get('/api/health/db', databaseHealthHandler);

app.use((_request, response) => {
  response.status(404).json({ message: 'Route not found' });
});
