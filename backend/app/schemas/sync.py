from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from app.schemas.auth import LMSConnectRequest

class SyncTriggerRequest(BaseModel):
    # If in Local-Only mode, frontend passes credentials from SecureStore on demand
    credentials: Optional[LMSConnectRequest] = None
    force_fresh_login: bool = False

class SyncStatusResponse(BaseModel):
    job_id: str
    status: str  # PENDING, RUNNING, SUCCESS, FAILED, PARTIAL
    current_step: str
    assignments_count: int
    attendance_count: int
    materials_count: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
