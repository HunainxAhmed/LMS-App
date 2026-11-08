import os
import io
import re
import zipfile
import tempfile
import asyncio
import logging
import base64
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from zoneinfo import ZoneInfo
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

KARACHI_TZ = ZoneInfo("Asia/Karachi")

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
            today_str = datetime.now(KARACHI_TZ).strftime("%Y-%m-%d")
            parts[1] = today_str
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

def sanitize_filename(name: str) -> str:
    """Removes invalid path characters for safe filesystem and ZIP extraction."""
    clean = re.sub(r'[\\/*?:"<>|]', "_", name)
    return clean.strip() or "document"

class DownloadManager:
    def __init__(self, cookies: Optional[Dict[str, str]] = None):
        self.cookies = cookies or {}
        self.temp_dir = tempfile.mkdtemp(prefix="campusflow_downloads_")

    async def download_file(
        self,
        url: str,
        dest_path: str,
        client: Optional[httpx.AsyncClient] = None,
        referer: Optional[str] = None
    ) -> bool:
        """Downloads a single file preserving content and handling redirects."""
        should_close = False
        if client is None:
            client = httpx.AsyncClient(cookies=self.cookies, verify=False, timeout=30.0)
            should_close = True

        try:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Referer": referer or "https://lms.bahria.edu.pk/Student/Dashboard.php",
            }
            async with client.stream("GET", url, headers=headers, follow_redirects=True) as resp:
                content_type = resp.headers.get("content-type", "").lower()
                if resp.status_code == 200 and "html" not in content_type:
                    with open(dest_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=16384):
                            f.write(chunk)
                    return os.path.exists(dest_path) and os.path.getsize(dest_path) > 50
                else:
                    logger.warning(f"Failed to download {url}: HTTP {resp.status_code} ({content_type})")
                    return False
        except Exception as e:
            logger.error(f"Download exception for {url}: {e}")
            return False
        finally:
            if should_close:
                await client.aclose()

    async def create_course_zip(
        self,
        course_name: str,
        materials: List[Dict[str, str]],
        assignments: Optional[List[Dict[str, str]]] = None,
        student_name: str = "Hunain Ahmed",
        enrollment: str = "02-136242-009",
    ) -> str:
        """
        Downloads all available course lecture notes and slides in sequential order,
        packages them directly into an organized ZIP archive with sequential numbers,
        without unnecessary nested folders or assignments.
        """
        clean_course_name = sanitize_filename(course_name)
        zip_filename = f"{clean_course_name}_Lectures.zip"
        zip_path = os.path.join(self.temp_dir, zip_filename)

        course_folder = os.path.join(self.temp_dir, clean_course_name)
        os.makedirs(course_folder, exist_ok=True)

        req_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Referer": "https://lms.bahria.edu.pk/Student/Dashboard.php",
        }

        # Natural sequence sorter: Lecture 1 -> Lecture 12
        def extract_seq(m: Dict[str, Any]) -> int:
            combined = f"{m.get('week_number', '')} {m.get('title', '')} {m.get('file_name', '')}"
            match = re.search(r'(?:lecture|week|lab|task|#)?\s*#?\s*0*(\d+)', combined, re.IGNORECASE)
            return int(match.group(1)) if match and match.group(1) else 9999

        sorted_materials = sorted(materials, key=lambda x: (extract_seq(x), x.get("file_name", "")))

        async with httpx.AsyncClient(cookies=self.cookies, headers=req_headers, verify=False, timeout=45.0) as client:
            semaphore = asyncio.Semaphore(4)

            # Download Materials directly into course folder with clean sequence numbers
            async def download_material_task(idx: int, mat: Dict[str, str]):
                async with semaphore:
                    url = mat.get("file_url")
                    raw_name = sanitize_filename(mat.get("file_name") or f"{mat.get('title', f'Lecture_{idx+1}')}.pdf")
                    prefix = f"{idx + 1:02d}_"
                    # Add numeric prefix 01_, 02_ so files stay in sequential order on any device/OS
                    fname = f"{prefix}{raw_name}" if not re.match(r'^\d+[\s_-]', raw_name) else raw_name
                    dest = os.path.join(course_folder, fname)
                    if url and url.startswith("http"):
                        refreshed_url, referer = refresh_k_url(url)
                        await self.download_file(refreshed_url, dest, client, referer=referer)

            tasks = [download_material_task(i, m) for i, m in enumerate(sorted_materials)]
            await asyncio.gather(*tasks, return_exceptions=True)

            total_downloaded = sum(len(files) for _, _, files in os.walk(course_folder))
            if total_downloaded == 0:
                readme_path = os.path.join(course_folder, "README.txt")
                with open(readme_path, "w", encoding="utf-8") as rf:
                    rf.write(f"Course: {course_name}\n\nNotice: No lecture notes or slides were available for download on Bahria LMS.\n")

        # Build ZIP archive: files reside directly at root of ZIP archive in clean sequential order (no subfolders)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(course_folder):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, course_folder)
                    zipf.write(full_p, rel_p)

        return zip_path
