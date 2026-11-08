# CampusFlow — Notification Engine & Delivery Guide

## 1. Overview

CampusFlow features a centralized, event-driven notification system that monitors academic changes independently of the mobile app's running state.

Unlike brittle webhook or polling scripts, CampusFlow records every academic event in a persistent database outbox with **SHA-256 event hash deduplication**. Synchronization restarts, portal outages, or app re-openings can **never** trigger duplicate alerts for the same student.

---

## 2. Event Categories & Triggers

| Category | Trigger Condition | Deep Link Destination |
| :--- | :--- | :--- |
| `ASSIGNMENT_NEW` | New assignment discovered on LMS with no prior fingerprint in DB | `/(tabs)/assignments` |
| `ASSIGNMENT_48H` | Pending unsubmitted assignment has $\le 48\text{h}$ remaining until deadline | `/(tabs)/assignments` |
| `ASSIGNMENT_24H` | Pending unsubmitted assignment has $\le 24\text{h}$ remaining until deadline | `/(tabs)/assignments` |
| `ASSIGNMENT_3H` | Pending unsubmitted assignment has $\le 3\text{h}$ remaining until deadline | `/(tabs)/assignments` |
| `ATTENDANCE_ABSENT` | `absent_hours` in snapshot exceeds previous snapshot (LMS confirms absence) | `/(tabs)/more` |
| `ATTENDANCE_WARNING` | Course attendance percentage falls below configured threshold (e.g. $< 75\%$) | `/(tabs)/courses` |
| `MATERIAL_NEW` | New lecture slide, PDF, or note uploaded to LMS | `/(tabs)/downloads` |
| `GRADE_NEW` | Newly published course grade or result detected on portal | `/(tabs)/more` |

---

## 3. Deduplication Architecture

Every notification event computes a deterministic 64-character SHA-256 hash:

```python
event_hash = sha256(f"{account_id}::{category}::{entity_key}")
```

Example Entity Keys:
- `ASSIGNMENT_NEW`: `new::<assignment_fingerprint>`
- `ASSIGNMENT_24H`: `24h::<assignment_fingerprint>`
- `ATTENDANCE_ABSENT`: `absent::<course_code>::<absent_hours_count>`
- `MATERIAL_NEW`: `mat::<material_fingerprint>`

Before emitting an event or dispatching a push notification, the engine queries the unique index `idx_notif_account_hash`. If an entry exists, the event is rejected as a duplicate.

---

## 4. Delivery Channels

### A. Expo Go Local Notifications (SDK 58 Testing)
- Android SDK 53+ in Expo Go disables remote push background tasks.
- For local testing inside Expo Go, CampusFlow utilizes **Expo Local Notifications** with scheduled triggers and foreground alert banners.
- Notification channels are automatically created with high importance:
  - `academic_alerts`: High importance, vibration, teal LED accent.
  - `default`: Standard importance for general updates.

### B. Remote Push Notifications (EAS Build / Production)
- Device tokens formatted as `ExponentPushToken[...]` or `ExpoPushToken[...]` are registered with the backend via `POST /api/v1/devices/register`.
- When an event fires, the backend delivers high-priority payloads to `https://exp.host/--/api/v2/push/send`.
- Delivery tickets and receipt audits are recorded in `notification_deliveries`.

---

## 5. EAS Development Build Guide (No Android Studio Needed)

To test genuine background remote push notifications on a physical Android device without installing Android Studio:

1. Install EAS CLI globally:
   ```bash
   npm install -g eas-cli
   ```

2. Login to your free Expo account:
   ```bash
   eas login
   ```

3. Configure EAS project ID in `mobile/app.json`:
   ```bash
   cd mobile
   eas init
   ```

4. Run the cloud build to produce an installable Android APK:
   ```bash
   eas build --profile development --platform android
   ```

5. When the cloud build finishes (typically 4-6 minutes), download the APK link directly to your phone, install it, and launch.
