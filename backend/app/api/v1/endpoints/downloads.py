import os
import re
import json
import base64
import urllib.parse
import logging
from typing import Optional, Dict, Tuple
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import httpx
from app.database.session import get_db
from app.api.deps import get_current_university_account
from app.models.user import UniversityAccount, EncryptedSession
from app.models.academic import Course, LectureMaterial, Assignment
from app.downloads.zip_manager import DownloadManager, sanitize_filename
from app.core.security import decrypt_credential, encrypt_credential
from app.scrapers.browser import login_with_browser

logger = logging.getLogger(__name__)

KARACHI_TZ = ZoneInfo("Asia/Karachi")

router = APIRouter(prefix="/downloads", tags=["Downloads & ZIP Exports"])

def refresh_k_url(url: str) -> Tuple[str, str]:
    """
    Bahria LMS encodes studentID,YYYY-MM-DD,... in the base64 'k' query parameter of Download.php.
    If the date in 'k' is from a previous day, Bahria LMS redirects back to the Referer.
    This helper decodes 'k', updates the date component to today's date (Asia/Karachi),
    and re-encodes it so downloads never expire.
    Returns (refreshed_url, referer_header).
    """
    default_referer = "https://lms.bahria.edu.pk/Student/Dashboard.php"
    if not url or "Download.php" not in url or "k=" not in url:
        return url, default_referer

    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        if "k" not in qs:
            return url, default_referer
        k_val = qs["k"][0]
        unquoted = urllib.parse.unquote(k_val)
        raw = base64.b64decode(unquoted).decode("utf-8", errors="ignore")
        parts = raw.split(",")
        referer = default_referer
        if len(parts) >= 6:
            # parts[1] is the date YYYY-MM-DD
            today_str = datetime.now(KARACHI_TZ).strftime("%Y-%m-%d")
            parts[1] = today_str
            # parts[5] is the relative backlink e.g. lms.bahria.edu.pk/Student/LectureNotes.php?...
            backlink = parts[5].strip()
            if backlink:
                referer = f"https://{backlink}" if not backlink.startswith("http") else backlink
            new_raw = ",".join(parts)
            new_k = urllib.parse.quote(base64.b64encode(new_raw.encode("utf-8")).decode("utf-8"))
            new_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?k={new_k}"
            return new_url, referer
    except Exception as e:
        logger.warning(f"Failed to refresh k parameter: {e}")
    return url, default_referer

