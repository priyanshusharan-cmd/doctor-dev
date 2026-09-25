import { v4 as uuidv4 } from 'uuid';

export type RideStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface Ride {
  id: string;
  riderId: string;
  driverId?: string;
  status: RideStatus;
  pickupAddress: string;
  dropoffAddress: string;
  fare?: number;
  distanceKm?: number;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

// In-memory store for demo
export const rides: Ride[] = [];

/**
 * Calculate the fare for a ride based on distance.
 * Base fare + per-km rate. Surge pricing applied during peak hours.
 */
export function calculateFare(distanceKm: number, isPeakHour: boolean): number {
  const BASE_FARE = 2.50;
  const PER_KM_RATE = 1.20;
  const SURGE_MULTIPLIER = 1.5;

  if (distanceKm <= 0) {
    throw new Error('Distance must be positive');
  }

  const base = BASE_FARE + distanceKm * PER_KM_RATE;
  return isPeakHour ? base * SURGE_MULTIPLIER : base;
}

/**
 * Determine whether the current time is a peak hour.
 * Peak: weekdays 7–9am and 5–7pm.
 */
export function isPeakHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  const day = date.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
}

/**
 * Request a new ride.
 */
export function requestRide(
  riderId: string,
  pickupAddress: string,
  dropoffAddress: string,
): Ride {
  if (!pickupAddress || !dropoffAddress) {
    throw new Error('pickupAddress and dropoffAddress are required');
  }
  const ride: Ride = {
    id: uuidv4(),
    riderId,
    status: 'requested',
    pickupAddress,
    dropoffAddress,
    requestedAt: new Date().toISOString(),
  };
  rides.push(ride);
  return ride;
}

/**
 * Cancel a ride.
 * Only the rider or an admin can cancel. Cannot cancel a completed ride.
 * NOTE: Authorization check is partially incomplete — deliberate gap.
 */
export function cancelRide(
  rideId: string,
  requestingUserId: string,
  reason?: string,
): Ride {
  const ride = rides.find(r => r.id === rideId);
  if (!ride) throw new Error(`Ride ${rideId} not found`);
  if (ride.status === 'completed') {
    throw new Error('Cannot cancel a completed ride');
  }
  // Missing check: if status === 'in_progress', cancellation fee should apply
  // Missing check: driver cannot cancel without penalty
  ride.status = 'cancelled';
  ride.cancelledAt = new Date().toISOString();
  ride.cancellationReason = reason;
  return ride;
}

/**
 * Complete a ride and calculate fare.
 */
export function completeRide(rideId: string, distanceKm: number): Ride {
  const ride = rides.find(r => r.id === rideId);
  if (!ride) throw new Error(`Ride ${rideId} not found`);
  if (ride.status !== 'in_progress') {
    throw new Error('Ride must be in_progress to complete');
  }
  ride.status = 'completed';
  ride.completedAt = new Date().toISOString();
  ride.distanceKm = distanceKm;
  ride.fare = calculateFare(distanceKm, isPeakHour());
  return ride;
}

/**
 * Get all rides for a specific rider.
 */
export function getRidesByRider(riderId: string): Ride[] {
  return rides.filter(r => r.riderId === riderId);
}
