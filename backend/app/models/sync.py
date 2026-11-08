import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship
from app.database.session import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    
    # MANUAL, SCHEDULED, REAUTH
    trigger_type = Column(String(32), default="MANUAL", nullable=False)
    
    # PENDING, RUNNING, SUCCESS, FAILED, PARTIAL
    status = Column(String(32), default="PENDING", nullable=False)
    
    # Progress step description
    current_step = Column(String(128), default="Initializing...")
    
    assignments_count = Column(Integer, default=0)
    attendance_count = Column(Integer, default=0)
    materials_count = Column(Integer, default=0)
    
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, default=utc_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    account = relationship("UniversityAccount", back_populates="sync_jobs")
