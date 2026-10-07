import type { Request, Response } from 'express';

/** Respond to readiness checks without starting any background requests. */
export function healthHandler(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'doctor-dev',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}

/** Identify the backend when running locally without a frontend build. */
export function backendInfoHandler(_req: Request, res: Response): void {
  res.json({ status: 'ok', message: 'Doctor Dev backend is running' });
}
