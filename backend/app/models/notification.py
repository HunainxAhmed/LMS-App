import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, Text, Index
from sqlalchemy.orm import relationship
from app.database.session import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class NotificationEvent(Base):
    """
    Central persistent notification event store.
    Uses SHA-256 event_hash to guarantee zero duplicate notifications.
    """
    __tablename__ = "notification_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("university_accounts.id", ondelete="CASCADE"), nullable=False)
    
    # Categories:
    # ASSIGNMENT_NEW, ASSIGNMENT_48H, ASSIGNMENT_24H, ASSIGNMENT_3H,
    # ATTENDANCE_ABSENT, ATTENDANCE_CHANGE, ATTENDANCE_WARNING,
    # MATERIAL_NEW, GRADE_NEW, ANNOUNCEMENT_NEW
    category = Column(String(32), index=True, nullable=False)
    
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    
    # Deep link navigation metadata
    deep_link = Column(String(255), default="/(tabs)/assignments")
    data_json = Column(Text, default="{}")

    # Stable unique hash to prevent duplicate creation
    event_hash = Column(String(64), index=True, nullable=False)

    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    account = relationship("UniversityAccount", back_populates="notification_events")
    deliveries = relationship("NotificationDelivery", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_notif_account_hash", "account_id", "event_hash", unique=True),
    )

class NotificationDelivery(Base):
    """
    Tracks remote push delivery status per device.
    Supports retries, backoff, and delivery receipt auditing.
    """
    __tablename__ = "notification_deliveries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_id = Column(String(36), ForeignKey("notification_events.id", ondelete="CASCADE"), nullable=False)
    push_token = Column(String(255), nullable=False)
    
    # Status: PENDING, SENT, DELIVERED, FAILED, RETRY
    status = Column(String(16), default="PENDING", nullable=False)
    attempt_count = Column(Integer, default=0, nullable=False)
    provider_ticket_id = Column(String(128), nullable=True)
    provider_response = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    event = relationship("NotificationEvent", back_populates="deliveries")
