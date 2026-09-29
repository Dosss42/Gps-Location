import { Component } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, bookmarksOutline } from 'ionicons/icons';

/**
 * The tab bar shell. `<ion-tabs>` renders its own `<ion-router-outlet>`
 * internally (that's where `home`/`saved` actually get displayed) plus a
 * `<ion-tab-bar>` that stays fixed at the bottom while the outlet's content
 * changes underneath it — the standard bottom-navigation pattern in every
 * modern mobile app. `app.routes.ts` nests the `home`/`saved` routes as
 * children of this page's route, which is what lets Ionic know which tab
 * button should be highlighted for the current URL.
 */
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet],
})
export class TabsPage {
  constructor() {
    addIcons({ homeOutline, bookmarksOutline });
  }
}
