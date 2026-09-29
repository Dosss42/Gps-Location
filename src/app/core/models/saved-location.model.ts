/**
 * A place the user has explicitly chosen to remember — as opposed to
 * `Coordinates`, which is just the device's live GPS fix at this instant.
 * `rangeMeters` is the proximity radius: how close counts as "here" for
 * this specific place.
 */
export interface SavedLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  rangeMeters: number;
  createdAt: number;
}

/**
 * Every saved location uses this same fixed radius — 30m: small enough to
 * mean "this specific place" rather than "somewhere nearby". Note this is
 * tighter than typical consumer GPS accuracy (often tens to low hundreds
 * of meters, worse indoors/urban), so on a noisy fix "In range" may read
 * "Out of range" even standing on the spot — a deliberate trade-off for
 * precision over tolerance. Fixed rather than user-chosen so it doesn't
 * need its own picker UI.
 */
export const DEFAULT_RANGE_METERS = 30;
