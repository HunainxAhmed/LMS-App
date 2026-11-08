from app.services.attendance_calculator import (
    calculate_safe_misses,
    calculate_needed_to_recover,
    determine_risk_status,
)

def test_safe_misses_prompt_example():
    """
    Prompt requirement example:
    12 out of 15 hours, required 75%:
    12 / 15 = 80%.
    floor(12 / 0.75 - 15) = floor(16 - 15) = 1.
    Student can safely miss 1 more hour.
    """
    safe = calculate_safe_misses(present=12.0, total=15.0, required_percentage=75.0)
    assert safe == 1

def test_safe_misses_at_exact_threshold():
    """15 out of 20 = 75%. floor(15 / 0.75 - 20) = floor(20 - 20) = 0."""
    safe = calculate_safe_misses(present=15.0, total=20.0, required_percentage=75.0)
    assert safe == 0

def test_safe_misses_below_threshold_clamped_to_zero():
    """
    14 out of 20 = 70% (<75%).
    floor(14 / 0.75 - 20) = floor(18.66 - 20) = -2.
    Must clamp negative results to 0.
    """
    safe = calculate_safe_misses(present=14.0, total=20.0, required_percentage=75.0)
    assert safe == 0

def test_safe_misses_high_attendance():
    """
    28 attended out of 30 conducted, required 75%:
    floor(28 / 0.75 - 30) = floor(37.33 - 30) = 7 safe misses!
    """
    safe = calculate_safe_misses(present=28.0, total=30.0, required_percentage=75.0)
    assert safe == 7

def test_needed_to_recover():
    """
    If student has attended 14 out of 20 (70%),
    to reach 75%: ceil((0.75 * 20 - 14) / (1 - 0.75)) = ceil((15 - 14) / 0.25) = ceil(4.0) = 4.
    Verify: (14 + 4) / (20 + 4) = 18 / 24 = 75%.
    """
    needed = calculate_needed_to_recover(present=14.0, total=20.0, required_percentage=75.0)
    assert needed == 4

def test_risk_status_classification():
    # >= 75% -> SAFE
    assert determine_risk_status(85.0, 75.0) == "SAFE"
    assert determine_risk_status(75.0, 75.0) == "SAFE"

    # Between 65.0% and 74.9% -> WARNING
    assert determine_risk_status(74.5, 75.0) == "WARNING"
    assert determine_risk_status(65.0, 75.0) == "WARNING"

    # < 65.0% -> CRITICAL
    assert determine_risk_status(64.9, 75.0) == "CRITICAL"
    assert determine_risk_status(50.0, 75.0) == "CRITICAL"
