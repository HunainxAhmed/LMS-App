import re
import hashlib
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup

KARACHI_TZ = ZoneInfo("Asia/Karachi")

MONTH_DICT = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
}

def parse_deadline_text(deadline_text: str) -> Optional[datetime]:
    """
    Parses Bahria University deadline string into a timezone-aware datetime (Asia/Karachi).
    Handles patterns such as:
      - 15 November 2025 11:59 pm
      - 15 Nov 2025 23:59
      - 15-11-2025 11:59 PM
      - 15 November 2025
    """
    if not deadline_text or not deadline_text.strip():
        return None

    text = deadline_text.strip().lower()

    # Pattern 1: Day Month Year Hour:Min am/pm
    p1 = r'(\d{1,2})[\s\-]+([a-z]+)[\s\-]+(\d{4})[\s:\-]+(\d{1,2}):(\d{2})\s*(am|pm)?'
    m1 = re.search(p1, text)
    if m1:
        day = int(m1.group(1))
        month_str = m1.group(2)
        year = int(m1.group(3))
        hour = int(m1.group(4))
        minute = int(m1.group(5))
        ampm = m1.group(6)

        month = MONTH_DICT.get(month_str, 1)
        if ampm == 'pm' and hour < 12:
            hour += 12
        elif ampm == 'am' and hour == 12:
            hour = 0

        try:
            return datetime(year, month, day, hour, minute, tzinfo=KARACHI_TZ)
        except ValueError:
            pass

    # Pattern 2: Day Month Year (without specific time -> default 23:59:59)
    p2 = r'(\d{1,2})[\s\-]+([a-z]+)[\s\-]+(\d{4})'
    m2 = re.search(p2, text)
    if m2:
        day = int(m2.group(1))
        month_str = m2.group(2)
        year = int(m2.group(3))
        month = MONTH_DICT.get(month_str, 1)
        try:
            return datetime(year, month, day, 23, 59, 0, tzinfo=KARACHI_TZ)
        except ValueError:
            pass

    # Pattern 3: YYYY-MM-DD HH:MM:SS
    p3 = r'(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2}))?'
    m3 = re.search(p3, text)
    if m3:
        year = int(m3.group(1))
        month = int(m3.group(2))
        day = int(m3.group(3))
        hour = int(m3.group(4)) if m3.group(4) else 23
        minute = int(m3.group(5)) if m3.group(5) else 59
        try:
            return datetime(year, month, day, hour, minute, tzinfo=KARACHI_TZ)
        except ValueError:
            pass

    return None

def compute_assignment_fingerprint(course_name: str, assignment_number: str, title: str) -> str:
    """Stable hash to identify unique assignment records."""
    raw = f"{course_name.strip().lower()}::{assignment_number.strip().lower()}::{title.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

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

