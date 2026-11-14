import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, Float, Text, Index
from sqlalchemy.orm import relationship
from app.database.session import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class Course(Base):
    __tablename__ = "courses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(32), index=True, nullable=False)
    title = Column(String(255), nullable=False)
    credit_hours = Column(Float, default=3.0)
    instructor = Column(String(255), default="")
    section = Column(String(32), default="")
    semester = Column(String(32), default="")
    lms_course_id = Column(String(64), default="")  # value in select#courseId dropdown
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="courses")
    assignments = relationship("Assignment", back_populates="course", cascade="all, delete-orphan")
    materials = relationship("LectureMaterial", back_populates="course", cascade="all, delete-orphan")
    attendance = relationship("AttendanceRecord", back_populates="course", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_course_account_code", "account_id", "code", unique=True),
    )

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)
    course_name = Column(String(255), nullable=False)
    assignment_number = Column(String(32), default="")
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    
    # Deadlines
    deadline = Column(DateTime, nullable=True)  # Normalized Asia/Karachi -> UTC (effective deadline)
    deadline_raw = Column(String(128), default="")
    days_left = Column(Integer, nullable=True)
    is_passed = Column(Boolean, default=False, nullable=False)
    
    # Extended Deadlines & Policies
    is_extended = Column(Boolean, default=False, nullable=False)
    extended_deadline = Column(DateTime, nullable=True)
    extended_deadline_raw = Column(String(128), default="")
    original_deadline = Column(DateTime, nullable=True)
    original_deadline_raw = Column(String(128), default="")
    extension_type = Column(String(64), default="")  # "missing_only", "everyone", ""
    can_submit = Column(Boolean, default=True, nullable=False)
    can_reupload = Column(Boolean, default=False, nullable=False)
    
    # Portal submission parameters
    lms_assignment_id = Column(String(64), default="")
    lms_offered_course_id = Column(String(64), default="")
    lms_student_id = Column(String(64), default="")

    # Attachments & Downloads
    attachment_url = Column(Text, default="")
    attachment_name = Column(String(255), default="")
    teacher_attachment_url = Column(Text, default="")
    teacher_attachment_name = Column(String(255), default="")
    submission_attachment_url = Column(Text, default="")
    submission_attachment_name = Column(String(255), default="")
    file_size_bytes = Column(Integer, default=0)

    # Submission status
    submission_status = Column(String(64), default="PENDING")  # PENDING, SUBMITTED, GRADED, OVERDUE
    submitted_at = Column(DateTime, nullable=True)
    personal_completed = Column(Boolean, default=False, nullable=False)

    # Notification reminder markers (prevent duplicate alerts)
    notified_new = Column(Boolean, default=False, nullable=False)
    notified_48h = Column(Boolean, default=False, nullable=False)
    notified_24h = Column(Boolean, default=False, nullable=False)
    notified_3h = Column(Boolean, default=False, nullable=False)

    # Unique fingerprint to prevent duplicate inserts across repeated scrapes
    fingerprint = Column(String(64), index=True, nullable=False)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="assignments")
    course = relationship("Course", back_populates="assignments")

    __table_args__ = (
        Index("idx_assign_account_fingerprint", "account_id", "fingerprint", unique=True),
    )

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    course_code = Column(String(32), index=True, nullable=False)
    course_title = Column(String(255), nullable=False)
    instructor = Column(String(255), default="")
    credit_hours = Column(Float, default=3.0, nullable=False)

    present_hours = Column(Float, default=0.0, nullable=False)
    absent_hours = Column(Float, default=0.0, nullable=False)
    total_hours = Column(Float, default=0.0, nullable=False)
    total_semester_hours = Column(Float, default=48.0, nullable=False)
    percentage = Column(Float, default=0.0, nullable=False)

    # Attendance calculation: Safe Misses from overall semester period (Bahria policy: 48h / 32h)
    safe_misses = Column(Integer, default=0, nullable=False)
    fine_skips = Column(Integer, default=7, nullable=False)
    fine_amount = Column(Integer, default=0, nullable=False)
    risk_status = Column(String(16), default="SAFE")  # SAFE (>=75%), WARNING (>=60% <75%), CRITICAL (<60%)

    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="attendance_records")
    course = relationship("Course", back_populates="attendance")
    sessions = relationship("AttendanceSession", back_populates="attendance_record", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_att_account_code", "account_id", "course_code", unique=True),
    )

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    attendance_record_id = Column(String(36), ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    course_code = Column(String(32), index=True, nullable=False)
    session_date = Column(String(64), nullable=False)
    day_name = Column(String(32), default="")
    slot_info = Column(String(64), default="")
    status = Column(String(16), nullable=False)  # PRESENT or ABSENT
    remarks = Column(String(255), default="")
    created_at = Column(DateTime, default=utc_now, nullable=False)

    attendance_record = relationship("AttendanceRecord", back_populates="sessions")

class AttendanceSnapshot(Base):
    """
    Historical record of attendance per scrape run.
    Used for reliable change detection (new absence, corrections, percentage shifts).
    """
    __tablename__ = "attendance_snapshots"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    course_code = Column(String(32), index=True, nullable=False)
    course_title = Column(String(255), nullable=False)
    present_hours = Column(Float, default=0.0, nullable=False)
    absent_hours = Column(Float, default=0.0, nullable=False)
    total_hours = Column(Float, default=0.0, nullable=False)
    percentage = Column(Float, default=0.0, nullable=False)
    recorded_at = Column(DateTime, default=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="attendance_snapshots")

class LectureMaterial(Base):
    __tablename__ = "lecture_materials"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)
    course_name = Column(String(255), nullable=False)
    week_number = Column(String(32), default="")
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    
    file_name = Column(String(255), nullable=False)
    file_url = Column(Text, nullable=False)
    file_type = Column(String(32), default="pdf")  # pdf, pptx, docx, zip
    file_size_bytes = Column(Integer, default=0)

    # Local download cache on server for ZIP generation
    local_path = Column(Text, nullable=True)
    is_downloaded = Column(Boolean, default=False, nullable=False)

    fingerprint = Column(String(64), index=True, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="lecture_materials")
    course = relationship("Course", back_populates="materials")

    __table_args__ = (
        Index("idx_mat_account_fingerprint", "account_id", "fingerprint", unique=True),
    )

class Grade(Base):
    __tablename__ = "grades"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    course_code = Column(String(32), nullable=False)
    course_title = Column(String(255), nullable=False)
    grade = Column(String(8), default="")
    grade_points = Column(Float, default=0.0)
    credit_hours = Column(Float, default=3.0)
    semester = Column(String(32), default="")
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="grades")

class AcademicAnnouncement(Base):
    __tablename__ = "academic_announcements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, default="")
    source = Column(String(64), default="CMS")  # CMS or LMS
    published_date = Column(DateTime, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="announcements")

class CommunityService(Base):
    __tablename__ = "community_services"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    semester = Column(String(32), default="")
    organization = Column(String(255), nullable=False)
    job_title = Column(String(128), default="N/A")
    completed_date = Column(String(64), default="")
    hours = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    account = relationship("UniversityAccount", backref="community_services")
