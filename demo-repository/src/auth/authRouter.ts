import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../config/middleware';

export const authRouter = Router();

// In-memory store for demo
const users: Array<{
  id: string; username: string; email: string;
  password: string; role: string; createdAt: string;
}> = [];

/**
 * POST /api/auth/register
 * Register a new user account.
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  const { username, password, email } = req.body as {
    username?: string; password?: string; email?: string;
  };

  if (!username || !password || !email) {
    res.status(400).json({ error: 'username, password, and email are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }
  if (users.find(u => u.username === username || u.email === email)) {
    res.status(409).json({ error: 'Username or email already registered' });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = {
    id: uuidv4(), username, email,
    password: hashed, role: 'rider', createdAt: new Date().toISOString(),
  };
  users.push(user);
  res.status(201).json({ id: user.id, username, email, role: user.role });
});

/**
 * POST /api/auth/login
 * Authenticate and receive a JWT token.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) { res.status(500).json({ error: 'Server misconfiguration' }); return; }

  const token = jwt.sign({ userId: user.id, role: user.role }, secret, { expiresIn: '24h' });
  res.json({ token, userId: user.id, role: user.role });
});

/**
 * POST /api/auth/logout
 * Invalidate the current session.
 * NOTE: In-memory demo — token blacklisting not implemented.
 */
authRouter.post('/logout', requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({ message: 'Logged out successfully' });
});

/**
 * POST /api/auth/change-password
 * Change the authenticated user's password.
 */
authRouter.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string; newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    return;
  }

  const user = users.find(u => u.id === req.userId);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return; }

  user.password = await bcrypt.hash(newPassword, 12);
  res.json({ message: 'Password changed successfully' });
});

export { users as _usersStore };
