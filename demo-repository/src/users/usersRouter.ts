import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../config/middleware';
import { _usersStore } from '../auth/authRouter';

export const usersRouter = Router();

/**
 * GET /api/users/profile
 * Get current user's profile.
 */
usersRouter.get('/profile', requireAuth, (req: AuthRequest, res: Response) => {
  const user = _usersStore.find(u => u.id === req.userId);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  const { password, ...safe } = user;
  res.json(safe);
});

/**
 * PUT /api/users/profile
 * Update current user's profile.
 * NOTE: No input validation on email format — deliberate gap.
 */
usersRouter.put('/profile', requireAuth, (req: AuthRequest, res: Response) => {
  const user = _usersStore.find(u => u.id === req.userId);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const { email, username } = req.body as { email?: string; username?: string };
  if (email) user.email = email;
  if (username) user.username = username;

  const { password, ...safe } = user;
  res.json(safe);
});

/**
 * GET /api/users/:userId/ride-history
 * Get a user's ride history.
 * NOTE: Missing authorization check — deliberate gap.
 */
usersRouter.get('/:userId/ride-history', requireAuth, (req: AuthRequest, res: Response) => {
  // BUG (deliberate gap): does not verify req.userId === req.params.userId
  // Any authenticated user can fetch any user's ride history
  res.json({ userId: req.params.userId, rides: [], message: 'Ride history endpoint' });
});

/**
 * DELETE /api/users/account
 * Delete the current user's account.
 */
usersRouter.delete('/account', requireAuth, (req: AuthRequest, res: Response) => {
  const idx = _usersStore.findIndex(u => u.id === req.userId);
  if (idx === -1) { res.status(404).json({ error: 'User not found' }); return; }
  _usersStore.splice(idx, 1);
  res.status(204).send();
});
