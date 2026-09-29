import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  IonModal,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  locateOutline,
  volumeHighOutline,
  pinOutline,
  bookmarkOutline,
  closeOutline,
  checkmarkOutline,
  layersOutline,
} from 'ionicons/icons';
import * as L from 'leaflet';
import { Haptics, NotificationType } from '@capacitor/haptics';

import { LocationService } from '../core/services/location.service';
import { GeocodingService } from '../core/services/geocoding.service';
import { SpeechService } from '../core/services/speech.service';
import { SavedLocationsService } from '../core/services/saved-locations.service';
import { Coordinates, GeocodeResult } from '../core/models/location.model';
import { DEFAULT_RANGE_METERS, SavedLocation } from '../core/models/saved-location.model';
import { haversineDistanceMeters } from '../core/utils/geo';

/** A manually placed pin isn't a GPS reading, so it carries no real accuracy or capture time — see `confirmPin()`. */
const PINNED_COORDINATES_ACCURACY = 0;

/**
 * The persistent sheet's two heights, as a fraction of the page's own
 * content area (not the full viewport — see the comment on `.sheet` in
 * home.page.scss for why that distinction matters). Shared with the FAB
 * positioning logic (`fabBottomOffset`) so the FABs always clear the
 * sheet's actual current height.
 */
const SHEET_HEIGHT_COLLAPSED = 0.16;
const SHEET_HEIGHT_EXPANDED = 0.42;

/**
 * Fallback tab bar height, used only for the one frame before the real
 * one gets measured (see `observeTabBarHeight()`). A guessed CSS value
 * (56px, Ionic's default `md` tab bar height) shipped here first and was
 * a real bug: on at least one real device, the sheet vanished completely
 * — the guess didn't account for that device's actual tab bar height
 * (larger text/accessibility settings, safe-area insets, etc. all affect
 * it), so `bottom: 0` plus a wrong clearance pushed the whole sheet
 * either off-screen or behind the tab bar. Measuring the real element at
 * runtime removes the guesswork entirely.
 */
