import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../config/middleware';
import { processPayment, refundPayment, getPaymentHistory } from './paymentService';

export const paymentsRouter = Router();

/**
 * POST /api/payments
 * Process payment for a ride.
 */
paymentsRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { rideId, amount, method } = req.body as {
    rideId?: string; amount?: number; method?: 'card' | 'wallet';
  };
  if (!req.userId || !rideId || !amount || !method) {
    res.status(400).json({ error: 'rideId, amount, and method are required' });
    return;
  }
  try {
    const payment = await processPayment(rideId, req.userId, amount, method);
    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/payments/:paymentId/refund
 * Issue a refund.
 */
paymentsRouter.post('/:paymentId/refund', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const payment = await refundPayment(_req.params.paymentId);
    res.json(payment);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/payments/history
 * Get payment history for the current user.
 */
paymentsRouter.get('/history', requireAuth, (req: AuthRequest, res: Response) => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(getPaymentHistory(req.userId));
});
