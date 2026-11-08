import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, Float, Text
from sqlalchemy.orm import relationship
from app.database.session import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    """CampusFlow internal user account"""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    university_account = relationship("UniversityAccount", back_populates="user", uselist=False, cascade="all, delete-orphan")
    push_tokens = relationship("DevicePushToken", back_populates="user", cascade="all, delete-orphan")
    notification_preferences = relationship("UserNotificationPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")

class UniversityAccount(Base):
    """Connected Bahria University Student Profile"""
    __tablename__ = "university_accounts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    enrollment = Column(String(64), index=True, nullable=False)
    campus_id = Column(String(16), nullable=False)  # e.g. "2" for Karachi, "1" for Islamabad E-8
    campus_name = Column(String(128), nullable=False)
    full_name = Column(String(255), default="")
    program = Column(String(128), default="")
    current_semester = Column(String(32), default="")

    # Cloud monitoring opt-in flag
    cloud_monitoring_enabled = Column(Boolean, default=False, nullable=False)
    sync_interval_minutes = Column(Integer, default=15, nullable=False)

    # Sync state
    last_synced_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String(32), default="NEVER")  # SUCCESS, FAILED, RUNNING, NEVER
    last_sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("User", back_populates="university_account")
    encrypted_credentials = relationship("EncryptedCredential", back_populates="account", uselist=False, cascade="all, delete-orphan")
    encrypted_session = relationship("EncryptedSession", back_populates="account", uselist=False, cascade="all, delete-orphan")
    courses = relationship("Course", back_populates="account", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="account", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="account", cascade="all, delete-orphan")
    attendance_snapshots = relationship("AttendanceSnapshot", back_populates="account", cascade="all, delete-orphan")
    lecture_materials = relationship("LectureMaterial", back_populates="account", cascade="all, delete-orphan")
    grades = relationship("Grade", back_populates="account", cascade="all, delete-orphan")
    announcements = relationship("AcademicAnnouncement", back_populates="account", cascade="all, delete-orphan")
    sync_jobs = relationship("SyncJob", back_populates="account", cascade="all, delete-orphan")
    notification_events = relationship("NotificationEvent", back_populates="account", cascade="all, delete-orphan")

class EncryptedCredential(Base):
    """
    AES-256-GCM encrypted Bahria university password.
    Only stored if user explicitly opts into Cloud Monitoring.
    Immediately deleted when cloud monitoring is toggled off.
    """
    __tablename__ = "encrypted_credentials"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), unique=True, nullable=False)
    ciphertext = Column(Text, nullable=False)
    nonce = Column(String(64), nullable=False)
    key_version = Column(Integer, default=1, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="encrypted_credentials")

class EncryptedSession(Base):
    """
    Encrypted active cookies (ASP.NET_SessionId, .ASPXAUTH, PHPSESSID)
    to reuse HTTP sessions without launching a browser every sync.
    """
    __tablename__ = "encrypted_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), unique=True, nullable=False)
    cookies_json_encrypted = Column(Text, nullable=False)
    nonce = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="encrypted_session")

class DevicePushToken(Base):
    """Expo push tokens for sending background remote notifications"""
    __tablename__ = "device_push_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    push_token = Column(String(255), unique=True, index=True, nullable=False)
    device_name = Column(String(128), default="")
    platform = Column(String(32), default="android")  # android, ios, web
    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="push_tokens")

class UserNotificationPreference(Base):
    """User alert preferences & thresholds"""
    __tablename__ = "user_notification_preferences"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    assignments_enabled = Column(Boolean, default=True, nullable=False)
    attendance_enabled = Column(Boolean, default=True, nullable=False)
    materials_enabled = Column(Boolean, default=True, nullable=False)
    grades_enabled = Column(Boolean, default=True, nullable=False)
    
    # Assignment deadline reminders
    reminder_48h = Column(Boolean, default=True, nullable=False)
    reminder_24h = Column(Boolean, default=True, nullable=False)
    reminder_3h = Column(Boolean, default=True, nullable=False)

    # Attendance threshold assumption (editable by student, defaults to 75%)
    min_attendance_threshold = Column(Float, default=75.0, nullable=False)

    # Quiet hours
    quiet_hours_enabled = Column(Boolean, default=False, nullable=False)
    quiet_start_hour = Column(Integer, default=23)  # 11 PM
    quiet_end_hour = Column(Integer, default=7)    # 7 AM

    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="notification_preferences")
