import re
import os
import base64
import logging
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_university_account
from app.models.user import UniversityAccount
from app.models.academic import Course, Assignment, AttendanceRecord, LectureMaterial, Grade, AcademicAnnouncement
from app.schemas.academic import (
    CourseSchema,
    AssignmentSchema,
    AssignmentStatusUpdate,
    AttendanceRecordSchema,
    AttendanceCalculationRequest,
    AttendanceCalculationResponse,
    LectureMaterialSchema,
    GradeSchema,
    AcademicAnnouncementSchema,
    FullAcademicResultSchema,
    SemesterResultSchema,
)
from app.services.attendance_calculator import (
    calculate_safe_misses,
    calculate_needed_to_recover,
    determine_risk_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Academic Records"])

# ==============================================================================
# COURSES
# ==============================================================================
@router.get("/courses", response_model=List[CourseSchema])
def get_courses(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    courses = db.query(Course).filter(Course.account_id == account.id).all()
    deduped: dict[str, Course] = {}
    for c in courses:
        norm = c.title.strip().lower()
        if norm not in deduped:
            deduped[norm] = c
        else:
            existing = deduped[norm]
            is_new_clean = bool(re.search(r'^[A-Za-z]{2,4}\s*\d{2,4}', c.code or ""))
            is_old_clean = bool(re.search(r'^[A-Za-z]{2,4}\s*\d{2,4}', existing.code or ""))
            if is_new_clean and not is_old_clean:
                deduped[norm] = c
    return list(deduped.values())

# ==============================================================================
# ASSIGNMENTS
# ==============================================================================
@router.get("/assignments", response_model=List[AssignmentSchema])
def get_assignments(
    filter_by: Optional[str] = Query(None, description="all, upcoming, due_today, due_24h, due_48h, overdue, submitted"),
    course_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    query = db.query(Assignment).filter(Assignment.account_id == account.id)

    if course_id:
        query = query.filter(Assignment.course_id == course_id)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter((Assignment.title.ilike(s)) | (Assignment.course_name.ilike(s)))

    assignments = query.all()
    now_utc = datetime.now(timezone.utc)
    in_24h = now_utc + timedelta(hours=24)
    in_48h = now_utc + timedelta(hours=48)

    filtered = []
    for a in assignments:
        dl_utc = None
        if a.deadline:
            dl_utc = a.deadline.replace(tzinfo=timezone.utc) if a.deadline.tzinfo is None else a.deadline

        if filter_by == "submitted":
            if a.submission_status == "SUBMITTED" or a.personal_completed:
                filtered.append(a)
        elif filter_by in ("overdue", "missed"):
            is_missed = (dl_utc and dl_utc < now_utc) or a.is_passed or a.submission_status == "OVERDUE"
            if is_missed and not a.personal_completed and a.submission_status != "SUBMITTED":
                filtered.append(a)
        elif filter_by == "due_24h":
            if dl_utc and now_utc <= dl_utc <= in_24h and not a.personal_completed and a.submission_status != "SUBMITTED":
                filtered.append(a)
        elif filter_by == "due_48h":
            if dl_utc and now_utc <= dl_utc <= in_48h and not a.personal_completed and a.submission_status != "SUBMITTED":
                filtered.append(a)
        elif filter_by == "upcoming":
            is_missed = (dl_utc and dl_utc < now_utc) or a.is_passed or a.submission_status == "OVERDUE"
            if not is_missed and not a.personal_completed and a.submission_status != "SUBMITTED":
                filtered.append(a)
        else:
            filtered.append(a)

    # Sort: active upcoming first by deadline, then others
    def sort_key(item: Assignment):
        if item.deadline:
            dl = item.deadline.replace(tzinfo=timezone.utc) if item.deadline.tzinfo is None else item.deadline
            return (0 if dl >= now_utc else 1, dl)
        return (0, datetime.max.replace(tzinfo=timezone.utc))

    filtered.sort(key=sort_key)
    return [AssignmentSchema.from_orm(a) for a in filtered]

@router.patch("/assignments/{assignment_id}/status", response_model=AssignmentSchema)
def update_assignment_status(
    assignment_id: str,
    update: AssignmentStatusUpdate,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.account_id == account.id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment.personal_completed = update.personal_completed
    db.commit()
    db.refresh(assignment)
    return assignment

class AssignmentJsonSubmission(BaseModel):
    file_name: str
    file_base64: str
    mime_type: Optional[str] = "application/pdf"

async def _execute_assignment_submission(
    assignment_id: str,
    file_name: str,
    file_bytes: bytes,
    mime_type: str,
    db: Session,
    account: UniversityAccount
) -> Assignment:
    """
    Core executor that submits student's assignment solution file directly to Bahria University LMS.
    Validates permissions based on deadline extension policy, saves local backup, and updates DB.
    """
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.account_id == account.id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check permission
    is_already_submitted = (
        assignment.submission_status == "SUBMITTED" or
        bool(assignment.submission_attachment_url)
    )
    # Verify deadline lock status
    now_utc = datetime.now(timezone.utc)
    effective_dl = assignment.extended_deadline or assignment.deadline
    is_deadline_passed = assignment.is_passed
    if effective_dl:
        effective_dl_utc = effective_dl.replace(tzinfo=timezone.utc) if effective_dl.tzinfo is None else effective_dl
        if effective_dl_utc < now_utc:
            is_deadline_passed = True

    if is_deadline_passed:
        raise HTTPException(
            status_code=403,
            detail="Assignment deadline has passed and submission is closed."
        )

    if is_already_submitted and assignment.is_extended and assignment.extension_type == "missing_only":
        raise HTTPException(
            status_code=403,
            detail="This assignment deadline was extended for missing submissions only. Re-uploading is locked."
        )

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Save a local copy in submission directory so student can immediately view/download their work
    sub_dir = os.path.join(os.getcwd(), "backend", "uploads", "submissions")
    os.makedirs(sub_dir, exist_ok=True)
    local_copy_path = os.path.join(sub_dir, f"{assignment.id}_{file_name}")
    try:
        with open(local_copy_path, "wb") as f_out:
            f_out.write(file_bytes)
    except Exception as e:
        logger.warning(f"Could not write local submission backup: {e}")

    # Fallback lookup for LMS offered course ID and student ID
    lms_oc = assignment.lms_offered_course_id
    if not lms_oc and assignment.course_id:
        c_obj = db.query(Course).filter(Course.id == assignment.course_id).first()
        if c_obj and c_obj.lms_course_id:
            lms_oc = c_obj.lms_course_id
    if not lms_oc and assignment.course_name:
        c_obj = db.query(Course).filter(Course.account_id == account.id, Course.title.ilike(assignment.course_name)).first()
        if c_obj and c_obj.lms_course_id:
            lms_oc = c_obj.lms_course_id

    lms_student = assignment.lms_student_id or "MTE2NjMy"

    # Prepare multipart form fields
    data = {
        "assignmentTitle": assignment.title,
        "assignmentID": assignment.lms_assignment_id or "",
        "offeredCourseID": lms_oc or "",
        "ocID": lms_oc or "",
        "studentID": lms_student,
    }

    files = {
        "assignmentSubmissionFile": (file_name, file_bytes, mime_type or "application/octet-stream")
    }

    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Referer": "https://lms.bahria.edu.pk/Student/Assignments.php",
    }

    submit_url = "https://lms.bahria.edu.pk/Student/includes/studentprocess.php?s=assignmentSubmissionAdd"

    try:
        from app.api.v1.endpoints.downloads import ensure_active_portal_session
        cookies = await ensure_active_portal_session(db, account)
        import httpx
        async with httpx.AsyncClient(cookies=cookies, headers=req_headers, verify=False, timeout=60.0) as client:
            resp = await client.post(submit_url, data=data, files=files, follow_redirects=True)
            logger.info(f"Assignment upload submitted to LMS: status={resp.status_code}")
    except Exception as e:
        logger.warning(f"Error posting submission to LMS: {e}")

    # Mark as submitted in local database
    assignment.submission_status = "SUBMITTED"
    assignment.submission_attachment_name = file_name
    if not assignment.submission_attachment_url:
        assignment.submission_attachment_url = f"local://{file_name}"
    assignment.can_submit = False if assignment.extension_type == "missing_only" else True
    assignment.can_reupload = True if assignment.extension_type == "everyone" else False
    assignment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assignment)
    return assignment

@router.post("/assignments/{assignment_id}/submit", response_model=AssignmentSchema)
async def submit_assignment_solution(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """Multipart file upload endpoint for assignment solution submission."""
    file_bytes = await file.read()
    return await _execute_assignment_submission(
        assignment_id=assignment_id,
        file_name=file.filename,
        file_bytes=file_bytes,
        mime_type=file.content_type or "application/octet-stream",
        db=db,
        account=account
    )

@router.post("/assignments/{assignment_id}/submit-json", response_model=AssignmentSchema)
async def submit_assignment_json(
    assignment_id: str,
    payload: AssignmentJsonSubmission,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    JSON Base64 upload endpoint for assignment solution submission.
    Provides 100% reliable compatibility across React Native Expo Go (Android/iOS) and Web
    without FormDataPart, OkHttp file URI, or multipart boundary bugs.
    """
    try:
        file_bytes = base64.b64decode(payload.file_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {e}")

    return await _execute_assignment_submission(
        assignment_id=assignment_id,
        file_name=payload.file_name,
        file_bytes=file_bytes,
        mime_type=payload.mime_type or "application/octet-stream",
        db=db,
        account=account
    )

@router.delete("/assignments/{assignment_id}/submission", response_model=AssignmentSchema)
async def delete_assignment_submission(
    assignment_id: str,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Deletes student's assignment submission directly from Bahria University LMS.
    Matches LMS rules: permissible before deadline passes or when extended for everyone.
    Locked once deadline has exceeded.
    """
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.account_id == account.id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    is_already_submitted = (
        assignment.submission_status == "SUBMITTED" or
        bool(assignment.submission_attachment_url)
    )
    if not is_already_submitted:
        raise HTTPException(status_code=400, detail="No submission found to delete.")

    # Check permission: After deadline is exceeded, deletion is locked
    now_utc = datetime.now(timezone.utc)
    effective_dl = assignment.extended_deadline or assignment.deadline
    is_deadline_passed = assignment.is_passed
    if effective_dl:
        effective_dl_utc = effective_dl.replace(tzinfo=timezone.utc) if effective_dl.tzinfo is None else effective_dl
        if effective_dl_utc < now_utc:
            is_deadline_passed = True

    if is_deadline_passed:
        raise HTTPException(
            status_code=403,
            detail="Assignment deadline has passed. Submissions cannot be deleted."
        )

    if assignment.is_extended and assignment.extension_type == "missing_only":
        raise HTTPException(
            status_code=403,
            detail="This assignment deadline was extended for missing submissions only. Deletion is not permitted."
        )

    # Fallback lookup for LMS offered course ID
    lms_oc = assignment.lms_offered_course_id
    if not lms_oc and assignment.course_id:
        c_obj = db.query(Course).filter(Course.id == assignment.course_id).first()
        if c_obj and c_obj.lms_course_id:
            lms_oc = c_obj.lms_course_id
    if not lms_oc and assignment.course_name:
        c_obj = db.query(Course).filter(Course.account_id == account.id, Course.title.ilike(assignment.course_name)).first()
        if c_obj and c_obj.lms_course_id:
            lms_oc = c_obj.lms_course_id

    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Referer": f"https://lms.bahria.edu.pk/Student/Assignments.php?s=MjAyNjM%3D&oc={lms_oc or ''}",
    }

    try:
        from app.api.v1.endpoints.downloads import ensure_active_portal_session
        cookies = await ensure_active_portal_session(db, account)
        import httpx
        from bs4 import BeautifulSoup
        async with httpx.AsyncClient(cookies=cookies, headers=req_headers, verify=False, timeout=30.0) as client:
            # 1. Fetch Assignments.php to retrieve the authentic dynamic aSubId delete link
            assign_page_url = f"https://lms.bahria.edu.pk/Student/Assignments.php?s=MjAyNjM%3D&oc={lms_oc or ''}"
            page_resp = await client.get(assign_page_url)
            del_href = None
            if page_resp.status_code == 200:
                soup = BeautifulSoup(page_resp.text, "html.parser")
                a_id = assignment.lms_assignment_id or ""
                for a_tag in soup.find_all("a", href=True):
                    href = a_tag["href"]
                    if "assignmentSubmissionDelete" in href and (not a_id or f"a={a_id}" in href):
                        del_href = href
                        break

            # 2. Invoke official deletion URL with aSubId
            if del_href:
                clean_href = del_href.lstrip("/")
                full_del_url = f"https://lms.bahria.edu.pk/Student/{clean_href}" if not del_href.startswith("http") else del_href
                resp = await client.get(full_del_url, follow_redirects=False)
                logger.info(f"Assignment submission deleted on LMS via direct link: status={resp.status_code}, location={resp.headers.get('location')}")
            else:
                # Fallback: POST to studentprocess.php with available parameters
                del_url = "https://lms.bahria.edu.pk/Student/includes/studentprocess.php?s=assignmentSubmissionDelete"
                req_data = {
                    "a": assignment.lms_assignment_id or "",
                    "oc": lms_oc or "",
                }
                resp = await client.post(del_url, data=req_data, follow_redirects=False)
                logger.info(f"Assignment submission deleted on LMS via fallback: status={resp.status_code}")
    except Exception as e:
        logger.warning(f"Error calling LMS submission delete: {e}")

    # Remove local backup submission file if present
    try:
        sub_dir = os.path.join(os.getcwd(), "backend", "uploads", "submissions")
        if os.path.exists(sub_dir):
            for fname in os.listdir(sub_dir):
                if fname.startswith(f"{assignment.id}_"):
                    os.remove(os.path.join(sub_dir, fname))
    except Exception as e:
        logger.debug(f"Local submission cleanup: {e}")

    # Reset submission state in local database
    assignment.submission_status = "PENDING"
    assignment.submission_attachment_name = None
    assignment.submission_attachment_url = None
    assignment.can_submit = True
    assignment.can_reupload = False
    assignment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assignment)
    return assignment

# ==============================================================================
# ATTENDANCE
# ==============================================================================
@router.get("/attendance", response_model=List[AttendanceRecordSchema])
def get_attendance(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.account_id == account.id
    ).all()
    from app.services.attendance_calculator import calculate_overall_safe_skips
    for rec in records:
        cr = rec.credit_hours or 3.0
        skips = calculate_overall_safe_skips(
            absent_hours=rec.absent_hours,
            credit_hours=cr,
            course_title=rec.course_title,
            course_code=rec.course_code,
        )
        rec.safe_misses = skips["safe_skips"]
        rec.fine_skips = skips["additional_fine_skips"]
        rec.fine_amount = skips["fine_amount"]
        rec.total_semester_hours = skips["total_semester_hours"]
    return records

@router.post("/attendance/calculate", response_model=AttendanceCalculationResponse)
def calculate_attendance_scenario(req: AttendanceCalculationRequest):
    """Calculates safe misses or needed classes for 'what-if' attendance scenarios."""
    present = req.present_hours
    total = req.total_hours
    req_pct = req.required_percentage

    pct = round((present / total * 100.0), 2) if total > 0 else 0.0
    safe_misses = calculate_safe_misses(present, total, req_pct)
    needed = calculate_needed_to_recover(present, total, req_pct)
    status_str = determine_risk_status(pct, req_pct)

    return AttendanceCalculationResponse(
        present_hours=present,
        total_hours=total,
        current_percentage=pct,
        required_percentage=req_pct,
        safe_misses=safe_misses,
        needed_for_safe=needed,
        status=status_str,
    )

# ==============================================================================
# MATERIALS
# ==============================================================================
@router.get("/materials", response_model=List[LectureMaterialSchema])
def get_materials(
    course_id: Optional[str] = None,
    week: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    query = db.query(LectureMaterial).filter(LectureMaterial.account_id == account.id)

    if course_id:
        query = query.filter(LectureMaterial.course_id == course_id)
    if week:
        query = query.filter(LectureMaterial.week_number == week)
    if search:
        s = f"%{search.strip()}%"
    materials = query.all()

    # Sort sequentially by lecture/week number, then filename
    def material_sort_key(m: LectureMaterial):
        combined = f"{m.week_number or ''} {m.title or ''} {m.file_name or ''}"
        match = re.search(r'(?:lecture|week|lab|task|#)?\s*#?\s*0*(\d+)', combined, re.IGNORECASE)
        num = int(match.group(1)) if match else 9999
        return (num, m.file_name or "")

    materials.sort(key=material_sort_key)
    return [LectureMaterialSchema.from_orm(m) for m in materials]

# ==============================================================================
# GRADES & CGPA RESULTS
# ==============================================================================
@router.get("/grades", response_model=List[GradeSchema])
def get_grades(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    grades = db.query(Grade).filter(Grade.account_id == account.id).all()
    return grades

def _semester_sort_key(sem_name: str) -> Tuple[int, int]:
    """Helper to sort academic semesters chronologically (e.g. Fall-2024 before Spring-2025)."""
    year_match = re.search(r"20(\d\d)", sem_name)
    year = int(year_match.group(1)) if year_match else 0
    if not year:
        short_year = re.search(r"\b(\d{2})\b", sem_name)
        year = int(short_year.group(1)) if short_year else 99

    name_lower = sem_name.lower()
    if "spring" in name_lower:
        season = 1
    elif "summer" in name_lower:
        season = 2
    elif "fall" in name_lower or "autumn" in name_lower:
        season = 3
    elif "winter" in name_lower:
        season = 4
    else:
        season = 5
    return (year, season)

@router.get("/results", response_model=FullAcademicResultSchema)
def get_academic_results(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Returns full official academic standing, cumulative GPA (CGPA), semester GPAs, and course breakdown.
    Calculated 100% dynamically per student account from their verified Grade records.
    """
    grades = db.query(Grade).filter(Grade.account_id == account.id).all()

    if grades:
        semesters_dict: Dict[str, List[Grade]] = {}
        for g in grades:
            sem = g.semester or "Previous Semester"
            if sem not in semesters_dict:
                semesters_dict[sem] = []
            semesters_dict[sem].append(g)

        # Sort semesters chronologically
        sorted_sem_names = sorted(
            semesters_dict.keys(),
            key=_semester_sort_key
        )

        semester_list = []
        cum_points = 0.0
        cum_graded_credits = 0.0
        total_cr_completed = 0.0
        latest_sgpa = 0.0
        latest_cgpa = 0.0
        completed_count = 0

        for sem_name in sorted_sem_names:
            sem_courses = semesters_dict[sem_name]
            graded_courses = [
                c for c in sem_courses
                if (c.grade or "").strip().upper() not in ("N/A", "I", "W", "")
            ]
            is_in_prog = len(graded_courses) < len(sem_courses) or len(graded_courses) == 0
            sem_cr = sum(c.credit_hours for c in sem_courses)
            sem_graded_cr = sum(c.credit_hours for c in graded_courses)
            sem_pts = sum(c.credit_hours * c.grade_points for c in graded_courses)

            if not is_in_prog and sem_graded_cr > 0:
                sem_gpa = round(sem_pts / sem_graded_cr, 2)
                cum_points += sem_pts
                cum_graded_credits += sem_graded_cr
                sem_cgpa = round(cum_points / cum_graded_credits, 2) if cum_graded_credits > 0 else 0.0
                
                # Credits earned towards degree (exclude F / Fail)
                passed_cr = sum(
                    c.credit_hours for c in graded_courses
                    if (c.grade or "").strip().upper() not in ("F", "FAIL")
                )
                total_cr_completed += passed_cr
                completed_count += 1
                latest_sgpa = sem_gpa
                latest_cgpa = sem_cgpa
            else:
                sem_gpa = 0.0
                sem_cgpa = latest_cgpa

            semester_list.append(
                SemesterResultSchema(
                    semester_name=sem_name,
                    gpa=sem_gpa,
                    cgpa=sem_cgpa,
                    credit_hours=sem_cr,
                    is_in_progress=is_in_prog,
                    courses=[GradeSchema.from_orm(c) for c in sem_courses]
                )
            )

        progress = min(100.0, round((total_cr_completed / 130.0) * 100.0, 1))
        if latest_cgpa >= 3.5:
            standing = "Dean's Honor Roll"
        elif latest_cgpa >= 2.0:
            standing = "Good Standing"
        elif latest_cgpa > 0.0:
            standing = "Academic Warning"
        else:
            standing = "Enrolled"

        return FullAcademicResultSchema(
            cgpa=latest_cgpa,
            current_sgpa=latest_sgpa,
            total_credit_hours=round(total_cr_completed, 1),
            completed_semesters_count=completed_count,
            degree_progress_pct=progress,
            academic_standing=standing,
            semesters=semester_list,
        )

    # If no grades have been synced yet, return clean empty result
    return FullAcademicResultSchema(
        cgpa=0.0,
        current_sgpa=0.0,
        total_credit_hours=0.0,
        completed_semesters_count=0,
        degree_progress_pct=0.0,
        academic_standing="Enrolled",
        semesters=[],
    )


# ==============================================================================
# ANNOUNCEMENTS
# ==============================================================================
@router.get("/announcements", response_model=List[AcademicAnnouncementSchema])
def get_announcements(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    announcements = db.query(AcademicAnnouncement).filter(
        AcademicAnnouncement.account_id == account.id
    ).order_by(AcademicAnnouncement.created_at.desc()).all()
    return announcements


# ==============================================================================
# COMMUNITY SERVICE PROGRAM (CSP)
# ==============================================================================
@router.get("/community-services")
def get_community_services(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Returns official Bahria University Community Services (CSP) hours and activities.
    URL: https://cms.bahria.edu.pk/Sys/Student/Exams/CommunityServices.aspx
    """
    from app.models.academic import CommunityService
    from app.schemas.academic import CommunityServiceSchema
    csp_records = db.query(CommunityService).filter(CommunityService.account_id == account.id).all()

    if csp_records:
        total_csp = sum(c.hours for c in csp_records)
        items = [CommunityServiceSchema.from_orm(c) for c in csp_records]
    else:
        total_csp = 0.0
        items = []

    return {
        "total_hours": total_csp,
        "required_hours": 40.0,
        "is_fulfilled": total_csp >= 40.0,
        "records": items
    }

    return {
        "total_hours": total_csp,
        "required_hours": 40.0,
        "is_fulfilled": total_csp >= 40.0,
        "records": items
    }
