import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { healthHandler, backendInfoHandler } from './controllers/applicationController';
import { analysisRouter } from './routes/analysisRoutes';
import type { ApiError } from './types';

/** Create the API and serve the built frontend from the same HTTP server. */
export function createApp(frontendDirectory = path.resolve(__dirname, '../../frontend/dist')): Express {
  const app = express();
  app.use(cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  }));
  app.use(express.json());
  app.get('/api/health', healthHandler);
  app.use('/api', analysisRouter);
  // API errors must stay JSON instead of falling through to the frontend.
  app.use('/api', (_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Not found' } satisfies ApiError);
  });

  const indexPath = path.join(frontendDirectory, 'index.html');
  if (existsSync(indexPath)) {
    app.use(express.static(frontendDirectory));
    app.get('*', (req: Request, res: Response, next: NextFunction): void => {
      // Only page navigation gets the SPA fallback, never missing files.
      if (req.path.startsWith('/assets/') || req.path.split('/').some(part => part.includes('.'))
        || !req.accepts('html')) {
        next();
        return;
      }
      res.sendFile(indexPath, (error: Error | null): void => {
        if (error) next(error);
      });
    });
  } else {
    // Local development uses Vite separately and does not require a build.
    app.get('/', backendInfoHandler);
  }

  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Not found' } satisfies ApiError);
  });
  app.use((_err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(_err);
      return;
    }
    res.status(500).json({ error: 'Internal server error' } satisfies ApiError);
  });
  return app;
}
