import os
import secrets
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "CampusFlow — Bahria Student Companion"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = True

    # Host & Port (0.0.0.0 is essential for Expo Go / phone access)
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS origins: allow local development and Expo Go clients
    ALLOWED_ORIGINS: List[str] = ["*"]

    # Database (always anchor to backend/campusflow.db regardless of process cwd)
    DATABASE_URL: str = Field(
        default_factory=lambda: f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'campusflow.db').replace(os.sep, '/')}"
    )

    # JWT Settings (Independent CampusFlow account auth)
    JWT_SECRET_KEY: str = Field(
        default="campusflow_production_jwt_secret_key_bahria_student_companion_2026"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # AES-256-GCM Master Key for Cloud-Stored University Credentials
    # Must be 32 bytes URL-safe base64 encoded
    ENCRYPTION_MASTER_KEY: str = Field(
        default="4d71597a783856475355644766324b4f536c317646453967483758364d6d673d"
    )

    # University Portals
    BAHRIA_CMS_BASE_URL: str = "https://cms.bahria.edu.pk"
    BAHRIA_LMS_BASE_URL: str = "https://lms.bahria.edu.pk"
    PORTAL_REQUEST_TIMEOUT: int = 20

    # Synchronization (continuous near real-time cloud tracking)
    DEFAULT_SYNC_INTERVAL_MINUTES: int = 2
    MIN_SYNC_INTERVAL_MINUTES: int = 1
    MAX_CONCURRENT_SYNCS: int = 4

    # Push notifications
    ENABLE_REMOTE_PUSH: bool = True
    EXPO_PUSH_API_URL: str = "https://exp.host/--/api/v2/push/send"
    EXPO_RECEIPTS_API_URL: str = "https://exp.host/--/api/v2/push/getReceipts"

    # Default Attendance Minimum Assumption
    DEFAULT_ATTENDANCE_THRESHOLD: float = 75.0

    # Timezone
    APP_TIMEZONE: str = "Asia/Karachi"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