const FALLBACK_TAB_BAR_HEIGHT_PX = 56;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonSpinner, IonModal],
})
export class HomePage {
  private readonly locationService = inject(LocationService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly speechService = inject(SpeechService);
  private readonly savedLocationsService = inject(SavedLocationsService);

  readonly savedLocations = this.savedLocationsService.locations;
  /** Exposed to the template so the sheet's caption can't drift out of sync with the actual saved value. */
  readonly defaultRangeMeters = DEFAULT_RANGE_METERS;

  // Re-exposing the services' own signals directly — the page doesn't own
  // any state itself, it only reads from the services and derives display
  // values with `computed()`. `computed()` re-runs automatically whenever a
  // signal it reads (like `locationStatus`) changes, and caches the result
  // until then.
  readonly locationStatus = this.locationService.status;
  readonly geocodeStatus = this.geocodingService.status;
  readonly isSpeaking = this.speechService.isSpeaking;

  readonly coordinates = computed(() => {
    const status = this.locationStatus();
    return status.kind === 'success' ? status.coordinates : null;
  });

  readonly isLocating = computed(() => {
    const kind = this.locationStatus().kind;
    return kind === 'requesting-permission' || kind === 'locating';
  });

  readonly errorMessage = computed(() => {
    const status = this.locationStatus();
    if (status.kind === 'permission-denied') {
      return 'Location permission was denied. Please enable location permission in your device settings.';
    }
    if (status.kind === 'gps-unavailable') {
      return status.message;
    }
    return null;
  });

  readonly addressText = computed(() => {
    const status = this.geocodeStatus();
    return status.kind === 'success' ? status.result.displayName : null;
  });

  /** The barangay/suburb-level name on its own, for a dedicated "you are
   * specifically here" line — separate from the long full address. */
  readonly localityText = computed(() => {
    const status = this.geocodeStatus();
    return status.kind === 'success' ? (status.result.locality ?? null) : null;
  });

  /**
   * `viewChild()` is the signal-based replacement for `@ViewChild` — it
   * gives us a signal that holds the `<div #mapContainer>` element once
   * Angular has rendered it. Unlike the previous version of this page, the
   * map container is now ALWAYS in the template (it's the whole screen,
   * Google-Maps-style), so this resolves on first render, not on first fix.
   */
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private pinMarker: L.Marker | null = null;
  private readonly savedLayers = new Map<string, { marker: L.Marker; circle: L.Circle }>();

  // ---- Map view (street / satellite) ---------------------------------
  private streetLayer: L.TileLayer | null = null;
  private satelliteLayer: L.TileLayer | null = null;
  /** Street view shows outlines/labels but not what a building actually
   * looks like; satellite is real aerial imagery. Both are free, no API
   * key — Esri's World Imagery service is the standard no-signup choice
   * for this in the Leaflet community (same reasoning as using OSM/
   * Nominatim elsewhere in this app: a personal/student project shouldn't
   * need a billed API key just to render a map). */
  readonly isSatelliteView = signal(false);

  toggleMapView(): void {
    if (!this.streetLayer || !this.satelliteLayer || !this.map) {
      return;
    }
    const showSatellite = !this.isSatelliteView();
    this.isSatelliteView.set(showSatellite);
    if (showSatellite) {
      this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
    }
  }

  // ---- Persistent bottom sheet -------------------------------------
  /**
   * What the persistent sheet is currently showing. 'live' is the normal
   * state (your GPS position); 'pin-mode' is while positioning a manual
   * pin under the map's center crosshair; 'pinned' is once a pin has been
   * confirmed, showing that pin's details instead of the live position.
   */
  readonly sheetMode = signal<'live' | 'pin-mode' | 'pinned'>('live');

  /**
   * A plain `<div>`, not `<ion-modal>`, is what renders the persistent
   * sheet (see home.page.html) — `<ion-modal>` is built as a full-viewport
   * overlay that deliberately sits above EVERYTHING, tab bar included,
   * which is exactly right for a short, blocking dialog (the "Save This
   * Location" sheet below still uses it) but wrong for a panel that's
   * meant to stay open indefinitely while the rest of the app — including
   * tab navigation — keeps working. A real bug surfaced this: with
   * `<ion-modal>`, the tab bar became unclickable the entire time this
   * sheet was open, since the modal's own hit-testing box always spans
   * the full screen regardless of how little of it is visually filled.
   * The plain div, positioned within the same properly-bounded page area
   * as the map/FABs (confirmed by testing that THEY don't cover the tab
   * bar), doesn't have that problem — and a tap-to-expand toggle covers
   * the same "more info on demand" need a drag gesture would, without the
   * extra complexity of hand-rolled pointer-event dragging.
   */
  readonly isSheetExpanded = signal(false);

  toggleSheetExpanded(): void {
    this.isSheetExpanded.update((expanded) => !expanded);
  }

  private readonly sheetHeightFraction = computed(() =>
    this.isSheetExpanded() ? SHEET_HEIGHT_EXPANDED : SHEET_HEIGHT_COLLAPSED,
  );

  /** The sheet's current height, bound in the template via `[style.height]`. */
  readonly sheetHeight = computed(() => `${this.sheetHeightFraction() * 100}%`);

  /** The REAL, measured height of `<ion-tab-bar>` — see
   * `observeTabBarHeight()`. Both the sheet and the FABs are positioned
   * from this, not a guessed constant. */
  private readonly tabBarHeightPx = signal(FALLBACK_TAB_BAR_HEIGHT_PX);

  /** Bound in the template to the sheet's `[style.bottom]`. */
  readonly sheetBottomOffset = computed(() => `${this.tabBarHeightPx()}px`);

  /** How far above the bottom of the page the FABs should sit — the tab
   * bar's real height, plus the sheet's current height, plus a fixed
   * margin. Bound in the template via `[style.bottom]`. */
  readonly fabBottomOffset = computed(
    () => `calc(${this.tabBarHeightPx()}px + ${this.sheetHeightFraction() * 100}% + 24px)`,
  );

  /** Live map-center coordinate while in pin mode, so the sheet can show
   * "positioning at ..." feedback as the user drags the map underneath
   * the fixed crosshair. Updated on Leaflet's `moveend` (drag finished),
   * not `move` (fires every frame) — no need to recompute on every pixel
   * of a drag when only the settled position matters. */
  readonly pinCandidateLatLng = signal<L.LatLng | null>(null);

  /** The confirmed pin: its coordinates plus whatever address the one-off
   * `GeocodingService.lookup()` call resolved (or `null` if that lookup
   * failed — the pin itself is still valid without an address, same as
   * how a failed live-location geocode doesn't invalidate the GPS fix). */
  readonly pinnedLocation = signal<{ coordinates: Coordinates; address: GeocodeResult | null } | null>(
    null,
  );
  readonly isPinGeocodeLoading = signal(false);

  /** Whichever location is currently the "subject" of the sheet — the
   * live GPS fix normally, or the pin once one's confirmed. Both
   * "Tell Me Where I Am"'s saved-place matching and the save sheet read
   * through this instead of reaching for `coordinates()` directly, so
   * they automatically follow whichever one the user is looking at. */
  readonly activeCoordinates = computed(() => {
    if (this.sheetMode() === 'pinned') {
      return this.pinnedLocation()?.coordinates ?? null;
    }
    return this.coordinates();
  });

  private readonly activeLocality = computed(() => {
    if (this.sheetMode() === 'pinned') {
      return this.pinnedLocation()?.address?.locality ?? null;
    }
    return this.localityText();
  });

  // ---- Save-this-location bottom sheet -----------------------------
  readonly isSaveSheetOpen = signal(false);
  readonly saveLabel = signal('');
  readonly saveErrorMessage = signal<string | null>(null);

  constructor() {
    // Registers the specific icons this page uses. Ionicons ships thousands
    // of icons; importing/registering only the ones we render keeps the
    // bundle small instead of pulling in the entire icon set.
    addIcons({
      locateOutline,
      volumeHighOutline,
      pinOutline,
      bookmarkOutline,
      closeOutline,
      checkmarkOutline,
      layersOutline,
    });

    // `effect()` re-runs automatically whenever any signal it reads
    // changes — here that's `mapContainer()`, `coordinates()`, and
    // `savedLocations()`. This is what keeps the Leaflet map in sync with
    // the container becoming available, the GPS fix, and the saved-places
    // list, without manually wiring subscriptions for any of them.
    effect(() => {
      const container = this.mapContainer()?.nativeElement;
      if (!container) {
        return;
      }
      this.ensureMapCreated(container);

      const coordinates = this.coordinates();
      if (coordinates) {
        this.renderCurrentPosition(coordinates);
      }

      this.syncSavedPins(this.savedLocations());
    });

    this.observeTabBarHeight();
  }

  /**
   * Measures `<ion-tab-bar>` directly instead of guessing its height in
   * CSS — see `FALLBACK_TAB_BAR_HEIGHT_PX` for the bug this fixes.
   * `<ion-tab-bar>` lives in `tabs.page.html` (this page's parent shell),
   * not in this component's own template, so it can't be a normal
   * `viewChild()` here — a direct DOM query is the pragmatic way to reach
   * it. `ResizeObserver` keeps it accurate if the tab bar's own size ever
   * changes (a system font-size change, orientation change, etc.).
   */
  private observeTabBarHeight(): void {
    const tabBar = document.querySelector('ion-tab-bar');
    if (!tabBar) {
      // The parent tabs shell's template should already be in the DOM by
      // the time this child page constructs, but if this ever runs one
      // frame too early, one retry is enough — nothing about the tab
      // bar's existence is going to resolve on some longer timer.
      requestAnimationFrame(() => this.observeTabBarHeight());
      return;
    }
    const measure = () => this.tabBarHeightPx.set(tabBar.getBoundingClientRect().height);
    measure();
    new ResizeObserver(measure).observe(tabBar);
  }

  /**
   * Creates the Leaflet map + tile layer exactly once, the moment its
   * container exists — NOT gated on having a GPS fix. A map-forward layout
   * (Google Maps, Waze) treats the map as the app's home base, always
   * present, rather than something that only appears once you've tapped a
   * button. With no fix yet it opens on a neutral world view — showing
   * nothing false, just genuinely "no position yet" — and re-centers with
   * the pulsing marker the moment `renderCurrentPosition()` has real
   * coordinates to show.
   */
  private ensureMapCreated(container: HTMLDivElement): void {
    if (this.map) {
      return;
    }

    this.map = L.map(container, { attributionControl: true, zoomControl: true }).setView(
      [20, 0],
      2,
    );

    this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    // Esri's World Imagery — free aerial/satellite photography, no API
    // key or account needed, the standard no-signup choice for this in
    // the Leaflet community. Only added to the map when the user actually
    // switches to it (`toggleMapView()`); street stays the default.
    this.satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
      },
    );
    this.streetLayer.addTo(this.map);

