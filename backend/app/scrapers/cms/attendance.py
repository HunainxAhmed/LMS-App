import re
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup
from app.services.attendance_calculator import calculate_safe_misses, calculate_overall_safe_skips, determine_risk_status

def parse_attendance_html(html: str, required_percentage: float = 75.0) -> List[Dict[str, Any]]:
    """
    Parses the Bahria University CMS StudentWiseAttendance table.
    URL: https://cms.bahria.edu.pk/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx
    """
    soup = BeautifulSoup(html, "html.parser")
    courses = []

    # Find the main attendance table
    target_table = None
    for table in soup.find_all("table"):
        table_text = table.get_text().lower()
        if ("present" in table_text or "absent" in table_text) and ("course" in table_text or "code" in table_text):
            target_table = table
            break

    if not target_table:
        # Fallback to ID match
        target_table = soup.find(id=re.compile(r"GridView|Attendance|gvAttendance", re.I))

    if not target_table:
        return []

    rows = target_table.find_all("tr")
    if not rows:
        return []

    # Map headers dynamically
    header_map: Dict[str, int] = {}
    for row in rows:
        ths = row.find_all(["th", "td"])
        if len(ths) >= 4:
            for idx, th in enumerate(ths):
                txt = th.get_text().strip().lower()
                if "code" in txt:
                    header_map["code"] = idx
                elif any(k in txt for k in ["credit", "credithours", "cr"]):
                    header_map["credit_hours"] = idx
                elif any(k in txt for k in ["course", "title", "registered"]):
                    header_map["title"] = idx
                elif any(k in txt for k in ["teacher", "instructor"]):
                    header_map["teacher"] = idx
                elif "present" in txt:
                    header_map["present"] = idx
                elif "absent" in txt:
                    header_map["absent"] = idx
                elif "total" in txt:
                    header_map["total"] = idx
            if header_map:
                break

    # Default CMS column indices fallback if headers weren't detected
    # Default layout: [#, Code, Registered Course Title, Credit Hours, Majors, Offered Course, Class, Teacher, Fee, Present, Absent, Total, Actions]
    if not header_map:
        header_map = {
            "code": 1,
            "title": 2,
            "credit_hours": 3,
            "teacher": 7,
            "present": 9,
            "absent": 10,
            "total": 11,
        }

    def parse_float_from_cell(raw_text: str) -> float:
        if not raw_text:
            return 0.0
        # Check if cell contains something like "19.0 :90.48%"
        match = re.search(r"([\d.]+)", raw_text.strip())
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return 0.0
        return 0.0

    for row in rows:
        tds = row.find_all("td")
        if len(tds) < 4:
            continue

        first_txt = tds[0].get_text().strip()
        # Data rows start with index number
        if not first_txt.isdigit():
            continue

        def get_text_at(key: str, default: str = "") -> str:
            idx = header_map.get(key)
            if idx is not None and idx < len(tds):
                return tds[idx].get_text().strip()
            return default

        code = get_text_at("code", f"COURSE_{first_txt}")
        title = get_text_at("title", f"Course {first_txt}")
        credit_raw = get_text_at("credit_hours", "3")
        credit_hrs = parse_float_from_cell(credit_raw) or 3.0
        teacher = get_text_at("teacher", "Instructor")

        present_raw = get_text_at("present", "0")
        absent_raw = get_text_at("absent", "0")
        total_raw = get_text_at("total", "0")

        present_hrs = parse_float_from_cell(present_raw)
        absent_hrs = parse_float_from_cell(absent_raw)
        total_hrs = parse_float_from_cell(total_raw)

        # Check if percentage is directly provided in present cell (e.g. "19.0 :90.48%")
        pct_match = re.search(r"([\d.]+)%", present_raw)
        if pct_match:
            try:
                percentage = round(float(pct_match.group(1)), 2)
            except ValueError:
                percentage = round((present_hrs / total_hrs * 100), 2) if total_hrs > 0 else 0.0
        else:
            percentage = round((present_hrs / total_hrs * 100), 2) if total_hrs > 0 else 0.0

        # Calculate safe misses from overall semester period (Bahria policy: 48h for 3-credit/lab, 32h for 2-credit)
        skips = calculate_overall_safe_skips(
            absent_hours=absent_hrs,
            credit_hours=credit_hrs,
            course_title=title,
            course_code=code,
            required_percentage=required_percentage,
        )
        safe_misses = skips["safe_skips"]
        fine_skips = skips["additional_fine_skips"]
        fine_amount = skips["fine_amount"]
        total_semester_hrs = skips["total_semester_hours"]

        risk_status = determine_risk_status(percentage, required_percentage)

        # Check if row has AttendanceSummary link
        detail_a = row.find("a", href=lambda h: h and "attendancesummary.aspx" in h.lower())
        detail_url = ""
        if detail_a:
            href = detail_a["href"].strip()
            if href.startswith("http"):
                detail_url = href
            else:
                detail_url = f"https://cms.bahria.edu.pk/Sys/Student/ClassAttendance/{href.lstrip('/')}"

        courses.append({
            "code": code,
            "title": title,
            "teacher": teacher,
            "credit_hours": credit_hrs,
            "detail_url": detail_url,
            "present_hours": present_hrs,
            "absent_hours": absent_hrs,
            "total_hours": total_hrs,
            "total_semester_hours": total_semester_hrs,
            "percentage": percentage,
            "safe_misses": safe_misses,
            "fine_skips": fine_skips,
            "fine_amount": fine_amount,
            "risk_status": risk_status,
        })

    return courses

