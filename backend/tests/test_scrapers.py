import os
from app.scrapers.cms.attendance import parse_attendance_html
from app.scrapers.lms.assignments import parse_assignments_html, parse_deadline_text
from app.scrapers.lms.materials import parse_materials_html

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def read_fixture(name: str) -> str:
    path = os.path.join(FIXTURES_DIR, name)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def test_parse_cms_attendance_fixture():
    html = read_fixture("cms_attendance.html")
    records = parse_attendance_html(html, required_percentage=75.0)

    assert len(records) == 3

    # Check Course 1: Database Systems
    c1 = records[0]
    assert c1["code"] == "CS-312"
    assert c1["title"] == "Database Systems"
    assert c1["teacher"] == "Dr. Muhammad Usman"
    assert c1["present_hours"] == 24.0
    assert c1["absent_hours"] == 6.0
    assert c1["total_hours"] == 30.0
    assert c1["percentage"] == 80.0
    assert c1["safe_misses"] == 2  # floor(24 / 0.75 - 30) = 2
    assert c1["risk_status"] == "SAFE"

    # Check Course 2: Algorithms
    c2 = records[1]
    assert c2["code"] == "CS-320"
    assert c2["percentage"] == 69.23
    assert c2["safe_misses"] == 0
    assert c2["risk_status"] == "WARNING"

def test_parse_lms_assignments_fixture():
    html = read_fixture("lms_assignments.html")
    assignments = parse_assignments_html(html, course_name="Database Systems")

    assert len(assignments) == 2

    a1 = assignments[0]
    assert a1["assignment_number"] == "1"
    assert "ERD Modeling" in a1["title"]
    assert "15 November 2026" in a1["deadline_raw"]
    assert a1["deadline"] is not None
    assert "ERD_Specs.pdf" in a1["attachment_name"]
    assert len(a1["fingerprint"]) == 64

    a2 = assignments[1]
    assert a2["assignment_number"] == "2"
    assert a2["submission_status"] == "SUBMITTED"

def test_parse_lms_materials_fixture():
    html = read_fixture("lms_materials.html")
    materials = parse_materials_html(html, course_name="Database Systems")

    assert len(materials) == 3

    m1 = materials[0]
    assert m1["week_number"] == "Week 01"
    assert "DB_Week01_Architecture.pdf" in m1["file_name"]
    assert m1["file_type"] == "pdf"

    m2 = materials[1]
    assert m2["week_number"] == "Week 02"
    assert "DB_Week02_RelationalModel.pptx" in m2["file_name"]
    assert m2["file_type"] == "pptx"

def test_deadline_regex_variations():
    dt1 = parse_deadline_text("10 November 2026 11:59 pm")
    assert dt1 is not None
    assert dt1.day == 10
    assert dt1.month == 11
    assert dt1.year == 2026
    assert dt1.hour == 23
    assert dt1.minute == 59

    dt2 = parse_deadline_text("05-Dec-2026 09:30 AM")
    assert dt2 is not None
    assert dt2.day == 5
    assert dt2.month == 12
    assert dt2.hour == 9
    assert dt2.minute == 30

def test_login_with_browser_resilience_under_selector_loop():
    import sys
    import asyncio
    from unittest.mock import patch
    from app.scrapers.browser import login_with_browser

    # Mock _async_browser_login to verify dispatching without real network I/O
    async def mock_async_login(enrollment, password, campus_name, campus_id, timeout_ms=25000, headless=True, *args, **kwargs):
        return (False, "Invalid Enrollment ID or Password", {}, {})

    with patch("app.scrapers.browser._async_browser_login", side_effect=mock_async_login):
        if sys.platform == "win32":
            selector_loop = asyncio.SelectorEventLoop()
            asyncio.set_event_loop(selector_loop)
            try:
                success, msg, cookies, info = selector_loop.run_until_complete(
                    login_with_browser("02-134212-001", "pass", "Karachi Campus", "2")
                )
                assert success is False
                assert "Invalid Enrollment" in msg
            finally:
                selector_loop.close()
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                asyncio.set_event_loop(asyncio.new_event_loop())