    this.map.on('moveend', () => {
      if (this.sheetMode() === 'pin-mode' && this.map) {
        this.pinCandidateLatLng.set(this.map.getCenter());
      }
    });

    // Ionic's <ion-content> can still be finishing its own layout on the
    // exact frame this runs, so the container Leaflet just measured may
    // not have its final size yet. Re-measuring one frame later is what
    // actually fixes tiles loading for the wrong dimensions.
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  /** Moves the map to the live GPS fix and shows/updates the pulsing
   * current-position marker. Only ever called once `ensureMapCreated()`
   * has already run, so `this.map` is guaranteed non-null here. */
  private renderCurrentPosition(coordinates: Coordinates): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const position: L.LatLngTuple = [coordinates.latitude, coordinates.longitude];

    if (!this.marker) {
      map.setView(position, 17);
      // A custom pulsing dot instead of Leaflet's default pin — avoids the
      // classic "default marker icon 404s under a bundler" problem
      // entirely (Leaflet's default icon is a PNG file path that esbuild
      // doesn't know to copy), and matches this app's own accent color
      // instead of a generic red pin.
      const icon = L.divIcon({
        className: 'gps-marker',
        html: '<span class="gps-marker__pulse"></span><span class="gps-marker__dot"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      this.marker = L.marker(position, { icon }).addTo(map);
    } else {
      map.setView(position, map.getZoom());
      this.marker.setLatLng(position);
    }
    map.invalidateSize();
  }

  /**
   * Keeps the map's saved-location pins + range circles in sync with
   * `SavedLocationsService.locations()`. Diffs against `savedLayers`
   * (keyed by each location's id) instead of clearing and redrawing
   * everything on every change — cheaper, and avoids a visible flicker
   * every time a location is added or removed.
   */
  private syncSavedPins(locations: SavedLocation[]): void {
    if (!this.map) {
      return;
    }
    const map = this.map;
    const currentIds = new Set(locations.map((location) => location.id));

    for (const [id, layers] of this.savedLayers) {
      if (!currentIds.has(id)) {
        map.removeLayer(layers.marker);
        map.removeLayer(layers.circle);
        this.savedLayers.delete(id);
      }
    }

    for (const location of locations) {
      if (this.savedLayers.has(location.id)) {
        continue;
      }
      const position: L.LatLngTuple = [location.latitude, location.longitude];
      const icon = L.divIcon({
        className: 'gps-saved-marker-wrapper',
        html: '<span class="gps-saved-marker"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker(position, { icon }).bindTooltip(location.label);
      const rangeColor = this.readColorToken('--gps-warm');
      const circle = L.circle(position, {
        radius: location.rangeMeters,
        // Leaflet draws circles as raw SVG, not CSS — it can't resolve a
        // `var(--gps-warm)` string the way a stylesheet would. Reading the
        // token's already-resolved value (light/dark handled by the
        // `@media` block in variables.scss) keeps this in sync with the
        // design system instead of hardcoding the color a second time.
        color: rangeColor,
        weight: 3,
        opacity: 0.9,
        dashArray: '6, 6',
        fillColor: rangeColor,
        fillOpacity: 0.18,
      });
      marker.addTo(map);
      circle.addTo(map);
      this.savedLayers.set(location.id, { marker, circle });
    }
  }

  private readColorToken(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---- Manual pin placement -----------------------------------------

  /** The "Pin a Place" FAB. */
  enterPinMode(): void {
    if (!this.map) {
      return;
    }
    this.pinCandidateLatLng.set(this.map.getCenter());
    this.sheetMode.set('pin-mode');
    this.isSheetExpanded.set(true);
  }

  /** Cancel out of pin mode without creating/changing a pin — back to
   * whatever the sheet was showing before (a previously pinned place, or
   * the live position). */
  cancelPinMode(): void {
    this.sheetMode.set(this.pinnedLocation() ? 'pinned' : 'live');
  }

  /** Confirms whatever point is currently under the crosshair: looks up
   * its address (one lookup, not one per drag frame), drops a real
   * marker there, and switches the sheet into "pinned" mode. */
  async confirmPin(): Promise<void> {
    if (!this.map) {
      return;
    }
    const center = this.map.getCenter();
    const coordinates: Coordinates = {
      latitude: center.lat,
      longitude: center.lng,
      accuracy: PINNED_COORDINATES_ACCURACY,
      timestamp: Date.now(),
    };

    this.isPinGeocodeLoading.set(true);
    let address: GeocodeResult | null = null;
    try {
      address = await this.geocodingService.lookup(coordinates);
    } catch {
      address = null;
    }
    this.isPinGeocodeLoading.set(false);

    this.pinnedLocation.set({ coordinates, address });
    this.renderPinMarker(coordinates);
    this.sheetMode.set('pinned');
  }

  /** Clears the pin entirely and returns the sheet to the live GPS view. */
  useMyLocationInstead(): void {
    this.pinnedLocation.set(null);
    if (this.pinMarker && this.map) {
      this.map.removeLayer(this.pinMarker);
      this.pinMarker = null;
    }
    this.sheetMode.set('live');
  }

  private renderPinMarker(coordinates: Coordinates): void {
    if (!this.map) {
      return;
    }
    const position: L.LatLngTuple = [coordinates.latitude, coordinates.longitude];

    if (this.pinMarker) {
      this.pinMarker.setLatLng(position);
      return;
    }
    // A teardrop shape (rotated rounded square) instead of a plain dot —
    // visually distinct from both the current-position pulse and the
    // small round saved-location markers, so it reads unambiguously as
    // "a place you just picked," not either of the other two.
    const icon = L.divIcon({
      className: 'gps-pin-marker-wrapper',
      html: '<span class="gps-pin-marker"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
    this.pinMarker = L.marker(position, { icon }).addTo(this.map);
  }

  // ---- Save-this-location bottom sheet -----------------------------

  openSaveSheet(): void {
    this.saveLabel.set(this.activeLocality() ?? 'My Location');
    this.saveErrorMessage.set(null);
    this.isSaveSheetOpen.set(true);
  }

  closeSaveSheet(): void {
    this.isSaveSheetOpen.set(false);
  }

  onSaveLabelInput(value: string): void {
    this.saveLabel.set(value);
  }

  async confirmSave(): Promise<void> {
    const coordinates = this.activeCoordinates();
    const label = this.saveLabel().trim();
    if (!coordinates || !label) {
      return;
    }

    // Wrapped in try/catch on purpose: a save that fails partway through
    // (storage unavailable, a browser API missing, etc.) used to throw
    // silently — the sheet still closed, nothing was actually persisted,
    // and there was no sign anything had gone wrong. Now the sheet stays
    // open with a visible reason instead of pretending it worked.
    try {
      await this.savedLocationsService.add(label, coordinates, DEFAULT_RANGE_METERS);
    } catch (error) {
      this.saveErrorMessage.set(
        error instanceof Error ? error.message : 'Could not save this location. Please try again.',
      );
      return;
    }

    this.saveErrorMessage.set(null);
    this.closeSaveSheet();

    // Zooms in enough to actually show the (small, fixed) range circle
    // clearly, rather than leaving it a barely-visible speck at whatever
    // zoom the user happened to be at when they saved. `maxZoom` caps how
    // close that's allowed to get: fitting a bare 30m radius tightly
    // (with no cap) pushes past zoom 19 — an extreme close-up that loses
    // all surrounding context, which read as "the map is just zoomed
    // into this one tiny spot" rather than "here's where I saved, on the
    // map." 18 keeps the circle clearly visible while still showing the
    // streets around it.
    if (this.map) {
      // `L.circle(...).getBounds()` needs the circle to already be on a
      // map (it throws otherwise — it converts through the map's current
      // pixel projection, not plain lat/lng math). `LatLng.toBounds()` is
      // the one built for exactly this: a bounding box from a point and a
      // size in meters, with no map or layer required.
      const bounds = L.latLng(coordinates.latitude, coordinates.longitude).toBounds(
        DEFAULT_RANGE_METERS * 2,
      );
      this.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 18 });
    }

    // A quick success buzz on the device — this is a real Capacitor
    // plugin call (`@capacitor/haptics`), not a CSS animation. On a
    // browser with no vibration hardware/permission it just resolves
    // without doing anything, so this is safe to call unconditionally.
    await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  }

  /**
   * The "Get My Location" FAB. Runs permission -> GPS -> reverse geocode
   * as one flow. Each step's own service already updates its own status
   * signal, so this method just sequences the calls — the template reacts
   * to the signals, not to anything returned here.
   */
  async getMyLocation(): Promise<void> {
    await this.locationService.requestLocation();

    const status = this.locationStatus();
    if (status.kind === 'success') {
      await this.geocodingService.reverseGeocode(status.coordinates);
    }
  }

  /**
   * The "Tell Me Where I Am" button. Always about your LIVE position (not
   * a manually placed pin — "where am I" means exactly that). If we don't
   * have a location yet, it fetches one first. If the current position
   * falls within a saved place's range, it says that place's name FIRST,
   * then the exact address — e.g. "You are at Home. Your exact location
   * is Brgy. Concepcion, General Tinio, Nueva Ecija." A saved name only
   * means something to the person who chose it, so it's the headline; the
   * geocoded address is the precise, unambiguous detail underneath it.
   * With no match, it falls back to the address alone, and only falls
   * back further to raw coordinates if the address lookup failed.
   */
  async tellMeWhereIAm(): Promise<void> {
    if (this.locationStatus().kind !== 'success') {
      await this.getMyLocation();
    }

    const status = this.locationStatus();
    if (status.kind !== 'success') {
      return;
    }

    const geocode = this.geocodeStatus();
    const exactLocation =
      geocode.kind === 'success'
        ? this.spokenAddress(geocode.result)
        : `coordinates ${status.coordinates.latitude.toFixed(4)}, ${status.coordinates.longitude.toFixed(4)}`;

    const matchedSaved = this.findNearestSavedLocationInRange(status.coordinates);
    const spokenText = matchedSaved
      ? `You are at ${matchedSaved.label}. Your exact location is ${exactLocation}.`
      : `You are currently in ${exactLocation}.`;

    await this.speechService.speak(spokenText);
  }

  /**
   * Finds the closest saved location whose range the current position
   * currently falls inside (there could be more than one if ranges
   * overlap — the nearest one is the most useful thing to say). Returns
   * `null` when nothing matches, which is the common case.
   */
  private findNearestSavedLocationInRange(current: Coordinates): SavedLocation | null {
    let nearest: { location: SavedLocation; distance: number } | null = null;

    for (const location of this.savedLocations()) {
      const distance = haversineDistanceMeters(current, location);
      if (distance <= location.rangeMeters && (!nearest || distance < nearest.distance)) {
        nearest = { location, distance };
      }
    }

    return nearest?.location ?? null;
  }

  /**
   * Builds a short, natural sentence instead of reading out the entire
   * `displayName` (which includes postal codes, street numbers, etc. —
   * fine to read on screen, awkward to hear out loud). Prefers the most
   * specific pieces we actually have: barangay, city, region.
   */
  private spokenAddress(result: { locality?: string; city?: string; region?: string; displayName: string }): string {
    const parts = [result.locality, result.city, result.region].filter(
      (part): part is string => !!part,
    );
    return parts.length > 0 ? parts.join(', ') : result.displayName;
  }
}
