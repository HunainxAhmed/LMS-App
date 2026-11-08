from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class LMSConnectRequest(BaseModel):
    enrollment: str = Field(..., min_length=3, max_length=64, description="Student Enrollment ID")
    password: str = Field(..., min_length=1, description="Bahria University Portal Password")
    campus_id: str = Field(..., description="Campus Identifier, e.g. '2' for Karachi Campus")
    campus_name: str = Field(..., description="Human-readable campus name")
    enable_cloud_monitoring: bool = Field(
        default=False,
        description="Explicit opt-in to store encrypted credentials for 24/7 background notifications"
    )

class LMSVerifyResponse(BaseModel):
    success: bool
    message: str
    full_name: Optional[str] = None
    enrollment: Optional[str] = None
    campus_name: Optional[str] = None
    cloud_monitoring_enabled: bool = False

class LMSDisconnectResponse(BaseModel):
    success: bool
    message: str

class UniversityAccountSummary(BaseModel):
    id: str
    enrollment: str
    campus_id: str
    campus_name: str
    full_name: str
    program: str
    current_semester: str
    cloud_monitoring_enabled: bool
    last_synced_at: Optional[str] = None
    last_sync_status: str

class UserProfileResponse(BaseModel):
    id: str
    email: str
    is_active: bool
    university_account: Optional[UniversityAccountSummary] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)
