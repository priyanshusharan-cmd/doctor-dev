import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analysisRouter } from './routes/analysisRoutes';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'doctor-dev',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', analysisRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[doctor-dev]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[doctor-dev] Backend running at http://localhost:${PORT}`);
  console.log(`[doctor-dev] Health:   GET  http://localhost:${PORT}/api/health`);
  console.log(`[doctor-dev] Analyze:  POST http://localhost:${PORT}/api/analyze`);
  console.log(`[doctor-dev] Result:   GET  http://localhost:${PORT}/api/analysis/:id`);
});

export default app;
