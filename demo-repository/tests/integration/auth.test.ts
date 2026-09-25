import request from 'supertest';
import app from '../../src/server';

// WELL TESTED: Auth registration and login
describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: 'password123', email: 'test@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('testuser');
    expect(res.body.password).toBeUndefined();
  });

  it('should reject missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'x' });
    expect(res.status).toBe(400);
  });

  // GAP: no test for duplicate registration
  // GAP: no test for short password
  // GAP: no test for invalid email format
});

describe('POST /api/auth/login', () => {
  it('should return a token for valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'loginuser', password: 'password123', email: 'login@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'loginuser', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  // GAP: no test for wrong password
  // GAP: no test for non-existent user
  // GAP: no test for missing credentials
});

// GAP: No test for change-password endpoint
// GAP: No test for GET /api/users/:userId/ride-history authorization
// GAP: No test for POST /api/rides/:rideId/cancel when ride is in_progress
// GAP: No test for POST /api/payments/:paymentId/refund authorization
