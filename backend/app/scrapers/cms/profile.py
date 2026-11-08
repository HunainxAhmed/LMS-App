import re
from typing import Dict, Any, Optional
from bs4 import BeautifulSoup

def parse_cms_profile(html: str) -> Dict[str, str]:
    """
    Extracts student name, enrollment, program, and semester from CMS Dashboard HTML.
    URL: https://cms.bahria.edu.pk/Sys/Student/Dashboard.aspx
    """
    soup = BeautifulSoup(html, "html.parser")
    profile = {
        "full_name": "",
        "enrollment": "",
        "program": "",
        "current_semester": "",
    }

    # Common ID/selectors for student details on ASP.NET CMS
    name_el = soup.find(id=re.compile(r"lblStudentName|lblName|StudentName", re.I))
    if name_el:
        profile["full_name"] = name_el.get_text().strip()

    enroll_el = soup.find(id=re.compile(r"lblEnrollment|lblRegNo|Enrollment", re.I))
    if enroll_el:
        profile["enrollment"] = enroll_el.get_text().strip()

    prog_el = soup.find(id=re.compile(r"lblProgram|ProgramName|Degree", re.I))
    if prog_el:
        profile["program"] = prog_el.get_text().strip()

    sem_el = soup.find(id=re.compile(r"lblSemester|CurrentSemester", re.I))
    if sem_el:
        profile["current_semester"] = sem_el.get_text().strip()

    # If elements with IDs weren't found, look for text patterns like "Welcome, John Doe" or tables
    if not profile["full_name"]:
        welcome_match = re.search(r"welcome\s*,\s*([A-Za-z\s]+)", html, re.I)
        if welcome_match:
            candidate = welcome_match.group(1).strip()
            if len(candidate) < 50:
                profile["full_name"] = candidate

    return profile
