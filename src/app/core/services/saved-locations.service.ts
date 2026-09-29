import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Coordinates } from '../models/location.model';
import { SavedLocation } from '../models/saved-location.model';

const STORAGE_KEY = 'gps-location.saved-locations';

/**
 * Owns the user's saved/pinned places. Same one-way pattern as
 * `LocationService`: this is the only file that imports
 * `@capacitor/preferences`, and everything else (Home page, Saved page)
 * only ever talks to this service.
 *
 * `@capacitor/preferences` is Capacitor's own key-value storage plugin —
 * on Android it's backed by `SharedPreferences`, on iOS by `UserDefaults`,
 * and on the web by `localStorage`. Same "one API, different native
 * implementation per platform" shape as Geolocation and Text-to-Speech.
 * It's a good fit here because this is small, structured data with no
 * need for a query language — a single JSON blob under one key is enough.
 */
@Injectable({ providedIn: 'root' })
export class SavedLocationsService {
  private readonly _locations = signal<SavedLocation[]>([]);
  readonly locations = this._locations.asReadonly();

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (value) {
        this._locations.set(JSON.parse(value) as SavedLocation[]);
      }
    } catch {
      // Corrupt/old data, or storage genuinely unavailable in this
      // environment (e.g. a test runner with no `localStorage`) — either
      // way, this constructor-time load is fire-and-forget, so a failure
      // here must not become an unhandled rejection. Starting from an
      // empty list is the safe fallback in both cases.
      this._locations.set([]);
    }
  }

  async add(label: string, coordinates: Coordinates, rangeMeters: number): Promise<void> {
    const entry: SavedLocation = {
      id: this.generateId(),
      label,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      rangeMeters,
      createdAt: Date.now(),
    };
    this._locations.update((list) => [...list, entry]);
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this._locations.update((list) => list.filter((entry) => entry.id !== id));
    await this.persist();
  }

  private async persist(): Promise<void> {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(this._locations()) });
  }

  /**
   * `crypto.randomUUID()` looks like the obvious choice here, but the Web
   * Crypto API restricts it to "secure contexts" (HTTPS, or `localhost`
   * specifically). Testing via `ionic serve` from a desktop browser on
   * `localhost` satisfies that, but a real phone opening the SAME dev
   * server over the computer's plain-`http://` LAN address does not —
   * there, `crypto.randomUUID` is simply undefined, `add()` throws before
   * it ever reaches `_locations.update()`, and the save silently
   * disappears (the sheet still closes, since that happens in the caller
   * regardless). This ID only needs to be unique within one device's own
   * saved list, not globally/cryptographically unique, so a plain
   * timestamp + random suffix is a fully adequate — and secure-context
   * independent — substitute. A real Capacitor build (native or a proper
   * HTTPS host) still gets the stronger `crypto.randomUUID()`.
   */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
