import { Injectable, signal } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { Coordinates, LocationStatus } from '../models/location.model';

/**
 * Owns everything related to "where is the device right now".
 *
 * This is the ONLY file in the app that talks to `@capacitor/geolocation`.
 * The home page never imports Capacitor directly — it asks this service,
 * and this service asks the plugin. That one-directional chain is what the
 * assignment means by "use Angular services rather than putting logic in
 * the component": if the reverse-geocoding API changes, or a plugin gets
 * swapped, only this file (or GeocodingService) needs to change.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  /**
   * Angular signal instead of an RxJS BehaviorSubject: a signal is just a
   * reactive box around a value. Reading `status()` in the template
   * automatically re-renders whenever `_status.set(...)` is called — no
   * subscribe/unsubscribe bookkeeping needed. `.asReadonly()` lets the page
   * READ the value but not call `.set()` on it directly — only this
   * service is allowed to change its own state.
   */
  private readonly _status = signal<LocationStatus>({ kind: 'idle' });
  readonly status = this._status.asReadonly();

  /**
   * Runs the full "get my location" flow: check permission, ask for it if
   * needed, then read the GPS fix. Every step updates the `status` signal
   * so the UI can show the right message at the right time (spec section 10).
   */
  async requestLocation(): Promise<void> {
    try {
      const permission = await this.ensurePermission();
      if (permission === 'denied') {
        this._status.set({ kind: 'permission-denied' });
        return;
      }

      // permission is 'granted' or 'ask-on-read' — either way it's safe to
      // try reading a position now. In the 'ask-on-read' case (web only,
      // see ensurePermission below) this is the point where the browser
      // actually shows its native permission dialog.
      this._status.set({ kind: 'locating' });
      const coordinates = await this.readCurrentPosition();
      this._status.set({ kind: 'success', coordinates });
    } catch (error) {
      if (this.isPermissionError(error)) {
        this._status.set({ kind: 'permission-denied' });
      } else {
        this._status.set({ kind: 'gps-unavailable', message: this.describeError(error) });
      }
    }
  }

  /**
   * `checkPermissions()` reads the CURRENT permission state without
   * prompting the user — Capacitor exposes it because iOS/Android both let
   * an app ask "am I already allowed?" silently. We only escalate to
   * `requestPermissions()` (which DOES show the native OS permission
   * dialog) if the answer is 'prompt' — i.e. the user has never been asked.
   * If the previous answer was 'denied', we don't re-prompt (the OS won't
   * show the dialog again anyway on most platforms) — instead we tell the
   * user to change it in Settings, which is the correct UX both platforms
   * expect.
   *
   * Platform quirk worth knowing: on the web, `requestPermissions()` isn't
   * implemented at all — Capacitor's browser build always rejects it with
   * "Not implemented on web", because browsers don't have a separate
   * "request permission" API call. Instead, the browser shows its native
   * permission popup the moment `getCurrentPosition()` actually runs. So
   * when that rejection happens, we don't treat it as a real failure — we
   * return 'ask-on-read' and let `getCurrentPosition()` trigger (and
   * resolve) the real prompt. This is one concrete answer to "why does GPS
   * behave differently in a browser vs. a real phone": on native
   * Android/iOS, permission is a distinct, explicit step this method
   * fully controls; on the web, it's implicit and bundled into the read.
   */
  private async ensurePermission(): Promise<'granted' | 'denied' | 'ask-on-read'> {
    this._status.set({ kind: 'requesting-permission' });

    const current = await Geolocation.checkPermissions();
    if (current.location === 'granted') {
      return 'granted';
    }
    if (current.location === 'denied') {
      return 'denied';
    }

    // 'prompt' or 'prompt-with-rationale' — never explicitly answered yet.
    try {
      const requested = await Geolocation.requestPermissions();
      return requested.location === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'ask-on-read';
    }
  }

  /**
   * `getCurrentPosition()` asks the OS for a single, one-shot GPS fix.
   * We deliberately do NOT use `watchPosition()`/`clearWatch()` here —
   * those start a continuous stream of position updates, meant for live
   * tracking (e.g. turn-by-turn navigation). This app has a "refresh"
   * button, not a live map, so one-shot reads are both simpler and far
   * easier on battery. `watchPosition` is the natural next step if a
   * future "live tracking" feature gets added (see spec section 19).
   */
  private async readCurrentPosition(): Promise<Coordinates> {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  }

  /**
   * The ONLY way a permission denial can surface on the web is as a
   * rejection from `getCurrentPosition()` itself (the browser's native
   * prompt was declined). That rejection is the browser's own
   * `GeolocationPositionError`, whose `code` is `1` for PERMISSION_DENIED
   * (2 = POSITION_UNAVAILABLE, 3 = TIMEOUT — both are genuine GPS
   * failures, not permission issues). Native Android/iOS errors don't
   * share that exact shape, so we also fall back to checking the message
   * text for "denied".
   */
  private isPermissionError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      if ('code' in error && (error as { code?: number }).code === 1) {
        return true;
      }
      const message = (error as { message?: string }).message;
      if (message && /denied/i.test(message)) {
        return true;
      }
    }
    return false;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Unable to determine your location. Please check that Location Services are enabled.';
  }
}
