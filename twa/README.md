# Arete TWA - Google Play Store Setup

How to get Arete on Google Play as a Trusted Web Activity (TWA).
No Android Studio needed. PWABuilder does the heavy lifting.


## Prerequisites

- Google Play Developer account ($25 one-time): https://play.google.com/console
- Your PWA passing Chrome's installability checks (Arete already does)
- The app live at https://get-arete.com with valid HTTPS


## Step 1: Generate the AAB with PWABuilder

1. Go to https://www.pwabuilder.com/
2. Enter `https://get-arete.com`
3. Wait for the audit to complete
4. Click "Package for stores" then select "Android"
5. Fill in these settings:
   - Package ID: `com.getarete.app`
   - App name: `Arete`
   - App version: `1.0.0`
   - App version code: `1`
   - Host: `get-arete.com`
   - Start URL: `/`
   - Theme color: `#0a0908`
   - Background color: `#0a0908`
   - Status bar color: `#0a0908`
   - Nav bar color: `#0a0908`
   - Display: `standalone`
   - Orientation: `portrait`
   - Icon URL: `https://get-arete.com/icon-512.png`
   - Maskable icon URL: `https://get-arete.com/icon-512.png`
   - Enable notifications: Yes
   - Signing key: "Create new" (first time) or "Use existing" (updates)
6. Click "Generate"
7. Download the ZIP. It contains:
   - The signed `.aab` file (Android App Bundle)
   - A signing key (`.jks` file). BACK THIS UP. You need it for every update.
   - An `assetlinks.json` with your actual SHA-256 fingerprint

Alternative: the `twa-manifest.json` in this folder has all settings pre-filled.
You can upload it to PWABuilder instead of entering manually.


## Step 2: Set Up Digital Asset Links

This proves you own both the website and the Android app.
Without it, Chrome shows a browser bar instead of fullscreen.

1. Open the `assetlinks.json` from the PWABuilder ZIP
2. Copy the SHA-256 fingerprint from it
3. Replace the placeholder in `../.well-known/assetlinks.json` with your real fingerprint
4. Deploy the file so it's accessible at: `https://get-arete.com/.well-known/assetlinks.json`
5. Verify it works: `curl https://get-arete.com/.well-known/assetlinks.json`
6. Also verify with Google's tool: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://get-arete.com&relation=delegate_permission/common.handle_all_urls

The file must be served with `Content-Type: application/json`.
If using Cloudflare Pages, this should work automatically from the `.well-known/` directory.


## Step 3: Upload to Google Play Console

1. Go to https://play.google.com/console
2. Click "Create app"
3. Fill in:
   - App name: Arete
   - Default language: English
   - App or game: App
   - Free or paid: Free (the app is free, AI coaching is a feature)
4. Complete the "App content" section:
   - Privacy policy URL (required). Host one at `https://get-arete.com/privacy`
   - App access: "All functionality is available without special access" (or restricted if login required)
   - Ads: Does not contain ads
   - Content rating: Complete the questionnaire
   - Target audience: 18+ (fitness/health app)
   - Data safety: Fill out based on what Arete collects (Supabase auth, diet/workout data)
5. Go to "Production" > "Create new release"
6. Upload the `.aab` file from PWABuilder
7. Add release notes (e.g., "Initial release of Arete lifestyle tracker")
8. Review and roll out

First review takes 1-7 days. Sometimes longer for new developer accounts.


## Step 4: Google Play Signing (Important)

Google Play re-signs your app with their own key. You need BOTH fingerprints in assetlinks.json.

1. After uploading, go to Play Console > Setup > App signing
2. Copy the SHA-256 fingerprint shown under "App signing key certificate"
3. Update your `assetlinks.json` to include both fingerprints:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.getarete.app",
      "sha256_cert_fingerprints": [
        "YOUR_UPLOAD_KEY_FINGERPRINT",
        "GOOGLE_PLAY_SIGNING_KEY_FINGERPRINT"
      ]
    }
  }
]
```

4. Redeploy `assetlinks.json` to your site


## Store Listing Assets You'll Need

- App icon: 512x512 PNG (you have icon-512.png)
- Feature graphic: 1024x500 PNG (banner shown at top of listing)
- Screenshots: At least 2 phone screenshots, recommended 4-8
  - Take these from Chrome DevTools mobile emulator
  - Pixel 6 size: 1080x2400
  - Show: dashboard, workout tracker, diet log, habits, AI coach
- Short description: Max 80 chars. E.g., "Track habits, workouts, and diet. AI coaching for daily excellence."
- Full description: Max 4000 chars. Cover the 5 pillars, what makes Arete different.


## Updating the App

TWAs pull content from your website. Most updates are just deploying to get-arete.com.
You only need a new Play Store release when changing:
- App version
- Android-specific settings (notifications, shortcuts)
- Play Store listing (description, screenshots)

For a new release:
1. Bump version in PWABuilder settings
2. Generate new AAB with same signing key
3. Upload to Play Console > Production > Create new release


## Testing Before Publishing

1. Install the AAB on a real device using `bundletool`:
   ```
   bundletool build-apks --bundle=arete.aab --output=arete.apks
   bundletool install-apks --apks=arete.apks
   ```
2. Or use Chrome on Android: navigate to get-arete.com, tap "Install"
3. Verify `assetlinks.json` is valid before submitting


## Files in This Directory

- `README.md` - This file
- `twa-manifest.json` - Pre-filled config for PWABuilder
- `../.well-known/assetlinks.json` - Digital Asset Links (deploy to site root)


## Costs

- Google Play Developer account: $25 one-time
- PWABuilder: Free
- Everything else: Free
