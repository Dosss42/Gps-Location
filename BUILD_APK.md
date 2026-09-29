# How to Build an APK for GPS-Location (Android)

This guide takes the GPS-Location app (Ionic + Angular + Capacitor 8) and turns it
into an `.apk` file you can install on an Android phone.

**How it works:**

```
Angular code (src/)  --npm run build-->  www/  --npx cap sync-->  android/  --Android Studio / Gradle-->  app.apk
```

Capacitor puts your built web app inside a native Android project. Android Studio
then compiles that project into an APK.

---

## Step 0 — Install the tools (one time only)

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 22 or newer (LTS) | Needed by Angular and the Capacitor CLI |
| **Android Studio** | Latest stable | Includes the Android SDK, Gradle and a JDK. It builds the APK |
| **Android SDK Platform** | API 36 (Android 16) | Capacitor 8 compiles against this. Install it in Android Studio → *SDK Manager* |

Check Node:

```powershell
node -v
```

After you install Android Studio, open it once and let it finish the setup wizard.
The wizard downloads the SDK. Then open **More Actions → SDK Manager** and make sure
these are installed:
- **SDK Platforms** tab: *Android 16 (API 36)*
- **SDK Tools** tab: *Android SDK Build-Tools*, *Android SDK Platform-Tools*, *Android SDK Command-line Tools*

> You do **not** need to install Java separately. Android Studio comes with its own JDK
> (JDK 21), and Capacitor 8 needs JDK 21.

---

## Step 1 — (Recommended) Change the App ID *before* adding Android

Open [capacitor.config.ts](capacitor.config.ts). The app ID is still the Ionic template default:

```ts
appId: 'io.ionic.starter',
```

The App ID is your app's unique package name on Android. Change it **now**, because it
is hard to change after the `android/` folder exists. Use lowercase letters, numbers,
dots and underscores only. Example:

```ts
const config: CapacitorConfig = {
  appId: 'com.yourname.gpslocation',
  appName: 'GPS Location',
  webDir: 'www'
};
```

- `appName` is the name shown under the app icon on the phone.
- `webDir: 'www'` must stay as it is. It matches the Angular build output in `angular.json`.

---

## Step 2 — Install dependencies and the Android platform package

Run these in the project root (the folder that contains `package.json`):

```powershell
npm install
npm install @capacitor/android@8.5.2
```

> The `@capacitor/android` version must match `@capacitor/core` (currently `8.5.2`).
> If you upgrade one, upgrade the other too.

---

## Step 3 — Build the web app

```powershell
npm run build
```

This creates the production build in the `www/` folder. It uses
`environment.prod.ts` in place of `environment.ts`.

---

## Step 4 — Create the Android project (one time only)

```powershell
npx cap add android
```

This creates the `android/` folder. That folder is a full native Android Studio
project. Commit it to git: it will hold your permission settings and icons.

---

## Step 5 — Add the Android permissions (IMPORTANT)

The app uses GPS (`@capacitor/geolocation`) and text-to-speech
(`@capacitor-community/text-to-speech`). Android blocks both unless the manifest
declares them.

Open **`android/app/src/main/AndroidManifest.xml`**.

**5a.** Near the bottom, below the existing `INTERNET` permission line and above
`</manifest>`, add:

```xml
    <!-- GPS / location (used by @capacitor/geolocation) -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />

    <!-- Lets the app find the phone's text-to-speech engine on Android 11+ -->
    <queries>
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
    </queries>
```

**5b.** Make sure this line is still there. The Capacitor template adds it for you,
and the app needs it for map tiles and address lookup (Nominatim):

```xml
    <uses-permission android:name="android.permission.INTERNET" />
```

The end of the file should look roughly like this:

```xml
    ...
    </application>

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />

    <queries>
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
    </queries>
</manifest>
```

---

## Step 6 — Copy the web build into the Android project

```powershell
npx cap sync android
```

This copies `www/` into the Android project and registers all Capacitor plugins
(geolocation, preferences, haptics, text-to-speech, and others).

---

## Step 7 — Build the APK

You can do this in two ways. Choose **one**.

### Option A — With Android Studio (easiest)

```powershell
npx cap open android
```

1. Android Studio opens the `android/` project. Wait for **Gradle sync** to finish
   (watch the progress bar at the bottom). The first sync can take several minutes.
2. In the menu, click **Build → Generate App Bundles or APKs → Generate APKs**.
   (On older Android Studio versions this is **Build → Build Bundle(s) / APK(s) → Build APK(s)**.)
