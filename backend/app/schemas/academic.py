from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, Field

class CourseSchema(BaseModel):
    id: str
    code: str
    title: str
    credit_hours: Optional[float] = 3.0
    instructor: Optional[str] = ""
    section: Optional[str] = ""
    semester: Optional[str] = ""

    class Config:
        from_attributes = True

class AssignmentSchema(BaseModel):
    id: str
    course_id: Optional[str] = None
    course_name: str
    assignment_number: str
    title: str
    description: str
    deadline: Optional[datetime] = None
    deadline_raw: str
    days_left: Optional[int] = None
    is_passed: bool
    attachment_url: str
    attachment_name: str
    teacher_attachment_url: Optional[str] = ""
    teacher_attachment_name: Optional[str] = ""
    submission_attachment_url: Optional[str] = ""
    submission_attachment_name: Optional[str] = ""
    submission_status: str
    personal_completed: bool
    is_extended: Optional[bool] = False
    extended_deadline: Optional[datetime] = None
    extended_deadline_raw: Optional[str] = ""
    original_deadline: Optional[datetime] = None
    original_deadline_raw: Optional[str] = ""
    extension_type: Optional[str] = ""
    can_submit: Optional[bool] = True
    can_reupload: Optional[bool] = False
    lms_assignment_id: Optional[str] = ""
    lms_offered_course_id: Optional[str] = ""
    lms_student_id: Optional[str] = ""

    class Config:
        from_attributes = True

class AssignmentStatusUpdate(BaseModel):
    personal_completed: bool

class AttendanceSessionSchema(BaseModel):
    id: str
    session_date: str
    day_name: str = ""
    slot_info: str = ""
    status: str  # PRESENT or ABSENT
    remarks: str = ""

    class Config:
        from_attributes = True

class AttendanceRecordSchema(BaseModel):
    id: str
    course_code: str
    course_title: str
    instructor: str
    credit_hours: float = 3.0
    present_hours: float
    absent_hours: float
    total_hours: float
    total_semester_hours: float = 48.0
    percentage: float
    safe_misses: int
    fine_skips: int = 7
    fine_amount: int = 0
    risk_status: str
    sessions: List[AttendanceSessionSchema] = []

    class Config:
        from_attributes = True

class AttendanceCalculationRequest(BaseModel):
    present_hours: float
    total_hours: float
    required_percentage: float = 75.0

class AttendanceCalculationResponse(BaseModel):
    present_hours: float
    total_hours: float
    current_percentage: float
    required_percentage: float
    safe_misses: int
    needed_for_safe: int
    status: str

class LectureMaterialSchema(BaseModel):
    id: str
    course_id: Optional[str] = None
    course_name: str
    week_number: str
    title: str
    description: str
    file_name: str
    file_url: str
    file_type: str
    file_size_bytes: int
    is_downloaded: bool

    class Config:
        from_attributes = True

class GradeSchema(BaseModel):
    id: str
    course_code: str
    course_title: str
    grade: str
    grade_points: float
    credit_hours: float
    semester: str

    class Config:
        from_attributes = True

class AcademicAnnouncementSchema(BaseModel):
    id: str
    title: str
    content: str
    source: str
    published_date: Optional[datetime] = None
    is_read: bool

    class Config:
        from_attributes = True

class ActivityItem(BaseModel):
    id: str
    category: str  # ASSIGNMENT, ATTENDANCE, MATERIAL, GRADE, ANNOUNCEMENT
    title: str
    description: str
    timestamp: datetime
    badge: Optional[str] = None
    deep_link: Optional[str] = None

class SemesterResultSchema(BaseModel):
    semester_name: str
    gpa: float
    cgpa: Optional[float] = None
    credit_hours: float
    is_in_progress: bool = False
    courses: List[GradeSchema]

    class Config:
        from_attributes = True

class FullAcademicResultSchema(BaseModel):
    cgpa: float
    current_sgpa: float
    total_credit_hours: float
    completed_semesters_count: int = 4
    degree_progress_pct: float
    academic_standing: str = "Good Standing"
    semesters: List[SemesterResultSchema]

class DashboardOverviewSchema(BaseModel):
    full_name: str
    enrollment: str
    campus_name: str
    current_semester: str
    cgpa: float = 0.0
    sgpa: float = 0.0
    total_credit_hours: float = 0.0
    academic_standing: str = "Enrolled"
    pending_assignments_count: int
    due_24h_count: int
    due_48h_count: int
    overdue_count: int
    overall_attendance_pct: float
    safe_courses_count: int
    warning_courses_count: int
    critical_courses_count: int
    new_materials_count: int
    upcoming_assignments: List[AssignmentSchema]
    missed_assignments: List[AssignmentSchema] = []
    attendance_cards: List[AttendanceRecordSchema]
    recent_activity: List[ActivityItem]
    last_synced_at: Optional[datetime] = None
    sync_status: str = "CONNECTED"