def cleanup_file(file_path: str):
    """Deletes temporary generated ZIP file after response streaming completes."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass

async def ensure_active_portal_session(
    db: Session,
    account: UniversityAccount,
    force_fresh: bool = False
) -> Dict[str, str]:
    """
    Ensures the student has an active, authenticated session with valid PHPSESSID for Bahria LMS.
    If the session is missing, expired, or rejected, automatically re-authenticates in the background
    using the student's stored credentials and updates the session in the database.
    """
    cookies: Dict[str, str] = {}
    if not force_fresh and account.encrypted_session:
        try:
            sess = account.encrypted_session
            c_json = decrypt_credential(sess.cookies_json_encrypted, sess.nonce)
            cookies = json.loads(c_json)
        except Exception as e:
            logger.warning(f"Could not decrypt session cookies: {e}")

    # Check if cookies exist and contain LMS PHP session cookie
    if cookies and "PHPSESSID" in cookies and not force_fresh:
        try:
            test_url = "https://lms.bahria.edu.pk/Student/Dashboard.php"
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://lms.bahria.edu.pk/Student/Dashboard.php",
            }
            async with httpx.AsyncClient(cookies=cookies, headers=req_headers, verify=False, timeout=6.0, follow_redirects=True) as client:
                r = await client.get(test_url)
                if r.status_code == 200 and "login" not in str(r.url).lower() and "<form" not in r.text[:600].lower():
                    return cookies
        except Exception as e:
            logger.debug(f"Session quick ping check: {e}")

    # Session is expired or missing PHPSESSID -> Re-authenticate with stored credentials
    logger.info(f"Re-authenticating Bahria LMS session for {account.enrollment}...")
    if not account.encrypted_credentials:
        raise HTTPException(
            status_code=401,
            detail="Bahria LMS session has expired. Please log in or refresh your university connection."
        )

    try:
        cred = account.encrypted_credentials
        pwd = decrypt_credential(cred.ciphertext, cred.nonce)
    except Exception as e:
        logger.error(f"Failed to decrypt credentials: {e}")
        raise HTTPException(status_code=401, detail="Could not decrypt university credentials. Please log in again.")

    ok, err, browser_cookies, info = await login_with_browser(
        enrollment=account.enrollment,
        password=pwd,
        campus_name=account.campus_name,
        campus_id=account.campus_id,
        timeout_ms=30000,
        scrape_data=False,
    )

    if not ok or not browser_cookies:
        logger.error(f"Re-authentication failed: {err}")
        raise HTTPException(
            status_code=401,
            detail=f"Bahria LMS session re-authentication failed: {err or 'Invalid credentials'}"
        )

    # Persist the freshly generated session to DB
    try:
        enc_data = encrypt_credential(json.dumps(browser_cookies))
        if not account.encrypted_session:
            account.encrypted_session = EncryptedSession(
                account_id=account.id,
                cookies_json_encrypted=enc_data["ciphertext"],
                nonce=enc_data["nonce"],
                updated_at=datetime.now(timezone.utc),
            )
            db.add(account.encrypted_session)
        else:
            account.encrypted_session.cookies_json_encrypted = enc_data["ciphertext"]
            account.encrypted_session.nonce = enc_data["nonce"]
            account.encrypted_session.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        logger.warning(f"Could not persist session update to DB: {e}")

    logger.info(f"Bahria LMS session successfully renewed for {account.enrollment}.")
    return browser_cookies

@router.get("/file")
async def download_single_file(
    material_id: Optional[str] = Query(None),
    assignment_id: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None, description="'teacher' or 'submission'"),
    url: Optional[str] = Query(None),
    filename: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Downloads authentic course lecture notes, slides, or assignment attachments
    directly from the official Bahria University LMS server.
    Proxies authenticated requests with student session cookies.
    Automatically refreshes expired portal sessions seamlessly on demand.
    """
    target_url = url
    target_name = filename or "document.pdf"

    if material_id:
        mat = db.query(LectureMaterial).filter(
            LectureMaterial.id == material_id,
            LectureMaterial.account_id == account.id
        ).first()
        if mat:
            target_url = mat.file_url
            target_name = mat.file_name or target_name
    elif assignment_id:
        assign = db.query(Assignment).filter(
            Assignment.id == assignment_id,
            Assignment.account_id == account.id
        ).first()
        if assign:
            if target_type == "submission":
                # Check if file was uploaded through app and stored locally
                sub_file_name = assign.submission_attachment_name or filename or "submission.pdf"
                local_path = os.path.join(os.getcwd(), "backend", "uploads", "submissions", f"{assignment_id}_{sub_file_name}")
                if os.path.exists(local_path):
                    return FileResponse(
                        path=local_path,
                        filename=sub_file_name,
                        headers={
                            "Content-Disposition": f'attachment; filename="{sub_file_name}"',
                            "Access-Control-Expose-Headers": "Content-Disposition",
                        }
                    )
                if assign.submission_attachment_url and assign.submission_attachment_url.startswith("http"):
                    target_url = assign.submission_attachment_url
                    target_name = sub_file_name
            elif target_type == "teacher" and assign.teacher_attachment_url:
                target_url = assign.teacher_attachment_url
                target_name = assign.teacher_attachment_name or filename or target_name
            else:
                target_url = url or assign.teacher_attachment_url or assign.attachment_url
                target_name = filename or assign.teacher_attachment_name or assign.attachment_name or target_name

    if not target_url or not target_url.startswith("http"):
        raise HTTPException(
            status_code=404,
            detail="No downloadable file attachment is linked to this item on Bahria University LMS."
        )

    # Ensure active session with valid PHPSESSID
    cookies = await ensure_active_portal_session(db, account)

    # Refresh date in k parameter if needed and extract appropriate referer
    target_url, custom_referer = refresh_k_url(target_url)

    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Referer": custom_referer,
    }

    try:
        async with httpx.AsyncClient(cookies=cookies, headers=req_headers, verify=False, timeout=60.0) as client:
            resp = await client.get(target_url, follow_redirects=True)
            content_type = resp.headers.get("content-type", "").lower()

            # If LMS returned an HTML login redirect, force re-auth once and retry
            if "html" in content_type and ("login" in str(resp.url).lower() or "<form" in resp.text.lower() or "signin" in resp.text.lower()):
                logger.info("Encountered login redirect during download. Re-authenticating and retrying...")
                fresh_cookies = await ensure_active_portal_session(db, account, force_fresh=True)
                target_url, custom_referer = refresh_k_url(target_url)
                req_headers["Referer"] = custom_referer
                resp = await client.get(target_url, cookies=fresh_cookies, headers=req_headers, follow_redirects=True)
                content_type = resp.headers.get("content-type", "").lower()
                if "html" in content_type and ("login" in str(resp.url).lower() or "<form" in resp.text.lower()):
                    raise HTTPException(
                        status_code=401,
                        detail="Bahria LMS session has expired. Please refresh your session in the app."
                    )

            if resp.status_code != 200 or len(resp.content) == 0:
                raise HTTPException(
                    status_code=502,
                    detail=f"Bahria LMS server returned error {resp.status_code} while downloading this file."
                )

            # Extract actual filename from LMS Content-Disposition header if available
            server_filename = None
            cd_header = resp.headers.get("content-disposition", "")
            if cd_header:
                fn_match = re.search(r'filename=["\']?([^"\';\r\n]+)["\']?', cd_header)
                if fn_match:
                    server_filename = fn_match.group(1).strip()

            final_name = sanitize_filename(server_filename or target_name or "document.pdf")
            final_media_type = resp.headers.get("content-type") or "application/octet-stream"

            return Response(
                content=resp.content,
                media_type=final_media_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{final_name}"',
                    "Access-Control-Expose-Headers": "Content-Disposition",
                    "Content-Length": str(len(resp.content)),
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying download from Bahria LMS: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch file from Bahria University LMS: {str(e)}"
        )

