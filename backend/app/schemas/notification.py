from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

class NotificationEventSchema(BaseModel):
    id: str
    category: str
    title: str
    body: str
    deep_link: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationListResponse(BaseModel):
    total: int
    unread_count: int
    notifications: List[NotificationEventSchema]

class MarkReadRequest(BaseModel):
    notification_ids: List[str]

class DeviceRegisterRequest(BaseModel):
    push_token: str = Field(..., description="Expo Push Token e.g. ExponentPushToken[xxxxxx]")
    device_name: str = ""
    platform: str = "android"

class UserPreferencesSchema(BaseModel):
    assignments_enabled: bool = True
    attendance_enabled: bool = True
    materials_enabled: bool = True
    grades_enabled: bool = True
    reminder_48h: bool = True
    reminder_24h: bool = True
    reminder_3h: bool = True
    min_attendance_threshold: float = Field(default=75.0, ge=50.0, le=100.0)
    quiet_hours_enabled: bool = False
    quiet_start_hour: int = Field(default=23, ge=0, le=23)
    quiet_end_hour: int = Field(default=7, ge=0, le=23)

    class Config:
        from_attributes = True

class TestPushRequest(BaseModel):
    title: str = "CampusFlow Alert Test"
    body: str = "This is a test notification from CampusFlow."
