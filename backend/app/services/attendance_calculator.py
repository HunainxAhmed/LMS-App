import math
from typing import Dict, Any

def get_total_semester_contact_hours(credit_hours: float = 3.0, course_title: str = "", course_code: str = "") -> float:
    """
    Returns the total contact hours across the 16-week semester at Bahria University.
    - 3-Credit Theory: 3 hrs/week * 16 weeks = 48 contact hours
    - 2-Credit Theory: 2 hrs/week * 16 weeks = 32 contact hours
    - 1-Credit Lab: 3 hrs/week * 16 weeks = 48 contact hours (Official notice: 48 contact hours for 3-credit & lab courses)
    - 4-Credit Theory: 4 hrs/week * 16 weeks = 64 contact hours
    """
    title_lower = (course_title or "").lower()
    code_upper = (course_code or "").upper()
    is_lab = (
        "lab" in title_lower
        or "laboratory" in title_lower
        or code_upper.startswith("AIL")
        or code_upper.startswith("ITL")
        or code_upper.startswith("CSL")
        or code_upper.startswith("EEL")
        or code_upper.endswith("L")
    )
    if is_lab:
        return 48.0

    if credit_hours >= 4.0:
        return 64.0
    elif credit_hours >= 3.0:
        return 48.0
    elif credit_hours >= 2.0:
        return 32.0
    elif credit_hours >= 1.0:
        return 16.0
    else:
        return 48.0

def calculate_overall_safe_skips(
    absent_hours: float,
    credit_hours: float = 3.0,
    course_title: str = "",
    course_code: str = "",
    required_percentage: float = 75.0,
) -> Dict[str, Any]:
    """
    Calculates safe misses and fine limits based on the overall semester period.
    Matches Bahria University Official Attendance Regulations & LMS+ exactly:
    - Safe Limit (>= 75%): Max absent = floor(Total_Hours * 0.25) -> 12h for 48h courses, 8h for 32h courses.
    - Warning/Fine Limit (>= 60%): Max absent with fine = floor(Total_Hours * 0.40) -> 19h for 48h courses, 12h for 32h courses.
    - Fine: Rs. 500 per absent hour past the safe limit.
    """
    total_contact_hours = get_total_semester_contact_hours(credit_hours, course_title, course_code)

    # 75% threshold
    max_safe_absent = math.floor(total_contact_hours * (1.0 - (required_percentage / 100.0)))

    # 60% warning/fine threshold
    max_absent_with_fine = math.floor(total_contact_hours * 0.40)

    # Safe skips remaining to stay >= 75%
    safe_skips = max(0, int(max_safe_absent - absent_hours))

    # Additional skips allowed with fine (+7 for 48h courses, +4 for 32h courses)
    additional_fine_skips = max(0, int(max_absent_with_fine - max_safe_absent))

    # Remaining fine skips if student has exceeded safe limit
    if absent_hours > max_safe_absent:
        remaining_fine_skips = max(0, int(max_absent_with_fine - absent_hours))
        fine_hours = absent_hours - max_safe_absent
        fine_amount = int(fine_hours * 500)
    else:
        remaining_fine_skips = additional_fine_skips
        fine_amount = 0

    return {
        "total_semester_hours": total_contact_hours,
        "max_safe_absent": max_safe_absent,
        "max_absent_with_fine": max_absent_with_fine,
        "safe_skips": safe_skips,
        "additional_fine_skips": additional_fine_skips,
        "remaining_fine_skips": remaining_fine_skips,
        "fine_amount": fine_amount,
    }

def calculate_safe_misses(
    present: float,
    total: float,
    required_percentage: float = 75.0,
    credit_hours: float = None,
    course_title: str = "",
    course_code: str = "",
    absent_hours: float = None,
) -> int:
    """
    Returns the safe misses remaining.
    If credit_hours or absent_hours is explicitly provided for full semester modeling,
    calculates overall semester safe skips.
    Otherwise, uses the standard formula based on current conducted classes:
    floor(present / (required_percentage / 100.0) - total).
    """
    if credit_hours is not None or absent_hours is not None:
        abs_hrs = absent_hours if absent_hours is not None else max(0.0, total - present)
        skips = calculate_overall_safe_skips(
            absent_hours=abs_hrs,
            credit_hours=credit_hours or 3.0,
            course_title=course_title,
            course_code=course_code,
            required_percentage=required_percentage,
        )
        return skips["safe_skips"]

    if total <= 0 or present <= 0:
        return 0
    max_total = present / (required_percentage / 100.0)
    safe = math.floor(max_total - total)
    return max(0, safe)

def calculate_needed_to_recover(present: float, total: float, required_percentage: float = 75.0) -> int:
    """
    If current attendance is below required percentage, calculates how many consecutive
    classes the student must attend to reach the threshold.
    """
    if total <= 0:
        return 0

    current_pct = (present / total) * 100.0
    if current_pct >= required_percentage:
        return 0

    r = required_percentage / 100.0
    if r >= 1.0:
        return 0

    numerator = (r * total) - present
    denominator = 1.0 - r

    if denominator <= 0 or numerator <= 0:
        return 0

    return max(0, math.ceil(numerator / denominator))

def determine_risk_status(percentage: float, required_percentage: float = 75.0) -> str:
    """
    Bahria University Examination Eligibility:
    - SAFE: >= 75.0%
    - WARNING: 65.0% - 74.9%
    - CRITICAL: < 65.0%
    """
    if percentage >= required_percentage:
        return "SAFE"
    elif percentage >= 65.0:
        return "WARNING"
    else:
        return "CRITICAL"
