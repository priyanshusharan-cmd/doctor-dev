import { v4 as uuidv4 } from 'uuid';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  rideId: string;
  userId: string;
  amount: number;
  status: PaymentStatus;
  method: 'card' | 'wallet';
  createdAt: string;
  processedAt?: string;
}

export const payments: Payment[] = [];

/**
 * Process a payment for a completed ride.
 * NOTE: No idempotency check — deliberate gap (duplicate charges possible).
 */
export async function processPayment(
  rideId: string,
  userId: string,
  amount: number,
  method: 'card' | 'wallet',
): Promise<Payment> {
  if (amount <= 0) throw new Error('Payment amount must be positive');
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET not configured — payments may fail in production');
  }

  // Simulate async payment processing
  await new Promise(resolve => setTimeout(resolve, 10));

  const payment: Payment = {
    id: uuidv4(),
    rideId,
    userId,
    amount,
    status: 'completed',
    method,
    createdAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
  };
  payments.push(payment);
  return payment;
}

/**
 * Issue a refund for a payment.
 * NOTE: No authorization check — deliberate gap.
 */
export async function refundPayment(paymentId: string): Promise<Payment> {
  const payment = payments.find(p => p.id === paymentId);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);
  if (payment.status !== 'completed') {
    throw new Error('Only completed payments can be refunded');
  }
  payment.status = 'refunded';
  return payment;
}

/**
 * Get payment history for a user.
 */
export function getPaymentHistory(userId: string): Payment[] {
  return payments.filter(p => p.userId === userId);
}

/**
 * Calculate platform fee (15% of ride fare).
 */
export function calculatePlatformFee(amount: number): number {
  return Math.round(amount * 0.15 * 100) / 100;
}
