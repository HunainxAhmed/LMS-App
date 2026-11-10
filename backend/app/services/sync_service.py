import re
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models.user import UniversityAccount, EncryptedCredential, EncryptedSession
from app.models.academic import (
    Course,
    Assignment,
    AttendanceRecord,
    AttendanceSession,
    AttendanceSnapshot,
    LectureMaterial,
    Grade,
)
from app.models.sync import SyncJob
from app.core.security import decrypt_credential, encrypt_credential
from app.scrapers.engine import ScrapingEngine
from app.notifications.engine import NotificationEngine

logger = logging.getLogger(__name__)

def _resolve_course(raw_name: Optional[str], course_map: Dict[str, Course]) -> Optional[Course]:
    if not raw_name:
        return None
    name_clean = raw_name.strip()
    name_lower = name_clean.lower()
    if name_clean in course_map:
        return course_map[name_clean]
    if name_lower in course_map:
        return course_map[name_lower]
    is_lab = "lab" in name_lower
    for ck, co in course_map.items():
        if not ck:
            continue
        ck_lower = ck.lower()
        co_title_lower = co.title.lower() if co.title else ""
        co_code_lower = co.code.lower() if co.code else ""
        co_is_lab = "lab" in co_title_lower or "lab" in co_code_lower or "ail" in co_code_lower or "itl" in co_code_lower
        if is_lab != co_is_lab:
            continue
        if ck_lower in name_lower or name_lower in ck_lower:
            return co
    return None

