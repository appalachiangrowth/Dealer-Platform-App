# Dealer Platform — mobile app

Expo (React Native + TypeScript, Expo Router) app for dealers. It talks directly to the existing NestJS backend
(`Dealership-Platform/backend`) — the same API the web Dealership Portal uses. No backend changes are needed.

- **Expo SDK 58** · React Native 0.88 · TypeScript `strict`
- **API server (default):** `http://5.183.35.10:4000` — taken from `dealer-portal/.env.local` (`NEXT_PUBLIC_API_URL`)
- **Android package:** `com.dealershipplatform.dealerapp`

---

## 1. Run it in Expo Go

Requirements: Node.js 22.13+ (or 24.3+), and the **Expo Go** app on your phone.

```bash
cd Documents/dealer-platform-app
copy .env.example .env      # Windows (macOS / Linux: cp .env.example .env) — optional, see section 3
npm install
npx expo install --fix      # pins every package to the exact versions of the installed Expo SDK
npx expo-doctor@latest      # optional: checks the project setup
npx tsc --noEmit            # type check — must print nothing
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iPhone). Phone and computer must be on the same Wi-Fi;
if the QR code does not connect, use `npx expo start --tunnel`.

> Expo Go only opens projects made for the SDK it supports. If Expo Go says the project uses an unsupported SDK,
> update Expo Go from the store, or build the APK below (the APK does not need Expo Go).

Log in with the same email and password as the web Dealership Portal.

## 2. Build an installable Android `.apk`

### A. In the cloud with EAS (easiest — no Android Studio needed)

```bash
npm install -g eas-cli
eas login                                  # free Expo account
eas build:configure                        # first time only: links the project (adds extra.eas.projectId to app.json)
eas build -p android --profile preview
```

When the build finishes, EAS prints a link/QR code to download the `.apk`. Open it on the phone and install
(allow "Install unknown apps" when Android asks). The `preview` profile in `eas.json` is set to `"buildType": "apk"`.

### B. Locally on your computer

Needs Android Studio (Android SDK + platform tools) and JDK 17, with `ANDROID_HOME` and `JAVA_HOME` set.

```bash
npx expo prebuild -p android --clean       # generates the android/ folder
cd android
gradlew.bat assembleRelease                # Windows   (macOS / Linux: ./gradlew assembleRelease)
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`.
(Expo signs it with the debug keystore by default, which is fine for installing on your own phones.
For a Play Store release use `eas build -p android --profile production`.)

On macOS / Linux you can also run the EAS build on your own machine: `eas build -p android --profile preview --local`
(this does not work on Windows — use A, or the Gradle steps above).

To run a debug build straight on a connected phone / emulator: `npx expo run:android`.

## 3. API server address

| Where | What |
| --- | --- |
| `.env` → `EXPO_PUBLIC_API_URL` (copy `.env.example`) | used by `npx expo start` and local builds. Without a `.env` the app uses the live server `http://5.183.35.10:4000` |
| `eas.json` → `build.preview.env` / `build.production.env` | used by EAS cloud builds (`.env` is not uploaded) |
| In the app: **Login › Server settings**, or **Business › App info** | changes it on that phone only; empty = back to the built-in address |

The live API is plain `http://`. Android and iOS block that by default, so `app.json` switches it on
(`expo-build-properties` → `usesCleartextTraffic`, and `NSAllowsArbitraryLoads` on iOS). Once the API has an
`https://` address, change `EXPO_PUBLIC_API_URL` and remove those two settings.

---

## What the app uses from the backend

Every call sends `Authorization: Bearer <token>`. There are no cookies and no refresh token: the JWT lasts 7 days
(`JWT_EXPIRES_IN`). A `401` logs the app out and returns to Login.
The dealership is inside a dealer's token. Platform owners pick one with the `X-Tenant-Id` header on `/dealer/*` calls.

| Feature | Endpoint |
| --- | --- |
| Login | `POST /auth/login` `{ login, password, portal: 'dealer' \| 'platform', tenantId? }` → `{ token, kind, tenantId }` (`409` + `dealerships[]` when the login exists in several dealerships) |
| Session restore | `GET /auth/me` → `{ user, tenant: { id, name, logo, status, … } }` |
| Dashboard | `GET /dealer/dashboard` → `vehicles: { published, draft, sold }` |
| Inventory list / search | `GET /dealer/vehicles?status=&q=&sort=&page=&pageSize=` |
| Vehicle | `GET` / `PATCH` / `DELETE /dealer/vehicles/:id`, `POST /dealer/vehicles` |
| Status switch | `PATCH /dealer/vehicles/:id` `{ status }` |
| VIN decoder | `POST /dealer/ai/decode-vin` `{ vin }` → `{ fields, warnings, checkDigitOk }` |
| Photo upload | `POST /dealer/media` multipart, field **`files`** → `{ files: [{ url }], errors }`. Always stored as `.jpeg`. `?enhance=1` = Auto White Studio Background, `?folder=site` = logo |
| Studio background available? | `GET /dealer/media/enhancer` |
| CarGurus status / readiness | `GET /dealer/feeds/cargurus/monitor` |
| CarGurus: send for verification (dealer) | `POST /dealer/feeds/cargurus/submit-inventory` |
| CarGurus: Dry Run (Platform Admin) | `POST /platform/cargurus/:tenantId/:submissionId/dry-run`, or `POST /api/cargurus/dry-run` `{ tenantId }` |
| CarGurus: Approve & Sync (Platform Admin) | `POST /platform/cargurus/:tenantId/:submissionId/approve`, `POST /platform/cargurus/:tenantId/resend` |
| Facebook status + Pages | `GET /dealer/facebook/quick-config`, `POST /dealer/facebook/pages/load`, `POST /dealer/facebook/connect` |
| Facebook progress | `GET /dealer/facebook/state?peek=1` |
| Caption from a vehicle | `POST /dealer/facebook/mp/vehicles/:id/generate` `{ ai: false, save: false }` |
| Post to Pages | `POST /dealer/facebook/post` multipart: `profile`, `pages`, `order` (`v:<photo url>`), `caption`, `hashtags`, `vehicle` |
| Marketplace listing | `POST /dealer/facebook/mp/publish` `{ ids }` |
| Posting history | `GET /dealer/facebook/history` |
| Business details | `GET` / `PATCH /dealer/settings` (`name, phone, email, siteUrl, street, city, state, zip, hours, logo`) |

