import re
from typing import List, Dict, Any
from bs4 import BeautifulSoup

def parse_cms_registered_courses(html: str) -> List[Dict[str, Any]]:
    """
    Parses Bahria University CMS RegisteredCourses.aspx page.
    URL: https://cms.bahria.edu.pk/Sys/Student/CourseRegistration/RegisteredCourses.aspx
    Extracts officially registered courses, course codes, titles, credit hours, and teachers.
    """
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")

    courses: List[Dict[str, Any]] = []

    target_table = None
    for tbl in tables:
        txt = tbl.get_text().lower()
        if ("course" in txt or "code" in txt) and ("title" in txt or "credit" in txt or "teacher" in txt or "status" in txt):
            target_table = tbl
            break

    if not target_table:
        target_table = soup.find(id=re.compile(r"gvRegistered|RegisteredCourses|GridView", re.I))

    if not target_table:
        return []

    rows = target_table.find_all("tr")
    header_indices: Dict[str, int] = {}

    for row in rows:
        cells = row.find_all(["th", "td"])
        cell_texts = [c.get_text(strip=True).lower() for c in cells]
        if any("code" in t or "course" in t for t in cell_texts):
            for idx, t in enumerate(cell_texts):
                if "code" in t:
                    header_indices["code"] = idx
                elif any(k in t for k in ["title", "registered course", "course name"]):
                    header_indices["title"] = idx
                elif any(k in t for k in ["credit", "cr", "hours"]):
                    header_indices["credit_hours"] = idx
                elif any(k in t for k in ["teacher", "instructor"]):
                    header_indices["teacher"] = idx
                elif any(k in t for k in ["class", "section"]):
                    header_indices["section"] = idx
            if header_indices:
                break

    # Default fallback indices if header matching wasn't exact
    if not header_indices:
        header_indices = {
            "code": 1,
            "title": 2,
            "credit_hours": 3,
            "section": 4,
            "teacher": 5,
        }

    for row in rows:
        tds = row.find_all("td")
        if len(tds) < 3:
            continue

        raw_texts = [td.get_text(strip=True) for td in tds]
        first_txt = raw_texts[0]

        # Check if first cell is index or course code
        is_index = first_txt.isdigit()
        is_code = bool(re.match(r"^[A-Z]{2,4}[-\s]?\d{3,4}", first_txt))

        if not is_index and not is_code:
            continue

        def get_val(key: str, default: str = "") -> str:
            idx = header_indices.get(key)
            if idx is not None and idx < len(raw_texts):
                return raw_texts[idx]
            return default

        code = get_val("code")
        title = get_val("title")
        cr_str = get_val("credit_hours", "3")
        teacher = get_val("teacher", "Bahria Faculty")
        section = get_val("section", "")

        # If first_txt was actually code
        if is_code and not code:
            code = first_txt
            if len(raw_texts) > 1 and not title:
                title = raw_texts[1]

        if not code and not title:
            continue

        # Extract numeric credit hours
        cr_match = re.search(r"[\d.]+", cr_str)
        cr_val = float(cr_match.group()) if cr_match else 3.0

        courses.append({
            "code": code.strip(),
            "title": title.strip(),
            "credit_hours": cr_val,
            "teacher": teacher.strip(),
            "section": section.strip(),
            "name": title.strip(),
            "value": code.strip(),
        })

    return courses
