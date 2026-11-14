from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_university_account
from app.models.user import UniversityAccount
from app.models.academic import Course, Assignment, AttendanceRecord, LectureMaterial
from app.models.notification import NotificationEvent
from app.schemas.academic import (
    DashboardOverviewSchema,
    AssignmentSchema,
    AttendanceRecordSchema,
    ActivityItem,
)

router = APIRouter(prefix="/dashboard", tags=["Home Dashboard"])

@router.get("", response_model=DashboardOverviewSchema)
def get_dashboard_overview(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    now_utc = datetime.now(timezone.utc)
    in_24h = now_utc + timedelta(hours=24)
    in_48h = now_utc + timedelta(hours=48)

    # 1. Assignments Queries
    assignments = db.query(Assignment).filter(
        Assignment.account_id == account.id
    ).all()

    pending_count = 0
    due_24h_count = 0
    due_48h_count = 0
    overdue_count = 0

    upcoming_list: List[Assignment] = []
    missed_list: List[Assignment] = []

    for a in assignments:
        if not a.personal_completed and a.submission_status != "SUBMITTED":
            if a.deadline:
                dl_utc = a.deadline.replace(tzinfo=timezone.utc) if a.deadline.tzinfo is None else a.deadline
                if dl_utc < now_utc or a.submission_status == "OVERDUE":
                    overdue_count += 1
                    missed_list.append(a)
                else:
                    pending_count += 1
                    if dl_utc <= in_24h:
                        due_24h_count += 1
                    elif dl_utc <= in_48h:
                        due_48h_count += 1
                    upcoming_list.append(a)
            elif a.submission_status == "OVERDUE":
                overdue_count += 1
                missed_list.append(a)
            else:
                pending_count += 1
                upcoming_list.append(a)

    # Sort upcoming assignments by nearest deadline
    upcoming_list.sort(key=lambda x: x.deadline if x.deadline else datetime.max.replace(tzinfo=timezone.utc))
    missed_list.sort(key=lambda x: x.deadline if x.deadline else datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    # 2. Attendance Queries
    attendance_records = db.query(AttendanceRecord).filter(
        AttendanceRecord.account_id == account.id
    ).all()

    safe_count = 0
    warning_count = 0
    critical_count = 0
    total_present = 0.0
    total_conducted = 0.0

    from app.services.attendance_calculator import calculate_overall_safe_skips
    for att in attendance_records:
        cr = att.credit_hours or 3.0
        skips = calculate_overall_safe_skips(
            absent_hours=att.absent_hours,
            credit_hours=cr,
            course_title=att.course_title,
            course_code=att.course_code,
        )
        att.safe_misses = skips["safe_skips"]
        att.fine_skips = skips["additional_fine_skips"]
        att.fine_amount = skips["fine_amount"]
        att.total_semester_hours = skips["total_semester_hours"]
        total_present += att.present_hours
        total_conducted += att.total_hours
        if att.risk_status == "SAFE":
            safe_count += 1
        elif att.risk_status == "WARNING":
            warning_count += 1
        else:
            critical_count += 1

    overall_att_pct = round((total_present / total_conducted * 100.0), 2) if total_conducted > 0 else 0.0

    # 3. Materials Count
    materials_count = db.query(LectureMaterial).filter(
        LectureMaterial.account_id == account.id
    ).count()

    # 4. Recent Activity Timeline (empty for now per user request)
    activity_items: List[ActivityItem] = []

    # 5. CGPA and SGPA computation (Excluding in-progress semester)
    from app.models.academic import Grade
    grades = db.query(Grade).filter(Grade.account_id == account.id).all()
    completed_grades = [
        g for g in grades
        if (g.grade or "").strip().upper() not in ("N/A", "I", "W", "")
    ]
    if completed_grades:
        total_cr = sum(g.credit_hours for g in completed_grades)
        total_pts = sum(g.grade_points * g.credit_hours for g in completed_grades)
        calc_cgpa = round(total_pts / total_cr, 2) if total_cr > 0 else 0.0

        # Calculate SGPA from latest completed semester
        from app.api.v1.endpoints.academic import _semester_sort_key
        sem_names = list({g.semester for g in completed_grades if g.semester})
        sorted_sems = sorted(sem_names, key=_semester_sort_key, reverse=True)
        latest_sem = sorted_sems[0] if sorted_sems else ""

        sem_grades = [g for g in completed_grades if g.semester == latest_sem]
        sem_cr = sum(g.credit_hours for g in sem_grades)
        sem_pts = sum(g.grade_points * g.credit_hours for g in sem_grades)
        calc_sgpa = round(sem_pts / sem_cr, 2) if sem_cr > 0 else 0.0
    else:
        calc_cgpa = 0.0
        calc_sgpa = 0.0
        total_cr = 0.0

    if calc_cgpa >= 3.5:
        standing = "Dean's Honor Roll"
    elif calc_cgpa >= 2.0:
        standing = "Good Standing"
    elif calc_cgpa > 0.0:
        standing = "Academic Warning"
    else:
        standing = "Enrolled"

    # Community Service Program (CSP) hours calculation
    from app.models.academic import CommunityService
    from app.schemas.academic import CommunityServiceSchema
    csp_records = db.query(CommunityService).filter(CommunityService.account_id == account.id).all()
    
    csp_list = []
    if csp_records:
        total_csp = sum(c.hours for c in csp_records)
        csp_list = [CommunityServiceSchema.from_orm(c) for c in csp_records]
    else:
        total_csp = 0.0
        csp_list = []

    # Timezone-aware sync timestamp
    last_sync = account.last_synced_at
    if last_sync and last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)

    return DashboardOverviewSchema(
        full_name=account.full_name or "Student",
        enrollment=account.enrollment,
        campus_name=account.campus_name,
        current_semester=account.current_semester or "Current",
        cgpa=calc_cgpa,
        sgpa=calc_sgpa,
        total_credit_hours=total_cr,
        total_csp_hours=total_csp,
        csp_required_hours=40.0,
        academic_standing=standing,
        pending_assignments_count=pending_count,
        due_24h_count=due_24h_count,
        due_48h_count=due_48h_count,
        overdue_count=overdue_count,
        overall_attendance_pct=overall_att_pct,
        safe_courses_count=safe_count,
        warning_courses_count=warning_count,
        critical_courses_count=critical_count,
        new_materials_count=materials_count,
        upcoming_assignments=[AssignmentSchema.from_orm(a) for a in upcoming_list[:6]],
        missed_assignments=[AssignmentSchema.from_orm(a) for a in missed_list],
        attendance_cards=[AttendanceRecordSchema.from_orm(att) for att in attendance_records],
        community_services=csp_list,
        recent_activity=activity_items,
        last_synced_at=last_sync,
        sync_status=account.last_sync_status or "CONNECTED",
    )

