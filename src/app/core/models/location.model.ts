/**
 * The raw numbers that come back from the device's GPS/location hardware.
 * This mirrors what Capacitor's Geolocation plugin gives us — we don't
 * invent fields the device doesn't actually provide.
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in meters. Smaller = more precise. */
  accuracy: number;
  /** When the OS captured this fix (epoch milliseconds). */
  timestamp: number;
}

/** A human-readable address produced from reverse geocoding a Coordinates value. */
export interface GeocodeResult {
  /** Full formatted address, ready to display or speak. */
  displayName: string;
  /**
   * The most local named area available — in the Philippines this is
   * usually the barangay (OSM tags barangays inconsistently as `suburb`,
   * `quarter`, `neighbourhood`, or `village` depending on how each area
   * was mapped, so this is the first one that's actually present).
   */
  locality?: string;
  city?: string;
  region?: string;
  country?: string;
}

/**
 * Every state the "get my location" flow can be in.
 * A discriminated union (the `kind` field) instead of separate booleans —
 * it makes impossible combinations (e.g. "loading" AND "denied" at once)
 * unrepresentable, and the template can switch on `kind` with full
 * type-narrowing.
 */
export type LocationStatus =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'locating' }
  | { kind: 'success'; coordinates: Coordinates }
  | { kind: 'permission-denied' }
  | { kind: 'gps-unavailable'; message: string };

/**
 * Reverse geocoding is intentionally tracked as a SEPARATE state machine
 * from LocationStatus. Coordinates can succeed while the address lookup
 * fails (no internet, API down) — the spec requires the app keep showing
 * the coordinates in that case instead of collapsing the whole screen into
 * an error.
 */
export type GeocodeStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; result: GeocodeResult }
  | { kind: 'error'; message: string };
