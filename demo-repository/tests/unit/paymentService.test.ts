import { processPayment, calculatePlatformFee, payments } from '../../src/payments/paymentService';

// WELL TESTED: processPayment happy path
describe('processPayment', () => {
  beforeEach(() => {
    payments.length = 0;
  });

  it('should process a valid card payment', async () => {
    const payment = await processPayment('ride-1', 'user-1', 15.00, 'card');
    expect(payment.status).toBe('completed');
    expect(payment.amount).toBe(15.00);
    expect(payment.method).toBe('card');
  });

  it('should process a wallet payment', async () => {
    const payment = await processPayment('ride-1', 'user-1', 10.00, 'wallet');
    expect(payment.status).toBe('completed');
  });

  // GAP: no test for amount <= 0 (should throw)
  // GAP: no test for duplicate payment on same rideId (idempotency)
  // GAP: no test for refund after payment
});

// WELL TESTED: calculatePlatformFee
describe('calculatePlatformFee', () => {
  it('should calculate 15% platform fee', () => {
    expect(calculatePlatformFee(100)).toBe(15);
    expect(calculatePlatformFee(10)).toBe(1.5);
  });
});
