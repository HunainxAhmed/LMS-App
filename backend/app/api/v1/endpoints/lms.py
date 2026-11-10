import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.session import get_db, SessionLocal
from app.api.deps import get_current_user, get_current_university_account
from app.models.user import User, UniversityAccount, EncryptedCredential
from app.schemas.auth import (
    LMSConnectRequest,
    LMSVerifyResponse,
    LMSDisconnectResponse,
)
from app.core.security import encrypt_credential
from app.services.sync_service import run_account_sync
from app.scrapers.engine import ScrapingEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lms", tags=["University Portal Connection"])

@router.post("/connect", response_model=LMSVerifyResponse)
async def connect_university_account(
    req: LMSConnectRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Verifies student credentials with Bahria University CMS and establishes connection.
    If enable_cloud_monitoring is True: encrypts and stores credentials via AES-256-GCM.
    If enable_cloud_monitoring is False (Local-Only): no credentials stored on server.
    """
    clean_enroll = req.enrollment.strip().upper()
    campus_name = req.campus_name.strip()
    campus_id = req.campus_id.strip()

    # Test authentication directly with portal
    engine = ScrapingEngine(
        enrollment=clean_enroll,
        password=req.password,
        campus_name=campus_name,
        campus_id=campus_id,
    )

    auth_ok, error_msg, student_info = await engine.authenticate()
    if not auth_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_msg or "Failed to authenticate with Bahria University. Please verify Enrollment ID and Password."
        )

    # Check if user already has a linked account
    account = current_user.university_account
    if not account:
        account = UniversityAccount(
            user_id=current_user.id,
            enrollment=clean_enroll,
            campus_id=campus_id,
            campus_name=campus_name,
            full_name=student_info.get("full_name") or "",
            program=student_info.get("program") or "",
            current_semester=student_info.get("current_semester") or "",
            cloud_monitoring_enabled=req.enable_cloud_monitoring,
            last_synced_at=datetime.now(timezone.utc),
            last_sync_status="CONNECTED",
        )
        db.add(account)
        db.flush()
    else:
        account.enrollment = clean_enroll
        account.campus_id = campus_id
        account.campus_name = campus_name
        account.cloud_monitoring_enabled = req.enable_cloud_monitoring
        if student_info.get("full_name"):
            account.full_name = student_info["full_name"]

    # Handle encrypted credentials for cloud monitoring mode
    if req.enable_cloud_monitoring:
        enc_data = encrypt_credential(req.password)
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
    else:
        # If disabled, remove any existing encrypted credentials immediately
        if account.encrypted_credentials:
            db.delete(account.encrypted_credentials)

    db.commit()
    db.refresh(account)

    # Trigger initial data fetch in background task so student enters the app immediately without waiting
    async def _bg_initial_sync(acc_id: str, pw: str):
        bg_db = SessionLocal()
        try:
            acc = bg_db.query(UniversityAccount).filter(UniversityAccount.id == acc_id).first()
            if acc:
                await run_account_sync(
                    db=bg_db,
                    account=acc,
                    trigger_type="INITIAL_CONNECT",
                    override_password=pw
                )
        except Exception as err:
            logger.warning(f"Background initial sync note: {err}")
        finally:
            bg_db.close()

    background_tasks.add_task(_bg_initial_sync, account.id, req.password)

    return LMSVerifyResponse(
        success=True,
        message="Successfully connected to Bahria University portal.",
        full_name=account.full_name,
        enrollment=account.enrollment,
        campus_name=account.campus_name,
        cloud_monitoring_enabled=account.cloud_monitoring_enabled,
    )

@router.post("/toggle-cloud-monitoring")
def toggle_cloud_monitoring(
    enabled: bool,
    password: str = "",
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Enables or disables cloud monitoring.
    When disabled: immediately deletes encrypted university credentials.
    """
    account.cloud_monitoring_enabled = enabled
    if not enabled:
        if account.encrypted_credentials:
            db.delete(account.encrypted_credentials)
        db.commit()
        return {"success": True, "cloud_monitoring_enabled": False, "message": "Cloud monitoring disabled. Stored credentials removed."}
    else:
        if not password:
            raise HTTPException(status_code=400, detail="Portal password required to enable cloud monitoring.")
        enc_data = encrypt_credential(password)
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
        db.commit()
        return {"success": True, "cloud_monitoring_enabled": True, "message": "Cloud monitoring enabled with encrypted credential storage."}

@router.post("/disconnect", response_model=LMSDisconnectResponse)
def disconnect_university_account(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Removes student university account connection, cached data, and any encrypted credentials.
    """
    db.delete(account)
    db.commit()
    return LMSDisconnectResponse(
        success=True,
        message="University account disconnected and all associated academic records removed."
    )

@router.post("/connect-demo", response_model=LMSVerifyResponse)
async def connect_demo_university_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Connects a high-fidelity Bahria University student demo account for testing,
    competitions, and evaluations.
    """
    clean_enroll = "02-134212-042"
    campus_name = "Karachi Campus"
    campus_id = "2"

    account = current_user.university_account
    if not account:
        account = UniversityAccount(
            user_id=current_user.id,
            enrollment=clean_enroll,
            campus_id=campus_id,
            campus_name=campus_name,
            full_name="Muhammad Ali (Bahria Student)",
            program="BS Computer Science",
            current_semester="Fall 2025 (Semester 6)",
            cloud_monitoring_enabled=False,
            last_synced_at=datetime.now(timezone.utc),
            last_sync_status="SUCCESS",
        )
        db.add(account)
        db.flush()
    else:
        account.enrollment = clean_enroll
        account.full_name = "Muhammad Ali (Bahria Student)"
        account.program = "BS Computer Science"
        account.campus_name = campus_name
        account.last_synced_at = datetime.now(timezone.utc)
        account.last_sync_status = "SUCCESS"

    # Seed demo academic records
    from app.models.academic import Course, AttendanceRecord, AttendanceSession, Assignment, LectureMaterial
    # Clear old records for clean demo
    db.query(Assignment).filter(Assignment.account_id == account.id).delete()
    db.query(AttendanceRecord).filter(AttendanceRecord.account_id == account.id).delete()
    db.query(LectureMaterial).filter(LectureMaterial.account_id == account.id).delete()
    db.query(Course).filter(Course.account_id == account.id).delete()

    # 1. Courses & Attendance
    demo_courses = [
        {
            "code": "CS-312",
            "title": "Database Systems",
            "instructor": "Dr. Farhan Ahmed",
            "present": 26.0,
            "absent": 4.0,
            "total": 30.0,
            "pct": 86.7,
            "safe": 4,
            "risk": "SAFE"
        },
        {
            "code": "CS-421",
            "title": "Artificial Intelligence",
            "instructor": "Engr. Sana Tariq",
            "present": 21.0,
            "absent": 7.0,
            "total": 28.0,
            "pct": 75.0,
            "safe": 0,
            "risk": "WARNING"
        },
        {
            "code": "SE-310",
            "title": "Software Engineering",
            "instructor": "Dr. Kamran Malik",
            "present": 16.0,
            "absent": 8.0,
            "total": 24.0,
            "pct": 66.7,
            "safe": 0,
            "risk": "CRITICAL"
        },
        {
            "code": "HU-107",
            "title": "Pakistan Studies & Ethics",
            "instructor": "Prof. Asad Ullah",
            "present": 28.0,
            "absent": 2.0,
            "total": 30.0,
            "pct": 93.3,
            "safe": 7,
            "risk": "SAFE"
        },
    ]

    for dc in demo_courses:
        c = Course(
            account_id=account.id,
            code=dc["code"],
            title=dc["title"],
            instructor=dc["instructor"],
            credit_hours=3.0,
            section="6A",
            semester="Fall 2025",
        )
        db.add(c)
        db.flush()

        att = AttendanceRecord(
            account_id=account.id,
            course_id=c.id,
            course_code=dc["code"],
            course_title=dc["title"],
            instructor=dc["instructor"],
            present_hours=dc["present"],
            absent_hours=dc["absent"],
            total_hours=dc["total"],
            percentage=dc["pct"],
            safe_misses=dc["safe"],
            risk_status=dc["risk"],
        )
        db.add(att)
        db.flush()

        # Seed detailed attendance sessions for this course
        from datetime import timedelta
        tot_classes = max(1, int(round(dc["total"] / 1.5)))
        abs_classes = min(tot_classes, int(round(dc["absent"] / 1.5)))
        pres_classes = max(0, tot_classes - abs_classes)

        statuses = ["PRESENT"] * pres_classes + ["ABSENT"] * abs_classes
        import random
        rng = random.Random(dc["code"])
        rng.shuffle(statuses)

        cur_d = datetime.now() - timedelta(days=tot_classes * 3)
        slot_pool = ["08:30 - 10:00 AM", "10:15 - 11:45 AM", "01:30 - 03:00 PM"]
        slot = slot_pool[abs(hash(dc["code"])) % len(slot_pool)]

        for idx, st in enumerate(statuses, 1):
            cur_d += timedelta(days=3 if cur_d.weekday() in (0, 2) else 2)
            sess = AttendanceSession(
                attendance_record_id=att.id,
                course_code=dc["code"],
                session_date=cur_d.strftime("%d %b %Y"),
                day_name=cur_d.strftime("%A"),
                slot_info=f"{slot} (Class #{idx})",
                status=st,
                remarks="Official CMS Class Record",
            )
            db.add(sess)

    # 2. Assignments (Upcoming, Due 24h, Due 48h, Missed / Overdue, and Submitted)
    now_utc = datetime.now(timezone.utc)
    demo_assigns = [
        # Due in 24 hours
        {
            "course": "Database Systems",
            "num": "Assignment 3",
            "title": "Relational Algebra & Normalization BCNF",
            "days_left": 1,
            "deadline": now_utc + timedelta(hours=22),
            "deadline_raw": (datetime.now() + timedelta(hours=22)).strftime("%d %B %Y %I:%M %p"),
            "is_passed": False,
            "status": "PENDING",
            "personal_completed": False,
        },
        # Due in 48 hours
        {
            "course": "Artificial Intelligence",
            "num": "Lab Assignment 4",
            "title": "A* Search & Heuristics Implementation in Python",
            "days_left": 2,
            "deadline": now_utc + timedelta(hours=44),
            "deadline_raw": (datetime.now() + timedelta(hours=44)).strftime("%d %B %Y %I:%M %p"),
            "is_passed": False,
            "status": "PENDING",
            "personal_completed": False,
        },
        # Upcoming in 5 days
        {
            "course": "Software Engineering",
            "num": "Project Milestone 2",
            "title": "Software Architecture Specification & UML Class Models",
            "days_left": 5,
            "deadline": now_utc + timedelta(days=5),
            "deadline_raw": (datetime.now() + timedelta(days=5)).strftime("%d %B %Y %I:%M %p"),
            "is_passed": False,
            "status": "PENDING",
            "personal_completed": False,
        },
        # MISSED / OVERDUE ASSIGNMENT 1
        {
            "course": "Database Systems",
            "num": "Assignment 1",
            "title": "ERD Conceptual Modeling & Schema Translation",
            "days_left": 0,
            "deadline": now_utc - timedelta(days=4),
            "deadline_raw": (datetime.now() - timedelta(days=4)).strftime("%d %B %Y %I:%M %p"),
            "is_passed": True,
            "status": "OVERDUE",
            "personal_completed": False,
        },
        # MISSED / OVERDUE ASSIGNMENT 2
        {
            "course": "Artificial Intelligence",
            "num": "Lab Assignment 2",
            "title": "Uninformed Search Algorithms: BFS & DFS Comparative Study",
            "days_left": 0,
            "deadline": now_utc - timedelta(days=7),
            "deadline_raw": (datetime.now() - timedelta(days=7)).strftime("%d %B %Y %I:%M %p"),
            "is_passed": True,
            "status": "OVERDUE",
            "personal_completed": False,
        },
        # COMPLETED / SUBMITTED ASSIGNMENT
        {
            "course": "Database Systems",
            "num": "Assignment 2",
            "title": "SQL Complex Joins, Aggregations & View Definitions",
            "days_left": 0,
            "deadline": now_utc - timedelta(days=12),
            "deadline_raw": (datetime.now() - timedelta(days=12)).strftime("%d %B %Y %I:%M %p"),
            "is_passed": True,
            "status": "SUBMITTED",
            "personal_completed": True,
        },
    ]

    for da in demo_assigns:
        assign = Assignment(
            account_id=account.id,
            course_name=da["course"],
            assignment_number=da["num"],
            title=da["title"],
            description="Official course assignment from Bahria LMS.",
            deadline=da["deadline"],
            deadline_raw=da["deadline_raw"],
            days_left=da["days_left"],
            is_passed=da["is_passed"],
            submission_status=da["status"],
            personal_completed=da["personal_completed"],
            fingerprint=f"demo_{da['course']}_{da['num']}",
        )
        db.add(assign)

    # 3. Materials
    demo_mats = [
        {"course": "Database Systems", "week": "Week 08", "title": "Lecture 8: Indexing B-Trees and Query Optimization", "file": "Lecture_08_Query_Opt.pdf"},
        {"course": "Database Systems", "week": "Week 06", "title": "Lecture 6: Relational Algebra and Tuple Calculus", "file": "Lecture_06_Relational_Algebra.pdf"},
        {"course": "Artificial Intelligence", "week": "Week 07", "title": "Lecture 7: Minimax Algorithm & Alpha-Beta Pruning", "file": "Lecture_07_Minimax.pdf"},
        {"course": "Artificial Intelligence", "week": "Week 05", "title": "Lecture 5: Informed Heuristic Search & A* Algorithm", "file": "Lecture_05_AStar_Search.pdf"},
        {"course": "Software Engineering", "week": "Week 06", "title": "Lecture 6: Design Patterns: Gang of Four Reference Guide", "file": "Design_Patterns_Summary.pdf"},
        {"course": "Software Engineering", "week": "Week 04", "title": "Lecture 4: Software Requirements Engineering (SRS Standards)", "file": "Lecture_04_Requirements_SRS.pdf"},
    ]

    for dm in demo_mats:
        mat = LectureMaterial(
            account_id=account.id,
            course_name=dm["course"],
            week_number=dm["week"],
            title=dm["title"],
            file_name=dm["file"],
            file_url=f"https://lms.bahria.edu.pk/Student/files/{dm['file']}",
            file_type="pdf",
            fingerprint=f"demo_mat_{dm['course']}_{dm['week']}",
        )
        db.add(mat)

    db.commit()
    db.refresh(account)

    return LMSVerifyResponse(
        success=True,
        message="Demo Bahria University account connected successfully.",
        full_name=account.full_name,
        enrollment=account.enrollment,
        campus_name=account.campus_name,
        cloud_monitoring_enabled=False,
    )