def parse_attendance_summary_html(html: str) -> List[Dict[str, Any]]:
    """
    Parses Bahria University CMS detailed AttendanceSummary.aspx page.
    Extracts individual class sessions with real dates, conduct types, topics/remarks, and present/absent status.
    """
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    sessions = []

    # Locate class sessions table (Table with 'Class Date', 'Present Hours', 'Absent Hours')
    target_table = None
    for tbl in tables:
        txt = tbl.get_text().lower()
        if "class date" in txt and ("present" in txt or "absent" in txt):
            target_table = tbl
            break

    if not target_table and len(tables) > 1:
        target_table = tables[1]

    if not target_table:
        return []

    rows = target_table.find_all("tr")
    for r in rows:
        tds = r.find_all("td")
        if len(tds) < 8:
            continue
        first_txt = tds[0].get_text(strip=True)
        if not first_txt.isdigit():
            continue

        class_num = first_txt
        class_date = tds[1].get_text(strip=True)
        class_type = tds[2].get_text(strip=True) or "Class"
        room = tds[3].get_text(strip=True)
        remarks_raw = tds[4].get_text(" | ", strip=True)

        def to_float(txt: str) -> float:
            m = re.search(r"([\d.]+)", txt)
            return float(m.group(1)) if m else 0.0

        total_hrs = to_float(tds[5].get_text(strip=True))
        present_hrs = to_float(tds[6].get_text(strip=True))
        absent_hrs = to_float(tds[7].get_text(strip=True))

        # Status determination: if absent_hours > 0 or present_hours == 0 -> ABSENT, else PRESENT
        status = "ABSENT" if (absent_hrs > 0 or present_hrs == 0) else "PRESENT"

        day_name = ""
        if "," in class_date:
            day_name = class_date.split(",")[0].strip()

        duration_label = f"{int(total_hrs) if total_hrs.is_integer() else total_hrs}h"
        slot_label = f"{class_type} ({duration_label})" if duration_label != "0h" else class_type

        sessions.append({
            "session_number": class_num,
            "session_date": class_date,
            "day_name": day_name,
            "slot_info": slot_label,
            "status": status,
            "remarks": remarks_raw or "Official CMS Class Record",
            "present_hours": present_hrs,
            "absent_hours": absent_hrs,
            "total_hours": total_hrs,
        })

    return sessions
