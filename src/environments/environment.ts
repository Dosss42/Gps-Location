// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  geocoding: {
    // Nominatim is free and needs no API key. Its usage policy asks
    // callers to self-identify (since browser `fetch` can't set a custom
    // User-Agent header); we do that with this `email` query param instead.
    // Not a secret — safe to keep in source control.
    nominatimBaseUrl: 'https://nominatim.openstreetmap.org',
    // Optional: put a contact email here per Nominatim's usage policy
    // (https://operations.osmfoundation.org/policies/nominatim/) if you plan
    // on heavier request volume. Leave blank for normal student-project use.
    contactEmail: '',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
