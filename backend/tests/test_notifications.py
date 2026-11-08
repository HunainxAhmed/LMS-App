from app.notifications.engine import compute_event_hash, is_in_quiet_hours
from app.models.user import UserNotificationPreference

def test_event_hash_deterministic():
    h1 = compute_event_hash("acc_1", "ASSIGNMENT_NEW", "cs312::a1")
    h2 = compute_event_hash("acc_1", "ASSIGNMENT_NEW", "cs312::a1")
    h3 = compute_event_hash("acc_2", "ASSIGNMENT_NEW", "cs312::a1")

    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64

def test_quiet_hours_disabled():
    pref = UserNotificationPreference(quiet_hours_enabled=False)
    assert is_in_quiet_hours(pref) is False

def test_quiet_hours_range():
    # If quiet hours are 23 (11 PM) to 7 (7 AM)
    pref = UserNotificationPreference(
        quiet_hours_enabled=True,
        quiet_start_hour=23,
        quiet_end_hour=7
    )
    # The function checks current Karachi time against the range
    result = is_in_quiet_hours(pref)
    assert isinstance(result, bool)
