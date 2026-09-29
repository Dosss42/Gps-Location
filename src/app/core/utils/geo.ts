/** Anything with a lat/lng — both `Coordinates` and `SavedLocation` fit this. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance between two points in meters, via the Haversine
 * formula. This is plain math (no device, no plugin, no async) — that's
 * why it's a standalone function instead of a service. Both the Home map's
 * range circles and the Saved list's "how far away is this" both need the
 * exact same calculation, so it lives here once instead of being
 * duplicated.
 */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

/** Formats a meter value the way a user should read it: meters when close, kilometers once it's far enough that meters stop being useful. */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
