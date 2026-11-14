import re
from typing import Dict, Any, List
from bs4 import BeautifulSoup

def parse_cms_exam_results(html: str) -> Dict[str, Any]:
    """
    Parses Bahria University CMS ExamResult.aspx page.
    Extracts official grades, SGPA, CGPA, and course history across all semesters.
    URL: https://cms.bahria.edu.pk/Sys/Student/Exams/ExamResult.aspx
    """
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")

    semesters = []
    total_completed_credits = 0.0
    latest_cgpa = 0.0
    latest_sgpa = 0.0

    for tbl in tables:
        caption = tbl.find("caption")
        if not caption:
            continue
        sem_name = caption.get_text(strip=True)
        if not any(k in sem_name.lower() for k in ["fall", "spring", "summer"]):
            continue

        rows = tbl.find_all("tr")
        if not rows:
            continue

        # Extract GPA & CGPA from the last row
        last_row_text = rows[-1].get_text(" ", strip=True)
        sgpa_match = re.search(r"GPA:\s*([\d.]+)", last_row_text)
        cgpa_match = re.search(r"CGPA:\s*([\d.]+)", last_row_text)

        sgpa = float(sgpa_match.group(1)) if sgpa_match else None
        cgpa = float(cgpa_match.group(1)) if cgpa_match else None

        is_in_progress = (sgpa is None and cgpa is None) or "N/A" in last_row_text

        courses = []
        sem_credits = 0.0

        for r in rows:
            tds = [td.get_text(strip=True) for td in r.find_all(["th", "td"])]
            if not tds or not tds[0].isdigit():
                continue

            # Layout: [#, Code, Title, Majors, Credit Hours, Grade, Grade Points, Product]
            code = tds[1] if len(tds) > 1 else ""
            title = tds[2] if len(tds) > 2 else ""
            cr_str = tds[4] if len(tds) > 4 else "0"
            grade = tds[5] if len(tds) > 5 else "N/A"
            gp_str = tds[6] if len(tds) > 6 else "0"

            try:
                cr = float(cr_str)
            except ValueError:
                cr = 0.0

            try:
                gp = float(gp_str)
            except ValueError:
                gp = 0.0

            courses.append({
                "code": code,
                "title": title,
                "credit_hours": cr,
                "grade": grade,
                "grade_points": gp,
                "is_passed": grade not in ["F", "I", "W", "N/A"],
            })
            sem_credits += cr

        if not is_in_progress:
            total_completed_credits += sem_credits
            if cgpa is not None:
                latest_cgpa = cgpa
            if sgpa is not None:
                latest_sgpa = sgpa

        semesters.append({
            "semester_name": sem_name,
            "sgpa": sgpa,
            "cgpa": cgpa,
            "credit_hours": sem_credits,
            "is_in_progress": is_in_progress,
            "courses": courses,
        })

    completed_semesters = [s for s in semesters if not s["is_in_progress"]]

    return {
        "cgpa": latest_cgpa,
        "current_sgpa": latest_sgpa,
        "total_credits": total_completed_credits,
        "completed_semesters_count": len(completed_semesters),
        "semesters": semesters,
    }