@router.get("/course/{course_id}/zip")
async def download_course_zip(
    course_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Downloads all authentic lecture slides and notes directly from Bahria University LMS
    and packages them into a clean, flat, sequentially ordered ZIP archive (no nested week folders, no assignments).
    """
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.account_id == account.id
    ).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    materials = db.query(LectureMaterial).filter(
        LectureMaterial.course_id == course.id,
        LectureMaterial.account_id == account.id
    ).all()

    if not materials:
        raise HTTPException(status_code=400, detail="No lecture slides or notes available for this course on Bahria LMS.")

    # Ensure authenticated LMS session with valid PHPSESSID
    cookies = await ensure_active_portal_session(db, account)

    mat_list = [
        {
            "file_url": m.file_url,
            "file_name": m.file_name,
            "week_number": m.week_number,
            "title": m.title,
        }
        for m in materials
        if m.file_url
    ]

    mgr = DownloadManager(cookies=cookies)
    zip_path = await mgr.create_course_zip(
        course_name=course.title,
        materials=mat_list,
        assignments=None,  # Do not include assignments in course lectures ZIP
    )

    if not os.path.exists(zip_path):
        raise HTTPException(status_code=500, detail="Failed to assemble ZIP archive from Bahria LMS files.")

    background_tasks.add_task(cleanup_file, zip_path)
    filename = os.path.basename(zip_path)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=filename,
    )
