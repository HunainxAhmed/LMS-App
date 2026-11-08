# CampusFlow — System Architecture & Design

**CampusFlow — Your University, Organized** is an unofficial student productivity companion engineered specifically for Bahria University students. It bridges the gap between the university's Campus Management System (CMS) and Learning Management System (LMS), offering an offline-first dashboard, attendance risk calculations, deadline reminders, and bulk course material downloading.

---

## 1. High-Level Architectural Diagram

```
+--------------------------------------------------------------------------+
|                       CAMPUSFLOW MOBILE APP (EXPO)                       |
|                                                                          |
|  +------------------+  +-------------------+  +-----------------------+  |
|  |  Home Dashboard  |  |  Courses / Attend |  |  Assignment Manager   |  |
|  +------------------+  +-------------------+  +-----------------------+  |
|  |  Download Center |  |  Settings / More  |  |  Notification Inbox   |  |
|  +------------------+  +-------------------+  +-----------------------+  |
|                                                                          |
|  State Management: TanStack Query + Zustand                              |
|  Security: Android Keystore / iOS Keychain (Expo SecureStore)             |
|  Offline Cache: Expo FileSystem + Encrypted Secure Storage               |
+------------------------------------+-------------------------------------+
                                     |
                         REST API (HTTPS / LAN)
                         Bearer JWT Authentication
                                     v
+--------------------------------------------------------------------------+
|                        CAMPUSFLOW BACKEND (FASTAPI)                      |
|                                                                          |
|  +---------------------+  +--------------------+  +-------------------+  |
|  |   API Endpoints     |  |   Security Engine  |  |  Download Manager |  |
|  |  (Auth, LMS, Sync,  |  | (AES-256-GCM,      |  |  (ZIP generation, |  |
|  |   Academic, Notif)  |  |  Bcrypt, JWT)      |  |   stream export)  |  |
|  +---------------------+  +--------------------+  +-------------------+  |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  |                  DUAL-MODE UNIVERSITY SCRAPING ENGINE              |  |
|  |  [Mode A: Async HTTPX Session Reuse]  <-- Fast Path (Sub-second)   |  |
|  |  [Mode B: Playwright Chromium]        <-- Fallback (Session Setup) |  |
|  +--------------------------------------------------------------------+  |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  |             EVENT-DRIVEN NOTIFICATION & SYNC ENGINE                |  |
|  |  - APScheduler Background Jobs (15 min interval)                   |  |
|  |  - Persistent Event Outbox with SHA-256 Hash Deduplication         |  |
|  |  - Attendance Snapshot Comparison (Absence Change Detection)       |  |
|  |  - Expo Push API Dispatcher (High-priority remote alerts)          |  |
|  +--------------------------------------------------------------------+  |
|                                                                          |
|  Database Layer: SQLAlchemy 2.0 (SQLite for local dev / PostgreSQL)     |
+------------------------------------+-------------------------------------+
                                     |
                       HTTPS Requests & Cookies
                                     v
+--------------------------------------------------------------------------+
|                       BAHRIA UNIVERSITY PORTALS                          |
|                                                                          |
|   +------------------------------------+-------------------------------+ |
|   |         Bahria CMS Portal          |       Bahria LMS Portal       | |
|   |   (cms.bahria.edu.pk/Logins/...)   |     (lms.bahria.edu.pk/...)   | |
|   |   - ASP.NET Session / Forms Auth   |   - PHP Session & Dropdowns   | |
|   |   - StudentWiseAttendance.aspx     |   - Assignments.php           | |
|   |   - GoToLMS.aspx (SSO Gateway)     |   - LectureNotes.php          | |
|   +------------------------------------+-------------------------------+ |
+--------------------------------------------------------------------------+
```

---

## 2. Authentication & Credential Storage Architecture

Security is paramount when handling academic credentials. CampusFlow implements two independent modes:

### A. Local-Only Mode (Zero-Server-Trust Default)
- The student's Bahria password is saved **exclusively on the physical device** using `Expo SecureStore` (backed by the hardware Android Keystore or iOS Keychain).
- The university password is **never stored in plaintext or database tables** on the backend.
- During manual synchronization, the mobile client reads the password from hardware keystore in-memory and passes it over the secure connection to execute scraping.
- When the sync job completes, all memory references to the credential are discarded.

### B. Cloud Monitoring Mode (Opt-In Background Alerts)
- Designed for students who want 24/7 background notifications when the mobile phone is off or app is closed.
- Before storing credentials on the backend:
  1. A unique cryptographically secure 96-bit (12-byte) nonce is generated via `os.urandom(12)`.
  2. The university password is encrypted using **AES-256-GCM** authenticated cipher.
  3. The encryption master key is loaded strictly from the server environment (`ENCRYPTION_MASTER_KEY`), never hardcoded, never stored in the database.
  4. The database stores only the ciphertext, nonce, and key version.
- When cloud monitoring is disabled or the student logs out, the encrypted credential record is deleted immediately.

---

## 3. Scraping Performance & Session Reuse Strategy

1. **Initial Handshake**: On first sync, the engine posts credentials to `https://cms.bahria.edu.pk/Logins/Student/Login.aspx` with extracted ASP.NET `__VIEWSTATE` and `__EVENTVALIDATION`.
2. **Session Persistence**: Extracted session cookies (`ASP.NET_SessionId`, `.ASPXAUTH`, and `PHPSESSID` via `GoToLMS.aspx`) are AES-GCM encrypted and cached in the database.
3. **Subsequent Synchronizations**: The engine tests cached cookies with a lightweight HEAD/GET request. If valid, browser automation is completely bypassed, and academic data is scraped in under 1 second via asynchronous HTTP requests with bounded concurrency.
4. **Browser Fallback**: If CMS issues JavaScript challenges or alters session structures, headless Playwright Chromium authenticates and captures fresh session cookies.

---

## 4. Attendance Calculation Formulation

The attendance calculation precisely models allowable misses without violating minimum attendance policy:

$$ \text{Safe Misses} = \max\left(0, \left\lfloor \frac{P}{R} - T \right\rfloor\right) $$

Where:
- $P$ = Present units (conducted hours/classes attended)
- $T$ = Total conducted units (classes conducted to date)
- $R$ = Required attendance fraction (e.g., $75\% \to 0.75$, configurable in Settings)

If attendance drops below $R$, the recovery formula computes the minimum consecutive classes needed to return to safe status:

$$ \text{Classes to Recover} = \max\left(0, \left\lceil \frac{R \cdot T - P}{1 - R} \right\rceil\right) $$
