from fastapi.testclient import TestClient
from app.main import app
from app.database.session import engine, Base
from app.models import User, UniversityAccount

Base.metadata.create_all(bind=engine)

client = TestClient(app)

def test_health_check_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "server_time_karachi" in data

def test_attendance_calculation_endpoint():
    resp = client.post(
        "/api/v1/attendance/calculate",
        json={"present_hours": 24.0, "total_hours": 30.0, "required_percentage": 75.0}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["current_percentage"] == 80.0
    assert data["safe_misses"] == 2
    assert data["status"] == "SAFE"

def test_user_registration_and_login_flow():
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "SecurePassword123!"

    # 1. Register
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": pwd}
    )
    assert reg_resp.status_code == 201
    tokens = reg_resp.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens

    # 2. Login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": pwd}
    )
    assert login_resp.status_code == 200
    login_tokens = login_resp.json()
    assert "access_token" in login_tokens

    # 3. Access Protected Profile
    auth_header = {"Authorization": f"Bearer {login_tokens['access_token']}"}
    me_resp = client.get("/api/v1/auth/me", headers=auth_header)
    assert me_resp.status_code == 200
    profile = me_resp.json()
    assert profile["email"] == email

def test_notifications_endpoints():
    import uuid
    from app.database.session import SessionLocal
    from app.models.notification import NotificationEvent

    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "SecurePassword123!"

    reg_resp = client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
    tokens = reg_resp.json()
    auth_header = {"Authorization": f"Bearer {tokens['access_token']}"}

    # Add a mock university account for this user in DB
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    account = UniversityAccount(
        user_id=user.id,
        enrollment="01-134212-001",
        full_name="Test Student",
        campus_id="2",
        campus_name="Karachi Campus",
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    # Insert two test notifications (one unread, one read)
    n1 = NotificationEvent(
        account_id=account.id,
        category="ASSIGNMENT_NEW",
        title="New Assignment",
        body="Assignment 1 posted",
        is_read=False,
        event_hash=uuid.uuid4().hex,
    )
    n2 = NotificationEvent(
        account_id=account.id,
        category="ATTENDANCE_ABSENCE",
        title="Absence Logged",
        body="Marked absent in CS101",
        is_read=True,
        event_hash=uuid.uuid4().hex,
    )
    db.add_all([n1, n2])
    db.commit()
    db.close()

    # 1. Get notifications
    resp = client.get("/api/v1/notifications", headers=auth_header)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["unread_count"] == 1

    # 2. Mark all as read
    mark_resp = client.post("/api/v1/notifications/read?all_read=true", headers=auth_header)
    assert mark_resp.status_code == 200

    # 3. Clear read notifications
    del_resp = client.delete("/api/v1/notifications/clear-read", headers=auth_header)
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == 2

    # 4. Verify 0 notifications remain
    after_resp = client.get("/api/v1/notifications", headers=auth_header)
    assert after_resp.json()["total"] == 0

def test_connect_demo_lms_flow():
    import uuid
    email = f"demo_test_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "DemoSecurePass123!"

    # 1. Register and get token
    reg_resp = client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
    assert reg_resp.status_code == 201
    token = reg_resp.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # 2. Connect demo LMS
    demo_resp = client.post("/api/v1/lms/connect-demo", headers=auth_header)
    assert demo_resp.status_code == 200
    demo_data = demo_resp.json()
    assert demo_data["success"] is True
    assert demo_data["full_name"] == "Muhammad Ali (Bahria Student)"
    assert demo_data["enrollment"] == "02-134212-042"
    assert "Karachi" in demo_data["campus_name"]

    # 3. Check profile and university account details
    me_resp = client.get("/api/v1/auth/me", headers=auth_header)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["university_account"] is not None
    assert me_data["university_account"]["enrollment"] == "02-134212-042"
    assert me_data["university_account"]["full_name"] == "Muhammad Ali (Bahria Student)"

    # 4. Check courses & attendance
    att_resp = client.get("/api/v1/attendance", headers=auth_header)
    assert att_resp.status_code == 200
    att_list = att_resp.json()
    assert len(att_list) >= 4
    course_codes = [c["course_code"] for c in att_list]
    assert "CS-312" in course_codes

    # 5. Check assignments
    assign_resp = client.get("/api/v1/assignments", headers=auth_header)
    assert assign_resp.status_code == 200
    assign_list = assign_resp.json()
    assert len(assign_list) >= 3

    # 6. Check lecture materials
    mat_resp = client.get("/api/v1/materials", headers=auth_header)
    assert mat_resp.status_code == 200
    mat_list = mat_resp.json()
    assert len(mat_list) >= 3

    # 7. Check academic results and CGPA
    res_resp = client.get("/api/v1/results", headers=auth_header)
    assert res_resp.status_code == 200
    res_data = res_resp.json()
    assert res_data["cgpa"] >= 2.0
    assert len(res_data["semesters"]) >= 1

    # 8. Check dashboard overview has CGPA
    dash_resp = client.get("/api/v1/dashboard", headers=auth_header)
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()
    assert "cgpa" in dash_data
    assert dash_data["cgpa"] >= 2.0

