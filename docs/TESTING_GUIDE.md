# CampusFlow — Automated Testing & Quality Assurance Guide

## 1. Running the Automated Test Suite

CampusFlow includes a comprehensive automated test suite covering security, attendance calculations, HTML parsers, notification deduplication, and REST API endpoints.

To run all tests from the repository root:

```powershell
.\run_tests.bat
```

Or manually using the backend virtual environment:

```powershell
backend\.venv\Scripts\pytest -c backend\pytest.ini backend\tests -v
```

---

## 2. Test Suite Breakdown

### A. Security & Encryption (`tests/test_security.py`)
- `test_aes_gcm_encryption_roundtrip`: Verifies that plaintext university credentials encrypt and decrypt back to exact strings.
- `test_aes_gcm_unique_nonce_per_encryption`: Ensures every encryption operation generates a unique 12-byte cryptographically secure nonce.
- `test_aes_gcm_tamper_detection`: Verifies that tampering with ciphertext triggers immediate rejection via AES-GCM authentication tag.
- `test_password_hashing`: Tests bcrypt salt generation and password verification.
- `test_jwt_generation_and_decoding`: Verifies JWT payload generation and expiration timestamp verification.
- `test_invalid_jwt_rejected`: Tests rejection of forged signatures.

### B. Attendance Formula Verification (`tests/test_attendance_calc.py`)
- `test_safe_misses_prompt_example`: Validates prompt formula:
  - 12 attended out of 15 conducted at 75% required: $\lfloor 12 / 0.75 - 15 \rfloor = 1$ safe miss.
- `test_safe_misses_at_exact_threshold`: 15 of 20 at 75% = 0 safe misses.
- `test_safe_misses_below_threshold_clamped_to_zero`: Prevents negative safe misses when below threshold.
- `test_safe_misses_high_attendance`: 28 of 30 at 75% = 7 safe misses.
- `test_needed_to_recover`: Computes required consecutive attendances to return to safe status:
  - $\lceil (0.75 \cdot 20 - 14) / 0.25 \rceil = 4$ classes.
- `test_risk_status_classification`: Validates `SAFE` ($\ge 75\%$), `WARNING` ($65\% - 74.9\%$), and `CRITICAL` ($< 65\%$).

### C. Scraping Parsers with Synthetic HTML Fixtures (`tests/test_scrapers.py`)
- `test_parse_cms_attendance_fixture`: Tests parsing of `StudentWiseAttendance.aspx` table with complex cell formats like `24.0 :80.00%`.
- `test_parse_lms_assignments_fixture`: Tests parsing of `Assignments.php` rows, attachments, and submission statuses.
- `test_parse_lms_materials_fixture`: Tests lecture notes and downloads discovery from `LectureNotes.php`.
- `test_deadline_regex_variations`: Tests regex date parser across Pakistani time variations (e.g. `15 November 2026 11:59 pm`, `05-Dec-2026 09:30 AM`).

### D. Notification Engine (`tests/test_notifications.py`)
- `test_event_hash_deterministic`: Verifies stable SHA-256 event hash generation.
- `test_quiet_hours_disabled` & `test_quiet_hours_range`: Verifies quiet hours suppression logic.

### E. API Endpoints (`tests/test_api.py`)
- `test_health_check_endpoint`: Verifies `/health` returns server status and Karachi time.
- `test_attendance_calculation_endpoint`: Verifies `POST /api/v1/attendance/calculate`.
- `test_user_registration_and_login_flow`: Tests complete registration, login, token issuance, and protected profile retrieval.