def parse_assignments_html(html: str, course_name: str, base_url: str = "https://lms.bahria.edu.pk") -> List[Dict[str, Any]]:
    """
    Parses assignments table from LMS Assignments.php page.
    Matches the official Bahria University LMS structure:
    Col 0: Assign. No.
    Col 1: Title
    Col 2: Assignment (Solution File) Remarks -> Faculty download link (Download.php?k=...)
    Col 3: Added Submission -> Student submission download link (Download.php?k=...)
    Col 4: Marks Obtained
    Col 5: Returned Submission
    Col 6: Action -> "Deadline Exceeded" or "Submit"
    Col 7: Deadline
    """
    soup = BeautifulSoup(html, "html.parser")
    assignments = []
    now = datetime.now(KARACHI_TZ)

    tables = soup.find_all("table")
    assign_table = None
    for tbl in tables:
        txt = tbl.get_text().lower()
        if "assign" in txt or "deadline" in txt or "due date" in txt or "submission" in txt:
            assign_table = tbl
            break

    if not assign_table:
        return []

    rows = assign_table.find_all("tr")
    for row in rows:
        tds = row.find_all("td")
        if len(tds) < 4:
            continue

        first_txt = tds[0].get_text().strip()
        if not first_txt.isdigit():
            continue

        assign_num = first_txt
        is_extended = False
        extended_deadline_dt = None
        extended_deadline_raw = ""
        original_deadline_dt = None
        original_deadline_raw = ""
        extension_type = ""
        can_submit = True
        can_reupload = False
        lms_assign_id = ""
        lms_oc_id = ""
        lms_student_id = ""

        if len(tds) >= 8:
            # 8-column official Bahria LMS layout
            title = tds[1].get_text().strip()
            assign_file_cell = tds[2]
            sub_cell = tds[3]
            action_cell_raw = tds[6]
            action_cell = action_cell_raw.get_text().strip()
            deadline_cell = tds[7]

            # Parse deadline badges (Bahria LMS marks extended deadlines in label-warning, actual in label-info)
            warning_tag = deadline_cell.find(lambda t: t.name in ["small", "span"] and ("label-warning" in t.get("class", []) or "extend" in t.get("title", "").lower()))
            info_tag = deadline_cell.find(lambda t: t.name in ["small", "span"] and ("label-info" in t.get("class", []) or "actual" in t.get("title", "").lower()))
            all_smalls = deadline_cell.find_all(["small", "span"])

            if warning_tag:
                is_extended = True
                extended_deadline_raw = warning_tag.get_text().strip()
                extended_deadline_dt = parse_deadline_text(extended_deadline_raw)
                w_title = warning_tag.get("title", "").lower()
                if "missing" in w_title or "missing" in action_cell.lower():
                    extension_type = "missing_only"
                else:
                    extension_type = "everyone"

                if info_tag:
                    original_deadline_raw = info_tag.get_text().strip()
                    original_deadline_dt = parse_deadline_text(original_deadline_raw)
                elif len(all_smalls) > 1:
                    original_deadline_raw = all_smalls[1].get_text().strip()
                    original_deadline_dt = parse_deadline_text(original_deadline_raw)
                else:
                    original_deadline_raw = extended_deadline_raw
                    original_deadline_dt = extended_deadline_dt
            elif info_tag:
                is_extended = False
                original_deadline_raw = info_tag.get_text().strip()
                original_deadline_dt = parse_deadline_text(original_deadline_raw)
            else:
                raw_dl = deadline_cell.get_text().strip()
                is_extended = False
                original_deadline_raw = raw_dl
                original_deadline_dt = parse_deadline_text(raw_dl)

            effective_deadline_dt = extended_deadline_dt if (is_extended and extended_deadline_dt) else original_deadline_dt
            effective_deadline_raw = extended_deadline_raw if (is_extended and extended_deadline_raw) else original_deadline_raw
            deadline_dt = effective_deadline_dt
            deadline_text = effective_deadline_raw

            # Check if submit modal is present for this assignment
            submit_a = action_cell_raw.find("a", attrs={"data-target": True})
            if submit_a:
                target_modal_id = submit_a["data-target"].lstrip("#")
                modal_div = soup.find("div", id=target_modal_id)
                if modal_div:
                    inp_a = modal_div.find("input", {"name": "assignmentID"})
                    inp_o = modal_div.find("input", {"name": "offeredCourseID"}) or modal_div.find("input", {"name": "ocID"})
                    inp_s = modal_div.find("input", {"name": "studentID"})
                    if inp_a: lms_assign_id = inp_a.get("value", "")
                    if inp_o: lms_oc_id = inp_o.get("value", "")
                    if inp_s: lms_student_id = inp_s.get("value", "")

            # Faculty assignment brief link
            assign_a = assign_file_cell.find("a", href=re.compile(r"Download\.php\?k=", re.I))
            assign_url = ""
            assign_fname = ""
            if assign_a:
                href = assign_a["href"].strip()
                assign_url = f"{base_url.rstrip('/')}/Student/{href}" if not href.startswith("http") else href
                k_match = re.search(r"k=([^&]+)", href)
                if k_match:
                    assign_fname = decode_k_filename(k_match.group(1))

            # Student submission link
            sub_a = sub_cell.find("a", href=re.compile(r"Download\.php\?k=", re.I))
            sub_url = ""
            sub_fname = ""
            if sub_a:
                href = sub_a["href"].strip()
                sub_url = f"{base_url.rstrip('/')}/Student/{href}" if not href.startswith("http") else href
                k_match = re.search(r"k=([^&]+)", href)
                if k_match:
                    sub_fname = decode_k_filename(k_match.group(1))

            description = f"Official Bahria LMS Assignment {assign_num}"
        else:
            # 5-6 column standard fixture / alternative layout
            title = tds[1].get_text().strip()
            description = tds[2].get_text().strip() if len(tds) > 2 else ""
            deadline_text = tds[3].get_text().strip() if len(tds) > 3 else ""
            attach_cell = tds[4] if len(tds) > 4 else None
            status_text = tds[5].get_text().strip().lower() if len(tds) > 5 else ""
            action_cell = status_text

            deadline_dt = parse_deadline_text(deadline_text)
            original_deadline_dt = deadline_dt
            original_deadline_raw = deadline_text

            assign_url = ""
            assign_fname = ""
            sub_url = ""
            sub_fname = ""
            if attach_cell:
                a_tag = attach_cell.find("a")
                if a_tag:
                    assign_fname = a_tag.get_text().strip()
                    href = a_tag.get("href", "").strip()
                    assign_url = f"{base_url.rstrip('/')}{href}" if href.startswith("/") else href

            if "submitted" in status_text:
                sub_url = assign_url
                sub_fname = assign_fname

        # Determine deadline passage
        is_passed = False
        days_left = None
        if deadline_dt:
            is_passed = deadline_dt < now
            if not is_passed:
                diff = deadline_dt - now
                days_left = max(0, diff.days)
            else:
                days_left = 0

        # Only force is_passed due to action text if NOT extended or if extended deadline actually passed
        if "deadline exceeded" in action_cell.lower() or "overdue" in action_cell.lower():
            if not is_extended:
                is_passed = True
                days_left = 0
            elif is_passed:
                days_left = 0

        # Determine status and submission permissions
        if len(tds) >= 8:
            has_submission = bool(sub_url or ("submission" in sub_cell.get_text().strip().lower() and "no submission" not in sub_cell.get_text().strip().lower()))
            if has_submission:
                sub_status = "SUBMITTED"
                # If deadline is extended for everyone and not yet passed, student can delete and re-upload!
                if is_extended and extension_type == "everyone" and not is_passed:
                    can_reupload = True
                    can_submit = True
                else:
                    can_reupload = False
                    can_submit = False
            else:
                if not is_passed:
                    sub_status = "PENDING"
                    can_submit = True
                    can_reupload = False
                else:
                    sub_status = "OVERDUE"
                    can_submit = False
                    can_reupload = False
        else:
            if "submitted" in action_cell.lower():
                sub_status = "SUBMITTED"
                can_submit = False
                can_reupload = False
            elif is_passed:
                sub_status = "OVERDUE"
                can_submit = False
                can_reupload = False
            else:
                sub_status = "PENDING"
                can_submit = True
                can_reupload = False

        primary_url = assign_url or sub_url
        primary_name = assign_fname or sub_fname or f"{title}.pdf"
        fingerprint = compute_assignment_fingerprint(course_name, assign_num, title)

        assignments.append({
            "course_name": course_name,
            "assignment_number": assign_num,
            "title": title,
            "description": description,
            "deadline": deadline_dt,
            "deadline_raw": deadline_text,
            "days_left": days_left,
            "is_passed": is_passed,
            "is_extended": is_extended,
            "extended_deadline": extended_deadline_dt,
            "extended_deadline_raw": extended_deadline_raw,
            "original_deadline": original_deadline_dt,
            "original_deadline_raw": original_deadline_raw,
            "extension_type": extension_type,
            "can_submit": can_submit,
            "can_reupload": can_reupload,
            "lms_assignment_id": lms_assign_id,
            "lms_offered_course_id": lms_oc_id,
            "lms_student_id": lms_student_id,
            "attachment_url": primary_url,
            "attachment_name": primary_name,
            "teacher_attachment_url": assign_url,
            "teacher_attachment_name": assign_fname,
            "submission_attachment_url": sub_url,
            "submission_attachment_name": sub_fname,
            "submission_status": sub_status,
            "fingerprint": fingerprint,
        })

    return assignments
