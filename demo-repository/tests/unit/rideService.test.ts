import { calculateFare, isPeakHour, requestRide, rides } from '../../src/rides/rideService';

// WELL TESTED: calculateFare happy path
describe('calculateFare', () => {
  it('should calculate fare for a standard trip', () => {
    const fare = calculateFare(5, false);
    expect(fare).toBeCloseTo(8.50);
  });

  it('should apply surge multiplier during peak hours', () => {
    const fare = calculateFare(5, true);
    expect(fare).toBeCloseTo(12.75);
  });

  // GAP: no test for distanceKm = 0 (throws error)
  // GAP: no test for negative distanceKm
  // GAP: no test for very large distances
});

// WELL TESTED: requestRide happy path
describe('requestRide', () => {
  beforeEach(() => {
    rides.length = 0;
  });

  it('should create a new ride with status requested', () => {
    const ride = requestRide('user-1', '123 Main St', '456 Oak Ave');
    expect(ride.status).toBe('requested');
    expect(ride.riderId).toBe('user-1');
    expect(rides).toHaveLength(1);
  });

  // GAP: no test for missing pickupAddress (throws error)
  // GAP: no test for missing dropoffAddress
});

// PARTIAL: isPeakHour only tests one case
describe('isPeakHour', () => {
  it('should return true for weekday morning rush hour', () => {
    const mon8am = new Date('2025-01-06T08:00:00');
    expect(isPeakHour(mon8am)).toBe(true);
  });
  // GAP: no test for weekends
  // GAP: no test for evening rush hour
  // GAP: no test for non-peak hours
});