3. When it finishes, click **locate** in the pop-up. Your APK is here:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Option B — From the terminal

```powershell
cd android
.\gradlew.bat assembleDebug
cd ..
```

Same output: `android/app/build/outputs/apk/debug/app-debug.apk`

> If the terminal shows an error about `JAVA_HOME`, point it to Android Studio's JDK
> first (change the path if you installed Android Studio somewhere else):
> ```powershell
> $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
> ```

---

## Step 8 — Install the APK on your phone

### Way 1 — Copy the file (no cable setup needed)
1. Send `app-debug.apk` to your phone (USB cable, Google Drive, email, Telegram, and so on).
2. On the phone, tap the file.
3. Android asks you to allow **"Install unknown apps"** for that app (Files, Drive, and so on). Allow it.
4. Tap **Install**.

### Way 2 — Run directly over USB (good for testing)
1. On the phone: **Settings → About phone** → tap **Build number** 7 times to turn on Developer Options.
2. **Settings → Developer options** → turn on **USB debugging**.
3. Connect the phone with a USB cable and accept the "Allow USB debugging?" prompt.
4. Run:

```powershell
npx cap run android
```

   Pick your phone from the list. The app installs and opens.

### First launch
- When the app asks for **location permission**, allow it.
- Turn on **Location / GPS** on the phone.
- GPS works best outdoors. The first fix can take a few seconds.

---

## Step 9 — Every time you change the code

The APK does **not** update by itself. After you edit anything in `src/`, run:

```powershell
npm run build
npx cap sync android
```

Then build the APK again (Step 7) and reinstall it (Step 8).

---

## Step 10 — (Optional) Signed *release* APK

A **debug** APK is fine for your own phone or for showing the app to a teacher or
classmates. If you want to share it widely or upload it to the Google Play Store,
build a signed **release** version:

1. In Android Studio: **Build → Generate Signed App Bundle or APK…**
2. Choose **APK** (or **Android App Bundle** if the target is the Play Store) → **Next**.
3. **Key store path → Create new…**
   - Save the `.jks` file somewhere **outside** the project folder.
   - Set a password, an alias (for example `gpslocation`) and your name.
4. Click **Next**, choose the **release** build variant, then **Create**.
5. Output: `android/app/release/app-release.apk`

> ⚠️ **Keep the keystore (`.jks`) and its passwords safe and never commit them to git.**
> If you lose them, you can never publish an update to the same app again.

To raise the version number for a new release, edit `versionCode` (a whole number
that goes up by 1 each release) and `versionName` (for example `"1.1"`) in
`android/app/build.gradle`.

---

## (Optional) Custom app icon and splash screen

By default the app uses the Capacitor logo. To use your own:

1. Put a 1024×1024 `icon.png` (and optionally a 2732×2732 `splash.png`) in an
   `assets/` folder at the project root.
2. Run:

```powershell
npm install -D @capacitor/assets
npx capacitor-assets generate --android
```

3. Rebuild the APK.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| App opens to a **white/blank screen** | You skipped `npm run build` or `npx cap sync android`. Run both, then rebuild. |
| **Location never loads** / permission error | Check Step 5 (manifest permissions). On the phone, turn on GPS and allow location for the app in **Settings → Apps → GPS Location → Permissions**. |
| **Address or map tiles don't load** | The phone has no internet, or the `INTERNET` permission is missing from the manifest. |
| **Text-to-speech is silent** | Check the `<queries>` block from Step 5. Make sure a TTS engine (for example *Speech Services by Google*) is installed and enabled on the phone. |
| `SDK location not found` | Open the `android/` folder in Android Studio once so it creates `android/local.properties`, or install the SDK through the SDK Manager. |
| Gradle error about **Java / JDK version** | In Android Studio: **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** → choose the bundled **jbr-21**. |
| `npx cap add android` says the platform already exists | Skip Step 4. You only run it once. Use `npx cap sync android` from now on. |
| "App not installed" on the phone | Uninstall any older copy that was signed with a different key (debug vs. release), then install again. |

---

## Quick reference (after the first setup)

```powershell
npm run build              # 1. build the Angular app into www/
npx cap sync android       # 2. copy it into the Android project
npx cap open android       # 3. open Android Studio → Build → Generate APKs
# or: cd android; .\gradlew.bat assembleDebug; cd ..
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`