async def run_account_sync(
    db: Session,
    account: UniversityAccount,
    trigger_type: str = "MANUAL",
    force_fresh: bool = False,
    override_password: Optional[str] = None,
) -> SyncJob:
    """
    Executes an end-to-end synchronization run for a student university account.
    Integrates scraping, data normalization, change detection, and alert emissions.
    """
    sync_job = SyncJob(
        account_id=account.id,
        trigger_type=trigger_type,
        status="RUNNING",
        current_step="Starting synchronization...",
        started_at=datetime.now(timezone.utc),
    )
    db.add(sync_job)
    db.commit()
    db.refresh(sync_job)

    try:
        # 1. Determine Password (In-Memory only)
        portal_password = override_password
        if portal_password:
            # Automatically save/update encrypted credentials so cloud monitoring can run 24/7
            try:
                enc_data = encrypt_credential(portal_password)
                if not account.encrypted_credentials:
                    cred = EncryptedCredential(
                        account_id=account.id,
                        ciphertext=enc_data["ciphertext"],
                        nonce=enc_data["nonce"],
                        key_version=enc_data["key_version"],
                    )
                    db.add(cred)
                else:
                    account.encrypted_credentials.ciphertext = enc_data["ciphertext"]
                    account.encrypted_credentials.nonce = enc_data["nonce"]
                    account.encrypted_credentials.key_version = enc_data["key_version"]
                account.cloud_monitoring_enabled = True
                db.commit()
            except Exception as e:
                logger.debug(f"Credential auto-save note: {e}")
        elif account.encrypted_credentials:
            try:
                cred = account.encrypted_credentials
                portal_password = decrypt_credential(cred.ciphertext, cred.nonce)
            except Exception as e:
                logger.debug(f"Credential decryption error: {e}")

        # 2. Cached Cookies
        cached_cookies: Dict[str, str] = {}
        if not force_fresh and account.encrypted_session:
            try:
                sess = account.encrypted_session
                cookies_json = decrypt_credential(sess.cookies_json_encrypted, sess.nonce)
                cached_cookies = json.loads(cookies_json)
            except Exception as e:
                logger.debug(f"Could not decrypt cached session: {e}")

        if not portal_password and not cached_cookies:
            raise ValueError("No portal credentials or active session available. Please log in.")

        # 3. Initialize Scraping Engine
        threshold = 75.0
        if account.user and account.user.notification_preferences:
            threshold = account.user.notification_preferences.min_attendance_threshold

        engine = ScrapingEngine(
            enrollment=account.enrollment,
            password=portal_password,
            campus_name=account.campus_name,
            campus_id=account.campus_id,
            cookies=cached_cookies,
            attendance_threshold=threshold,
        )

        async def update_step(step_name: str):
            sync_job.current_step = step_name
            db.commit()

        # 4. Scrape Portal Data
        scraped = await engine.scrape_all(on_progress=update_step)

        # 5. Run Change Detection & Notifications BEFORE mutating DB
        notif_engine = NotificationEngine(db, account)
        await notif_engine.check_new_assignments(scraped["assignments"])
        await notif_engine.check_attendance_changes(scraped["attendance"])
        await notif_engine.check_new_materials(scraped["materials"])

        # 6. Save Student Profile details
        info = scraped.get("student_info", {})
        if info.get("full_name") and not account.full_name:
            account.full_name = info["full_name"]
        if info.get("program"):
            account.program = info["program"]
        if info.get("current_semester"):
            account.current_semester = info["current_semester"]

        # 7. Normalize & Save Courses
        course_map: Dict[str, Course] = {}
        for c in scraped["courses"]:
            c_title = (c.get("title") or c.get("name") or "").strip()
            c_code = (c.get("code") or "").strip()
            c_lms_id = c.get("value", "")

            # Look up by title first (canonical course name) or code to prevent duplicates
            db_course = db.query(Course).filter(
                Course.account_id == account.id,
                (Course.title.ilike(c_title)) | (Course.code == c_code)
            ).first()

            if not db_course:
                db_course = Course(
                    account_id=account.id,
                    code=c_code or c_title[:10],
                    title=c_title,
                    lms_course_id=c_lms_id,
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(db_course)
                db.flush()
            else:
                # Retain clean university course code (e.g. "CSC 321" rather than truncated title)
                if c_code and not re.match(r'^[A-Za-z]{2,4}\s*\d{2,4}', db_course.code) and re.match(r'^[A-Za-z]{2,4}\s*\d{2,4}', c_code):
                    db_course.code = c_code
                if c_lms_id and not re.match(r'^[A-Za-z]{2,4}\s*\d{2,4}', c_lms_id):
                    db_course.lms_course_id = c_lms_id
                db_course.updated_at = datetime.now(timezone.utc)

            course_map[db_course.title] = db_course
            course_map[db_course.code] = db_course
            course_map[db_course.title.strip().lower()] = db_course
            if db_course.code:
                course_map[db_course.code.strip().lower()] = db_course
            if db_course.lms_course_id:
                course_map[db_course.lms_course_id] = db_course

        # 8. Normalize & Save Attendance
        for att in scraped["attendance"]:
            # Find and link matching course
            matching_course = course_map.get(att["title"]) or course_map.get(att["code"])
            if not matching_course:
                matching_course = db.query(Course).filter(
                    Course.account_id == account.id,
                    (Course.code == att["code"]) | (Course.title.ilike(att["title"]))
                ).first()

            if matching_course:
                if att.get("teacher"):
                    matching_course.instructor = att["teacher"]
                if att.get("credit_hours"):
                    matching_course.credit_hours = att["credit_hours"]

            db_att = db.query(AttendanceRecord).filter(
                AttendanceRecord.account_id == account.id,
                AttendanceRecord.course_code == att["code"]
            ).first()

            if not db_att:
                db_att = AttendanceRecord(
                    account_id=account.id,
                    course_id=matching_course.id if matching_course else None,
                    course_code=att["code"],
                    course_title=att["title"],
                    instructor=att.get("teacher", ""),
                    credit_hours=att.get("credit_hours", 3.0),
                    present_hours=att["present_hours"],
                    absent_hours=att["absent_hours"],
                    total_hours=att["total_hours"],
                    total_semester_hours=att.get("total_semester_hours", 48.0),
                    percentage=att["percentage"],
                    safe_misses=att["safe_misses"],
                    fine_skips=att.get("fine_skips", 7),
                    fine_amount=att.get("fine_amount", 0),
                    risk_status=att["risk_status"],
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(db_att)
                db.flush()
            else:
                if matching_course and not db_att.course_id:
                    db_att.course_id = matching_course.id
                db_att.course_title = att["title"]
                if att.get("teacher"):
                    db_att.instructor = att["teacher"]
                if att.get("credit_hours"):
                    db_att.credit_hours = att["credit_hours"]
                db_att.present_hours = att["present_hours"]
                db_att.absent_hours = att["absent_hours"]
                db_att.total_hours = att["total_hours"]
                db_att.total_semester_hours = att.get("total_semester_hours", 48.0)
                db_att.percentage = att["percentage"]
                db_att.safe_misses = att["safe_misses"]
                db_att.fine_skips = att.get("fine_skips", 7)
                db_att.fine_amount = att.get("fine_amount", 0)
                db_att.risk_status = att["risk_status"]
                db_att.updated_at = datetime.now(timezone.utc)

            # Store attendance snapshot for historical tracking
            snapshot = AttendanceSnapshot(
                account_id=account.id,
                course_code=att["code"],
                course_title=att["title"],
                present_hours=att["present_hours"],
                absent_hours=att["absent_hours"],
                total_hours=att["total_hours"],
                percentage=att["percentage"],
                recorded_at=datetime.now(timezone.utc),
            )
            db.add(snapshot)
            db.flush()

            # Persist authentic detailed lecture sessions from CMS AttendanceSummary
            scraped_sessions = att.get("sessions") or []
            if scraped_sessions:
                db.query(AttendanceSession).filter(AttendanceSession.attendance_record_id == db_att.id).delete()
                for s in scraped_sessions:
                    sess_obj = AttendanceSession(
                        attendance_record_id=db_att.id,
                        course_code=att["code"],
                        session_date=s.get("session_date", ""),
                        day_name=s.get("day_name", ""),
                        slot_info=s.get("slot_info", ""),
                        status=s.get("status", "PRESENT"),
                        remarks=s.get("remarks", ""),
                    )
                    db.add(sess_obj)

        # 9. Check assignment deadline extensions & newly added assignments
        await notif_engine.check_assignment_deadline_extensions(scraped["assignments"])
        await notif_engine.check_new_assignments(scraped["assignments"])

        # Normalize & Save Assignments
        for assign in scraped["assignments"]:
            fp = assign["fingerprint"]
            db_assign = db.query(Assignment).filter(
                Assignment.account_id == account.id,
                Assignment.fingerprint == fp
            ).first()

            matched_course = _resolve_course(assign.get("course_name"), course_map)
            course_id = matched_course.id if matched_course else None

            if not db_assign:
                db_assign = Assignment(
                    account_id=account.id,
                    course_id=course_id,
                    course_name=assign["course_name"],
                    assignment_number=assign["assignment_number"],
                    title=assign["title"],
                    description=assign.get("description", ""),
                    deadline=assign.get("deadline"),
                    deadline_raw=assign.get("deadline_raw", ""),
                    days_left=assign.get("days_left"),
                    is_passed=assign.get("is_passed", False),
                    is_extended=assign.get("is_extended", False),
                    extended_deadline=assign.get("extended_deadline"),
                    extended_deadline_raw=assign.get("extended_deadline_raw", ""),
                    original_deadline=assign.get("original_deadline"),
                    original_deadline_raw=assign.get("original_deadline_raw", ""),
                    extension_type=assign.get("extension_type", ""),
                    can_submit=assign.get("can_submit", True),
                    can_reupload=assign.get("can_reupload", False),
                    lms_assignment_id=assign.get("lms_assignment_id", ""),
                    lms_offered_course_id=assign.get("lms_offered_course_id", ""),
                    lms_student_id=assign.get("lms_student_id", ""),
                    attachment_url=assign.get("attachment_url", ""),
                    attachment_name=assign.get("attachment_name", ""),
                    teacher_attachment_url=assign.get("teacher_attachment_url", ""),
                    teacher_attachment_name=assign.get("teacher_attachment_name", ""),
                    submission_attachment_url=assign.get("submission_attachment_url", ""),
                    submission_attachment_name=assign.get("submission_attachment_name", ""),
                    submission_status=assign.get("submission_status", "PENDING"),
                    fingerprint=fp,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(db_assign)
            else:
                if course_id:
                    db_assign.course_id = course_id
                if not db_assign.course_name and assign.get("course_name"):
                    db_assign.course_name = assign["course_name"]
                db_assign.deadline = assign.get("deadline")
                db_assign.deadline_raw = assign.get("deadline_raw", "")
                db_assign.days_left = assign.get("days_left")
                db_assign.is_passed = assign.get("is_passed", False)
                db_assign.is_extended = assign.get("is_extended", False)
                db_assign.extended_deadline = assign.get("extended_deadline")
                db_assign.extended_deadline_raw = assign.get("extended_deadline_raw", "")
                db_assign.original_deadline = assign.get("original_deadline")
                db_assign.original_deadline_raw = assign.get("original_deadline_raw", "")
                db_assign.extension_type = assign.get("extension_type", "")
                db_assign.can_submit = assign.get("can_submit", True)
                db_assign.can_reupload = assign.get("can_reupload", False)
                if assign.get("lms_assignment_id"):
                    db_assign.lms_assignment_id = assign.get("lms_assignment_id", "")
                if assign.get("lms_offered_course_id"):
                    db_assign.lms_offered_course_id = assign.get("lms_offered_course_id", "")
                if assign.get("lms_student_id"):
                    db_assign.lms_student_id = assign.get("lms_student_id", "")
                db_assign.attachment_url = assign.get("attachment_url", "")
                db_assign.attachment_name = assign.get("attachment_name", "")
                db_assign.teacher_attachment_url = assign.get("teacher_attachment_url", "")
                db_assign.teacher_attachment_name = assign.get("teacher_attachment_name", "")
                db_assign.submission_attachment_url = assign.get("submission_attachment_url", "")
                db_assign.submission_attachment_name = assign.get("submission_attachment_name", "")
                db_assign.submission_status = assign.get("submission_status", "PENDING")
                db_assign.updated_at = datetime.now(timezone.utc)

        # 10. Check deadline reminders for all pending assignments
        await notif_engine.check_assignment_deadlines()

        # 11. Normalize & Save Lecture Materials
        for mat in scraped["materials"]:
            fp = mat["fingerprint"]
            db_mat = db.query(LectureMaterial).filter(
                LectureMaterial.account_id == account.id,
                LectureMaterial.fingerprint == fp
            ).first()

            matched_course = _resolve_course(mat.get("course_name"), course_map)
            course_id = matched_course.id if matched_course else None

            if not db_mat:
                db_mat = LectureMaterial(
                    account_id=account.id,
                    course_id=course_id,
                    course_name=mat["course_name"],
                    week_number=mat.get("week_number", ""),
                    title=mat["title"],
                    description=mat.get("description", ""),
                    file_name=mat["file_name"],
                    file_url=mat["file_url"],
                    file_type=mat.get("file_type", "pdf"),
                    fingerprint=fp,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(db_mat)
            else:
                if course_id:
                    db_mat.course_id = course_id
                if not db_mat.course_name and mat.get("course_name"):
                    db_mat.course_name = mat["course_name"]

        # 11b. Normalize & Save Official Exam Results & Grades
        exam_data = scraped.get("exam_results", {})
        if exam_data and exam_data.get("semesters"):
            db.query(Grade).filter(Grade.account_id == account.id).delete()
            for sem in exam_data["semesters"]:
                sem_name = sem["semester_name"]
                for c in sem.get("courses", []):
                    grade_obj = Grade(
                        account_id=account.id,
                        course_code=c["code"],
                        course_title=c["title"],
                        grade=c["grade"],
                        grade_points=c["grade_points"],
                        credit_hours=c["credit_hours"],
                        semester=sem_name,
                    )
                    db.add(grade_obj)
            db.flush()
            logger.info(f"Saved official grades across {len(exam_data['semesters'])} semesters.")

        # 12. Save fresh encrypted session cookies
        if scraped.get("cookies"):
            cookies_json = json.dumps(scraped["cookies"])
            enc_data = encrypt_credential(cookies_json)
            if not account.encrypted_session:
                account.encrypted_session = EncryptedSession(
                    account_id=account.id,
                    cookies_json_encrypted=enc_data["ciphertext"],
                    nonce=enc_data["nonce"],
                    updated_at=datetime.now(timezone.utc),
                )
            else:
                account.encrypted_session.cookies_json_encrypted = enc_data["ciphertext"]
                account.encrypted_session.nonce = enc_data["nonce"]
                account.encrypted_session.updated_at = datetime.now(timezone.utc)

        # 13. Update Sync Status
        sync_job.status = "SUCCESS"
        sync_job.current_step = "Synchronization complete"
        sync_job.assignments_count = len(scraped["assignments"])
        sync_job.attendance_count = len(scraped["attendance"])
        sync_job.materials_count = len(scraped["materials"])
        sync_job.completed_at = datetime.now(timezone.utc)

        account.last_synced_at = datetime.now(timezone.utc)
        account.last_sync_status = "SUCCESS"
        account.last_sync_error = None

        db.commit()
        db.refresh(sync_job)
        return sync_job

    except Exception as e:
        logger.error(f"Sync failed for account {account.id}: {e}", exc_info=True)
        db.rollback()
        sync_job.status = "FAILED"
        sync_job.error_message = str(e)
        sync_job.completed_at = datetime.now(timezone.utc)
        account.last_sync_status = "FAILED"
        account.last_sync_error = str(e)
        db.commit()
        return sync_job
