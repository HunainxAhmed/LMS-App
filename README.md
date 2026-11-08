# CampusFlow — Your University, Organized

> **Disclaimer:** CampusFlow is an **independent, unofficial student productivity companion** developed for Bahria University students. It is **not affiliated with, endorsed by, or operated by Bahria University**. All official portals and student records remain under the authority of Bahria University.

---

## 1. Overview & Vision

Bahria University students frequently face friction having to navigate between the Campus Management System (CMS) for attendance and the Learning Management System (LMS) for lecture materials and assignment deadlines.

**CampusFlow** unifies CMS and LMS into a single, high-performance, mobile-first experience. It features:
- **Instant Dual-Portal Integration:** Connects with official Bahria CMS and LMS.
- **Intelligent Home Dashboard:** Consolidated metrics, nearest deadlines ordered by urgency, attendance risk gauges, and a chronological activity timeline.
- **Accurate Attendance Calculator:** Shows conducted vs. present hours, safe misses allowance based on the formula $\lfloor P / R - T \rfloor$, and recovery targets.
- **Assignment Manager:** Urgency indicators (Due today, 24h, 48h, upcoming, overdue, submitted), attachment downloads, and completion markers.
- **Download Center & Course ZIP Exports:** Download individual lecture slides or export entire course materials as structured ZIP archives.
- **Centralized Event-Driven Notification Engine:** Automatic change detection (new absence recorded, attendance drops, new assignments, 48h/24h/3h deadline reminders) backed by persistent SHA-256 deduplication.
- **Hardware-Level Credential Protection:** Two storage options:
  - **Local-Only Mode:** University credentials stored strictly in hardware Android Keystore / iOS Keychain via `Expo SecureStore`.
  - **Cloud Monitoring Mode (Opt-in):** Credentials encrypted with **AES-256-GCM** using unique 96-bit nonces for 24/7 background alerts.

---

## 2. Technology Stack & Architecture

### Mobile Application
- **Framework:** React Native with Expo (SDK 58)
- **Routing:** Expo Router (File-based tabs navigation)
- **Language:** TypeScript (Strict type safety, verified with `tsc --noEmit`)
- **Server State:** TanStack Query (Background revalidation & caching)
- **Client State:** Zustand (Authentication, portal connection, user preferences)
- **Security:** Expo SecureStore (Android Keystore / iOS Keychain)
- **File & Downloads:** Expo FileSystem & Expo Sharing (Opening/sharing downloaded PDFs & ZIPs)
- **Icons & UI:** Lucide React Native, Custom Design System (deep ink typography, restrained teal accent `#0f766e`, semantic status pills)

### Backend Service
- **Framework:** Python 3.11+ with FastAPI & Uvicorn
- **Scraping Engine:** Dual-mode architecture:
  - **Mode A (High-Speed):** Asynchronous `httpx` HTTP session reuse with ASP.NET form state handling
  - **Mode B (Fallback):** Headless `playwright` Chromium browser automation for complex challenges
- **HTML Parsing:** BeautifulSoup4 & lxml
- **Persistence:** SQLAlchemy 2.0 with SQLite (local development) or PostgreSQL
- **Security & Cryptography:** `cryptography` (AES-256-GCM), `bcrypt` (Passlib-independent password hashing), `python-jose` (JWT)
- **Scheduler:** APScheduler (Periodic background sync & snapshot comparison)
- **Notifications:** Expo Push API (`exponent_server_sdk` / HTTPX)

---

## 3. GitHub Research & Attribution

Before implementing the application, existing open-source Bahria University projects were audited:

1. **`TasmeerJamali/Bahria-University-Assignment-Tracker`**: Inspected parallel session concepts. Note: We discarded its plaintext `credentials.json` pattern in favor of hardware-backed SecureStore and AES-256-GCM encryption.
2. **`roomeesyncss/LMS-Assistant`**: Investigated Selenium navigation, `GoToLMS.aspx` transition, and table selectors. Replaced heavy Selenium loops with asynchronous HTTP session reuse and Playwright fallback.
3. **`Hamzakhaliq921/student-dashboard`**: Studied column layouts and date regexes. Adapted date parsing patterns for Asia/Karachi time and implemented deterministic SHA-256 fingerprinting.
4. **`evoziosk/bahria-cms-releases`**: Referenced documented feature set, offline caching patterns, and mobile design layout.

All scraping routines, database models, notification engines, and React Native components in CampusFlow were independently implemented with production safeguards.

---

## 4. Quick Start Guide (Windows Development without Android Studio)

### Step 1: Start the Backend Server

Double-click `start_backend.bat` or run in PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
python run_backend.py
```

- Server binds to `0.0.0.0:8000` (accessible from phones on local Wi-Fi).
- Swagger Interactive Documentation: `http://localhost:8000/api/v1/docs`
- Health check: `http://localhost:8000/health`

### Step 2: Start the Mobile Application (Expo Go)

Double-click `start_mobile.bat` or run in PowerShell:

```powershell
cd mobile
npm install --legacy-peer-deps
npx expo start --host lan
```

1. Open the **Expo Go** app on your physical Android phone (available on Google Play Store).
2. Ensure your phone and PC are connected to the same Wi-Fi network (`192.168.1.xxx`).
3. Scan the QR code displayed in the terminal.
4. The mobile app will bundle and load immediately on your phone!

---

## 5. EAS Development Build Guide (for Background Remote Push)

Expo Go on Android (SDK 53+) disables background remote push notification handlers. To test remote push notifications delivered from the backend to a physical device:

1. Install EAS CLI: `npm install -g eas-cli`
2. Run `cd mobile && eas login`
3. Execute cloud build:
   ```bash
   eas build --profile development --platform android
   ```
4. Download the generated APK directly to your phone and install it without Android Studio.

---

## 6. Running Automated Tests

Run the full automated test suite (security, attendance calculations, HTML parsers, notifications, and API endpoints):

```powershell
.\run_tests.bat
```

Or manually:

```powershell
backend\.venv\Scripts\pytest -c backend\pytest.ini backend\tests -v
```

All 22 unit and integration tests run in under 4 seconds with 100% pass rate.
