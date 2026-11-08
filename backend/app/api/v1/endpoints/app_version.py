import os
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

router = APIRouter(prefix="/app", tags=["App Updates & Versioning"])

class AppVersionResponse(BaseModel):
    latest_version: str
    current_version: str
    is_update_available: bool
    is_mandatory: bool
    release_notes: List[str]
    download_url: str
    ota_compatible: bool
    file_size_bytes: int
    published_at: str

class UpdateVersionPayload(BaseModel):
    latest_version: str
    is_mandatory: bool = False
    release_notes: List[str]
    download_url: Optional[str] = None
    file_size_bytes: Optional[int] = None

# Default configured production release info
CURRENT_CONFIG = {
    "latest_version": "1.0.1",
    "is_mandatory": False,
    "release_notes": [
        "Dynamic In-App Update system with real-time download progress bar",
        "Refined sequential coursework cards with single-line due dates",
        "Secured Lab Task 3 deadline protection against accidental deletion",
        "Proprietary Attendance Health Track & Safe Skips Shield (competitor-free)",
        "Refreshed Emerald & Slate executive university color theme"
    ],
    "download_url": "/api/v1/app/download-apk",
    "file_size_bytes": 35840000,
    "published_at": "2026-11-08T17:30:00Z"
}

def compare_versions(v1: str, v2: str) -> int:
    """Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal."""
    def normalize(v):
        return [int(x) for x in v.lstrip('v').split('.') if x.isdigit()]
    p1 = normalize(v1)
    p2 = normalize(v2)
    for i in range(max(len(p1), len(p2))):
        val1 = p1[i] if i < len(p1) else 0
        val2 = p2[i] if i < len(p2) else 0
        if val1 > val2:
            return 1
        if val1 < val2:
            return -1
    return 0

@router.get("/check-update", response_model=AppVersionResponse)
def check_for_updates(
    current_version: str = Query("1.0.0", description="Current app version running on client"),
    platform: str = Query("android", description="android or ios")
):
    """
    Checks if a newer version of the CampusFlow app is available.
    Returns update status, release notes, and download URL.
    """
    latest = CURRENT_CONFIG["latest_version"]
    has_update = compare_versions(latest, current_version) > 0

    return AppVersionResponse(
        latest_version=latest,
        current_version=current_version,
        is_update_available=has_update,
        is_mandatory=CURRENT_CONFIG["is_mandatory"],
        release_notes=CURRENT_CONFIG["release_notes"],
        download_url=CURRENT_CONFIG["download_url"],
        ota_compatible=True,
        file_size_bytes=CURRENT_CONFIG["file_size_bytes"],
        published_at=CURRENT_CONFIG["published_at"],
    )

@router.get("/version")
def get_version():
    """Returns current active app release metadata."""
    return CURRENT_CONFIG

@router.post("/version")
def set_version(payload: UpdateVersionPayload):
    """
    Admin endpoint to broadcast a new update to all student devices dynamically.
    """
    CURRENT_CONFIG["latest_version"] = payload.latest_version
    CURRENT_CONFIG["is_mandatory"] = payload.is_mandatory
    CURRENT_CONFIG["release_notes"] = payload.release_notes
    if payload.download_url:
        CURRENT_CONFIG["download_url"] = payload.download_url
    if payload.file_size_bytes:
        CURRENT_CONFIG["file_size_bytes"] = payload.file_size_bytes
    CURRENT_CONFIG["published_at"] = datetime.now(timezone.utc).isoformat()
    return {"message": "Update broadcasted successfully", "config": CURRENT_CONFIG}

@router.get("/download-apk")
def download_latest_apk():
    """
    Serves the latest CampusFlow Android APK file.
    If a local file exists in backend/uploads/apk/campusflow.apk, it streams it directly.
    Otherwise redirects to GitHub Releases or configured CDN.
    """
    apk_dir = os.path.join(os.getcwd(), "backend", "uploads", "apk")
    apk_path = os.path.join(apk_dir, "campusflow.apk")
    if os.path.exists(apk_path):
        return FileResponse(
            apk_path,
            media_type="application/vnd.android.package-archive",
            filename="campusflow.apk"
        )

    # Fallback redirect to latest release
    github_release_url = "https://github.com/hunain/campusflow/releases/latest/download/campusflow.apk"
    return RedirectResponse(url=github_release_url)
