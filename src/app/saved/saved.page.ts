import { Component, computed, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { trashOutline, bookmarksOutline } from 'ionicons/icons';

import { LocationService } from '../core/services/location.service';
import { SavedLocationsService } from '../core/services/saved-locations.service';
import { SavedLocation } from '../core/models/saved-location.model';
import { formatDistance, haversineDistanceMeters } from '../core/utils/geo';

@Component({
  selector: 'app-saved',
  templateUrl: 'saved.page.html',
  styleUrls: ['saved.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonIcon],
})
export class SavedPage {
  private readonly locationService = inject(LocationService);
  private readonly savedLocationsService = inject(SavedLocationsService);

  readonly savedLocations = this.savedLocationsService.locations;

  /** Mirrors `HomePage.coordinates` — the live GPS fix, or `null` if we
   * don't have one yet (e.g. the user hasn't opened the Home tab this
   * session). Reading the same `LocationService` signal here is what lets
   * distance/range update on this tab without re-fetching anything. */
  readonly currentCoordinates = computed(() => {
    const status = this.locationService.status();
    return status.kind === 'success' ? status.coordinates : null;
  });

  constructor() {
    addIcons({ trashOutline, bookmarksOutline });
  }

  distanceLabel(location: SavedLocation): string | null {
    const current = this.currentCoordinates();
    if (!current) {
      return null;
    }
    return formatDistance(haversineDistanceMeters(current, location));
  }

  isInRange(location: SavedLocation): boolean | null {
    const current = this.currentCoordinates();
    if (!current) {
      return null;
    }
    return haversineDistanceMeters(current, location) <= location.rangeMeters;
  }

  async remove(location: SavedLocation): Promise<void> {
    await this.savedLocationsService.remove(location.id);
  }
}
