import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../config/middleware';
import { requestRide, cancelRide, completeRide, getRidesByRider, rides } from './rideService';

export const ridesRouter = Router();

/**
 * POST /api/rides
 * Request a new ride.
 */
ridesRouter.post('/', requireAuth, (req: AuthRequest, res: Response) => {
  const { pickupAddress, dropoffAddress } = req.body as {
    pickupAddress?: string; dropoffAddress?: string;
  };
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const ride = requestRide(req.userId, pickupAddress ?? '', dropoffAddress ?? '');
    res.status(201).json(ride);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/rides
 * Get all rides for the current user.
 */
ridesRouter.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(getRidesByRider(req.userId));
});

/**
 * GET /api/rides/:rideId
 * Get a specific ride.
 */
ridesRouter.get('/:rideId', requireAuth, (req: AuthRequest, res: Response) => {
  const ride = rides.find(r => r.id === req.params.rideId);
  if (!ride) { res.status(404).json({ error: 'Ride not found' }); return; }
  // Missing auth check: should verify ride belongs to req.userId or user is admin
  res.json(ride);
});

/**
 * POST /api/rides/:rideId/cancel
 * Cancel a ride.
 */
ridesRouter.post('/:rideId/cancel', requireAuth, (req: AuthRequest, res: Response) => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const ride = cancelRide(req.params.rideId, req.userId, req.body.reason);
    res.json(ride);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/rides/:rideId/complete
 * Complete a ride (driver action).
 */
ridesRouter.post('/:rideId/complete', requireAuth, (req: AuthRequest, res: Response) => {
  const { distanceKm } = req.body as { distanceKm?: number };
  try {
    const ride = completeRide(req.params.rideId, distanceKm ?? 0);
    res.json(ride);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
