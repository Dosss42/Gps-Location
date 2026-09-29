import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Coordinates, GeocodeResult, GeocodeStatus } from '../models/location.model';

/**
 * Turns raw coordinates into a readable address ("reverse geocoding" —
 * "forward" geocoding would be the opposite: address -> coordinates).
 *
 * Uses OpenStreetMap's Nominatim API:
 *  - Free, no API key, no billing account needed — right fit for a student
 *    project with no backend to hide a secret behind.
 *  - Usage policy: max ~1 request/second, no heavy/bulk use, and callers
 *    should self-identify (we do that with the `email` param below).
 *  - Trade-off vs. Google Maps Platform: Google's results are often more
 *    complete/accurate and supports a paid, higher-volume quota, but it
 *    requires an API key that MUST be billed and restricted, which means
 *    either a backend proxy (to avoid shipping the key in the client bundle)
 *    or tightly scoping the key to this app's origin. That's more
 *    infrastructure than this assignment needs right now — documented as
 *    the swap-in option in the plan, not built.
 *
 * What actually gets sent to Nominatim: only latitude and longitude, as
 * URL query params, over HTTPS. No device identifiers, no account info.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly _status = signal<GeocodeStatus>({ kind: 'idle' });
  readonly status = this._status.asReadonly();

  async reverseGeocode(coordinates: Coordinates): Promise<void> {
    this._status.set({ kind: 'loading' });

    try {
      const result = await this.lookup(coordinates);
      this._status.set({ kind: 'success', result });
    } catch {
      // Deliberately generic message: the coordinates are already on
      // screen from LocationService and stay there regardless of this
      // failure (spec section 10's "reverse geocoding failure" state) —
      // this service never touches LocationStatus.
      this._status.set({
        kind: 'error',
        message: 'Unable to determine address.',
      });
    }
  }

  /**
   * The stateless half of `reverseGeocode()` — does the actual lookup
   * without touching `status`. `reverseGeocode()` uses this internally
   * for the live GPS position (and updates `status` so the Home page's
   * address card reacts to it); callers with their OWN place to look up
   * that isn't "the current position" — e.g. a manually dropped map pin —
   * call this directly instead, so their one-off lookup doesn't clobber
   * whatever `status` currently represents.
   */
  async lookup(coordinates: Coordinates): Promise<GeocodeResult> {
    return this.fetchAddress(coordinates);
  }

  private async fetchAddress(coordinates: Coordinates): Promise<GeocodeResult> {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: coordinates.latitude.toString(),
      lon: coordinates.longitude.toString(),
      // `addressdetails=1` is what makes Nominatim send back the parsed
      // `address` object (suburb/village/city/state/...) instead of just
      // one long `display_name` string — without it, every field below
      // this line would silently stay undefined. `zoom=18` asks for a
      // building/street-level match, which is the level of detail needed
      // for barangay-sized areas to show up at all (a lower zoom would
      // collapse the result up to city level).
      addressdetails: '1',
      zoom: '18',
    });
    if (environment.geocoding.contactEmail) {
      params.set('email', environment.geocoding.contactEmail);
    }

    const response = await fetch(`${environment.geocoding.nominatimBaseUrl}/reverse?${params}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }

    const data = await response.json();
    if (!data?.display_name) {
      throw new Error('No address found for these coordinates.');
    }

    const address = data.address ?? {};
    return {
      displayName: data.display_name,
      // OSM contributors tag Philippine barangays inconsistently, so this
      // tries every field Nominatim is known to use for that granularity,
      // in order from most to least specific.
      locality:
        address.suburb ??
        address.quarter ??
        address.neighbourhood ??
        address.village ??
        address.city_district,
      city: address.city ?? address.town ?? address.municipality,
      region: address.state ?? address.region,
      country: address.country,
    };
  }
}
