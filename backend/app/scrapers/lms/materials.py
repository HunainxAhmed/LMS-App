import re
import hashlib
from typing import List, Dict, Any
from bs4 import BeautifulSoup

def compute_material_fingerprint(course_name: str, title: str, file_name: str) -> str:
    raw = f"{course_name.strip().lower()}::{title.strip().lower()}::{file_name.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def detect_file_type(file_name: str, url: str) -> str:
    ext_source = file_name if "." in file_name else url
    ext = ext_source.split("?")[0].split(".")[-1].lower()
    if ext in ["pdf", "ppt", "pptx", "doc", "docx", "zip", "rar", "xlsx", "txt"]:
        return ext
    return "document"

from urllib.parse import urlparse, parse_qs
import os

def decode_k_filename(k_param: str) -> str:
    import urllib.parse
    import base64
    try:
        unquoted = urllib.parse.unquote(k_param)
        raw = base64.b64decode(unquoted).decode('utf-8', errors='ignore')
        parts = raw.split(',')
        if len(parts) >= 5:
            return parts[4].strip()
    except Exception:
        pass
    return ''

def parse_materials_html(html: str, course_name: str, base_url: str = "https://lms.bahria.edu.pk") -> List[Dict[str, Any]]:
    """
    Parses lecture notes and materials from LectureNotes.php,
    matching the proven extraction logic from BahriaLmsAdapter.ts and ResourceParser.ts.
    """
    soup = BeautifulSoup(html, "html.parser")
    materials = []

    # Find rows with links or lecture entries
    tables = soup.find_all("table")
    for tbl in tables:
        rows = tbl.find_all("tr")
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < 2:
                continue

            links = row.find_all("a", href=True)
            if not links:
                continue

            for a_tag in links:
                href = a_tag["href"].strip()
                if not href or href == "#" or "javascript" in href.lower():
                    continue

                if not href.startswith("http"):
                    if href.startswith("/"):
                        full_url = f"{base_url.rstrip('/')}{href}"
                    else:
                        full_url = f"{base_url.rstrip('/')}/Student/{href}"
                else:
                    full_url = href

                raw_text = a_tag.get_text().strip()
                # Find week number if mentioned
                week_match = re.search(r'week\s*(\d+)', row.get_text(), re.IGNORECASE)
                num_text = tds[0].get_text().strip()
                week_number = f"Week {week_match.group(1)}" if week_match else (f"Lecture #{num_text}" if num_text.isdigit() else "")

                # Title from column or link text
                title = tds[1].get_text().strip() if len(tds) > 1 else raw_text
                if not title or title.lower() in ["download", "view", "click here", "link"]:
                    title = raw_text or f"Lecture Material"
                title = re.sub(r'\s+', ' ', title).strip()

                # Extract real filename from k parameter if present (matches Bahria LMS Download.php?k=...)
                file_name = ""
                k_match = re.search(r'k=([^&]+)', href)
                if k_match:
                    file_name = decode_k_filename(k_match.group(1))

                if not file_name:
                    file_name = a_tag.get("download", "").strip()

                if not file_name:
                    try:
                        parsed_u = urlparse(full_url)
                        qs = parse_qs(parsed_u.query)
                        for qk in ["file", "filename", "f", "doc"]:
                            if qk in qs and qs[qk]:
                                file_name = os.path.basename(qs[qk][0])
                                break
                        if not file_name:
                            candidate = os.path.basename(parsed_u.path)
                            if candidate and not candidate.lower().endswith((".php", ".aspx", ".html", ".htm")):
                                file_name = candidate
                    except Exception:
                        pass

                clean_title_slug = re.sub(r'[^a-zA-Z0-9_\- ]', '', title).strip().replace(' ', '_')
                if not file_name or file_name.lower().endswith((".php", ".aspx", ".html", ".htm")):
                    file_name = f"{clean_title_slug or 'Lecture_Material'}.pdf"

                file_type = detect_file_type(file_name, href)
                fingerprint = compute_material_fingerprint(course_name, title, file_name)

                materials.append({
                    "course_name": course_name,
                    "week_number": week_number,
                    "title": title,
                    "description": row.get_text().strip(),
                    "file_name": file_name,
                    "file_url": full_url,
                    "file_type": file_type,
                    "fingerprint": fingerprint,
                })

    return materials