| AI search | `POST /dealer/ai/command` `{ text, auto: false }` → `{ intent, reply, search, car_ids, cars }` (the portal's "Just tell it" bar; `auto: false` = nothing is ever changed from the search box) |
| AI Quick Add | `GET /dealer/ai/status`, `POST /dealer/ai/analyze` `{ vehicle, images: [{ media_type, data }] }`, `POST /dealer/ai/analyze-video` `{ frames: [{ data }], audio }`, `POST /dealer/ai/read-closeups`, `POST /dealer/ai/write-description` — JSON with small base64 JPEGs (not multipart). The full photos go to `POST /dealer/media` |
| Design & colours | `GET /dealer/design`, `POST /dealer/design/activate` `{ themeId }`, `PUT /dealer/design/colors` `{ colors }`, `POST /dealer/design/request` `{ themeId, note }` |

### AI features

- **AI search** (Inventory, and the "Ask AI" box on Home): one word, a VIN or a stock number is a normal search while you type.
  Two or more words, or the **AI** switch, send the question to the AI when you press Search. The server returns the matching
  vehicles and one sentence — it has no structured filters (colour / price range) to show.
- **Add with AI**: photos (up to 40) and / or a walkaround video. Photos are uploaded to the server (stored as `.jpeg`) and a
  512 px copy goes to the AI. From a video the phone takes 12 – 18 still pictures; the video file itself is not uploaded, and
  the dealer's voice is not read (the web portal does that in the browser). Reading videos needs Gemini, OpenRouter or Qwen
  on the server (`AI_PROVIDER`). Year, make, model, trim, body, engine, drivetrain and fuel come from the VIN record, so the
  VIN sticker must be readable, or type the VIN. The AI does not detect Condition or Certified Pre-Owned.
- Limits set by the server: 40 photos per analysis, 12 video stills per request, an hourly AI request limit per dealership.

### Things that work differently from what you might expect

- **Status names.** The backend stores `PUBLISHED / DRAFT / SOLD` (the web portal shows "For sale / Draft / Sold").
  The app shows them as **Available / Pending / Sold**. "Pending" is a saved vehicle that is hidden from the website.
- **Certified Pre-Owned** is a yes/no column in the database (no `null`). "Select…" (blank) on a new vehicle simply
  does not send the field, so the server default (No) applies.
- **CarGurus "Run Dry Run" and "Approve & Sync Now" are Platform Admin endpoints** (`@PlatformOnly()` in
  `cargurus.controller.ts`). A dealer login gets `403` on them, so for dealers the tab shows the read-only feed status,
  the readiness warnings and **Send Inventory for Verification**. Log in with a Platform Admin account
  (Login › Server settings › *Platform Admin login* + the dealership ID) and the two buttons appear and work.
- **Facebook login happens on the server.** Each user's Facebook session runs in a browser on the VPS. The first
  login (with its live browser view) is done once in the web portal (FB Poster › Connect). After that the app posts
  with the saved login.
- The inventory list loads the newest 200 vehicles per filter; search runs on the server across the whole inventory.

## Project layout

```
app/                      screens (Expo Router)
  _layout.tsx             providers + auth gate
  login.tsx
  (tabs)/index.tsx        Home / dashboard
  (tabs)/inventory.tsx
  (tabs)/cargurus.tsx
  (tabs)/facebook.tsx
  (tabs)/settings.tsx     Business details + app info + logout
  vehicle/add.tsx         Add vehicle: with AI or manually
  vehicle/ai.tsx          Add with AI (photos / walkaround video)
  vehicle/new.tsx         Add manually
  design.tsx              Design & colours
  vehicle/[id].tsx        Vehicle details & quick actions
  vehicle/edit/[id].tsx   Edit vehicle
src/lib/                  api client, session, config, types, validation
src/components/           UI kit, VehicleForm, PhotoManager, HoursEditor
```
