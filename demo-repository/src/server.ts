import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { authRouter } from './auth/authRouter';
import { usersRouter } from './users/usersRouter';
import { ridesRouter } from './rides/ridesRouter';
import { paymentsRouter } from './payments/paymentsRouter';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'rideshare-api', version: '1.0.0' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/rides', ridesRouter);
app.use('/api/payments', paymentsRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[rideshare-api]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Rideshare API running on port ${PORT}`);
  });
}

export default app;
