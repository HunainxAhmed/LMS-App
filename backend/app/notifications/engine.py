import json
import hashlib
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.user import UniversityAccount, UserNotificationPreference, DevicePushToken
from app.models.academic import Course, Assignment, AttendanceRecord, AttendanceSnapshot, LectureMaterial
from app.models.notification import NotificationEvent, NotificationDelivery
from app.notifications.expo_pusher import send_expo_push_notification

logger = logging.getLogger(__name__)
KARACHI_TZ = ZoneInfo("Asia/Karachi")

def compute_event_hash(account_id: str, category: str, entity_key: str) -> str:
    raw = f"{account_id}::{category}::{entity_key}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def is_in_quiet_hours(pref: Optional[UserNotificationPreference]) -> bool:
    if not pref or not pref.quiet_hours_enabled:
        return False

    now_karachi = datetime.now(KARACHI_TZ)
    current_hour = now_karachi.hour

    start = pref.quiet_start_hour
    end = pref.quiet_end_hour

    if start > end:  # e.g. 23 (11 PM) to 7 (7 AM)
        return current_hour >= start or current_hour < end
    else:
        return start <= current_hour < end

class NotificationEngine:
    def __init__(self, db: Session, account: UniversityAccount):
        self.db = db
        self.account = account
        self.user = account.user
        self.pref = self.user.notification_preferences if self.user else None

    async def emit_notification(
        self,
        category: str,
        title: str,
        body: str,
        entity_key: str,
        deep_link: str = "/(tabs)/assignments",
        data_payload: Optional[Dict[str, Any]] = None,
    ) -> Optional[NotificationEvent]:
        """
        Creates a persistent notification event if not already emitted (deduplication).
        Dispatches remote push to all active user device tokens if preferences allow.
        """
        event_hash = compute_event_hash(self.account.id, category, entity_key)

        # Check if already generated
        existing = self.db.query(NotificationEvent).filter(
            NotificationEvent.account_id == self.account.id,
            NotificationEvent.event_hash == event_hash
        ).first()

        if existing:
            # Already notified, strictly prevent duplicate
            return None

        event = NotificationEvent(
            account_id=self.account.id,
            category=category,
            title=title,
            body=body,
            deep_link=deep_link,
            data_json=json.dumps(data_payload or {}),
            event_hash=event_hash,
            is_read=False,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(event)
        self.db.flush()

        # Check if quiet hours apply
        in_quiet = is_in_quiet_hours(self.pref)

        # Send push if not in quiet hours
        if not in_quiet and self.user and self.user.push_tokens:
            active_tokens = [t.push_token for t in self.user.push_tokens if t.is_active]
            if active_tokens:
                tickets = await send_expo_push_notification(
                    push_tokens=active_tokens,
                    title=title,
                    body=body,
                    data={"deep_link": deep_link, "event_id": event.id, **(data_payload or {})},
                    channel_id="academic_alerts",
                )

                for token in active_tokens:
                    deliv = NotificationDelivery(
                        event_id=event.id,
                        push_token=token,
                        status="SENT",
                        attempt_count=1,
                        provider_response=json.dumps(tickets),
                        sent_at=datetime.now(timezone.utc),
                    )
                    self.db.add(deliv)

        return event

    async def check_new_assignments(self, scraped_assignments: List[Dict[str, Any]]):
        """Emits notifications for newly uploaded assignments."""
        if self.pref and not self.pref.assignments_enabled:
            return

        for a in scraped_assignments:
            fp = a["fingerprint"]
            # Check if this assignment existed in DB before
            existing_db = self.db.query(Assignment).filter(
                Assignment.account_id == self.account.id,
                Assignment.fingerprint == fp
            ).first()

            if not existing_db:
                # Newly uploaded assignment!
                due_str = a.get("deadline_raw") or "No deadline specified"
                title = f"NEW ASSIGNMENT: {a['course_name']}"
                body = f"{a['title']} has been uploaded.\nDue: {due_str}"
                await self.emit_notification(
                    category="ASSIGNMENT_NEW",
                    title=title,
                    body=body,
                    entity_key=f"new::{fp}",
                    deep_link="/(tabs)/assignments",
                    data_payload={"course": a["course_name"], "title": a["title"]}
                )

    async def check_assignment_deadline_extensions(self, scraped_assignments: List[Dict[str, Any]]):
        """Emits notifications when an assignment deadline has been extended on Bahria LMS."""
        if self.pref and not self.pref.assignments_enabled:
            return

        for a in scraped_assignments:
            if not a.get("is_extended"):
                continue

            fp = a["fingerprint"]
            existing_db = self.db.query(Assignment).filter(
                Assignment.account_id == self.account.id,
                Assignment.fingerprint == fp
            ).first()

            ext_due = a.get("extended_deadline_raw") or "Extended date"
            orig_due = a.get("original_deadline_raw") or "Original deadline"
            ext_type = a.get("extension_type", "")
            policy_str = "for missing submissions only" if ext_type == "missing_only" else "for all students"

            is_new_extension = False
            if existing_db:
                if not existing_db.is_extended or existing_db.extended_deadline_raw != ext_due:
                    is_new_extension = True
            else:
                is_new_extension = True

            if is_new_extension:
                title = f"⏰ DEADLINE EXTENDED: {a['course_name']}"
                body = f"{a['title']} deadline extended to {ext_due} ({policy_str}). Original was: {orig_due}."
                await self.emit_notification(
                    category="ASSIGNMENT_DEADLINE_EXTENDED",
                    title=title,
                    body=body,
                    entity_key=f"ext::{fp}::{ext_due}",
                    deep_link="/(tabs)/assignments",
                    data_payload={
                        "course": a["course_name"],
                        "title": a["title"],
                        "new_deadline": ext_due,
                        "original_deadline": orig_due,
                        "extension_type": ext_type,
                    }
                )

    async def check_assignment_deadlines(self):
        """
        Emits 48h, 24h, and 3h reminder alerts for pending upcoming assignments.
        Suppresses reminder if student submitted or marked personal completion.
        """
        if self.pref and not self.pref.assignments_enabled:
            return

        now_utc = datetime.now(timezone.utc)
        assignments = self.db.query(Assignment).filter(
            Assignment.account_id == self.account.id,
            Assignment.is_passed == False,
            Assignment.personal_completed == False,
            Assignment.submission_status != "SUBMITTED",
            Assignment.deadline != None
        ).all()

        for assign in assignments:
            if not assign.deadline:
                continue

            deadline_utc = assign.deadline
            if deadline_utc.tzinfo is None:
                deadline_utc = deadline_utc.replace(tzinfo=timezone.utc)

            time_left = deadline_utc - now_utc
            hours_left = time_left.total_seconds() / 3600.0

            if hours_left <= 0:
                continue

            # 48-Hour Reminder (Between 24h and 48h)
            if self.pref.reminder_48h and hours_left <= 48.0 and not assign.notified_48h:
                title = f"DEADLINE IN 48 HOURS: {assign.course_name}"
                body = f"{assign.title} is due in less than 2 days ({assign.deadline_raw})."
                notif = await self.emit_notification(
                    category="ASSIGNMENT_48H",
                    title=title,
                    body=body,
                    entity_key=f"48h::{assign.fingerprint}",
                    deep_link="/(tabs)/assignments",
                )
                if notif:
                    assign.notified_48h = True

            # 24-Hour Reminder (Between 3h and 24h)
            if self.pref.reminder_24h and hours_left <= 24.0 and not assign.notified_24h:
                title = f"DUE TOMORROW: {assign.course_name}"
                body = f"{assign.title} is due within 24 hours ({assign.deadline_raw}). Don't forget to submit!"
                notif = await self.emit_notification(
                    category="ASSIGNMENT_24H",
                    title=title,
                    body=body,
                    entity_key=f"24h::{assign.fingerprint}",
                    deep_link="/(tabs)/assignments",
                )
                if notif:
                    assign.notified_24h = True

            # 3-Hour Final Reminder (Between 0h and 3h)
            if self.pref.reminder_3h and hours_left <= 3.0 and not assign.notified_3h:
                title = f"URGENT: DUE IN 3 HOURS: {assign.course_name}"
                body = f"{assign.title} deadline is approaching today ({assign.deadline_raw})!"
                notif = await self.emit_notification(
                    category="ASSIGNMENT_3H",
                    title=title,
                    body=body,
                    entity_key=f"3h::{assign.fingerprint}",
                    deep_link="/(tabs)/assignments",
                )
                if notif:
                    assign.notified_3h = True

        self.db.flush()

    async def check_attendance_changes(self, new_records: List[Dict[str, Any]]):
        """
        Compares newly scraped attendance against previous snapshots to detect:
        1. Newly recorded absence (absent_hours increased).
        2. Attendance percentage dropped below threshold.
        3. Attendance corrections / updates.
        """
        if self.pref and not self.pref.attendance_enabled:
            return

        threshold = self.pref.min_attendance_threshold if self.pref else 75.0

        for r in new_records:
            code = r["code"]
            # Look up previous latest snapshot for this course
            prev_snapshot = self.db.query(AttendanceSnapshot).filter(
                AttendanceSnapshot.account_id == self.account.id,
                AttendanceSnapshot.course_code == code
            ).order_by(AttendanceSnapshot.recorded_at.desc()).first()

            if prev_snapshot:
                # 1. Did absent hours increase? (Student was marked absent)
                if r["absent_hours"] > prev_snapshot.absent_hours:
                    diff_absent = r["absent_hours"] - prev_snapshot.absent_hours
                    title = f"ATTENDANCE UPDATED: Marked Absent"
                    body = (
                        f"You were marked absent in {r['title']}.\n"
                        f"Attendance is now {r['percentage']}% ({r['present_hours']}/{r['total_hours']} hrs)."
                    )
                    await self.emit_notification(
                        category="ATTENDANCE_ABSENT",
                        title=title,
                        body=body,
                        entity_key=f"absent::{code}::{r['absent_hours']}",
                        deep_link="/(tabs)/more",
                        data_payload={"course_code": code, "percentage": r["percentage"]}
                    )

                # 2. Did attendance drop below threshold?
                if r["percentage"] < threshold and prev_snapshot.percentage >= threshold:
                    title = f"ATTENDANCE WARNING: {r['title']}"
                    body = (
                        f"Your attendance has dropped below {threshold}% to {r['percentage']}%.\n"
                        f"You have 0 safe classes left to miss."
                    )
                    await self.emit_notification(
                        category="ATTENDANCE_WARNING",
                        title=title,
                        body=body,
                        entity_key=f"warning::{code}::{r['percentage']}",
                        deep_link="/(tabs)/more",
                        data_payload={"course_code": code, "percentage": r["percentage"]}
                    )

                # 3. Was attendance corrected / present increased?
                elif r["present_hours"] > prev_snapshot.present_hours and r["absent_hours"] == prev_snapshot.absent_hours:
                    # Normal class attendance recorded as present
                    pass

    async def check_new_materials(self, scraped_materials: List[Dict[str, Any]]):
        """Emits notification when a new lecture or study resource is uploaded."""
        if self.pref and not self.pref.materials_enabled:
            return

        for m in scraped_materials:
            fp = m["fingerprint"]
            existing = self.db.query(LectureMaterial).filter(
                LectureMaterial.account_id == self.account.id,
                LectureMaterial.fingerprint == fp
            ).first()

            if not existing:
                title = f"NEW STUDY MATERIAL: {m['course_name']}"
                body = f"{m['title']} has been uploaded ({m['file_name']})."
                await self.emit_notification(
                    category="MATERIAL_NEW",
                    title=title,
                    body=body,
                    entity_key=f"mat::{fp}",
                    deep_link="/(tabs)/downloads",
                    data_payload={"course": m["course_name"], "file": m["file_name"]}
                )
