from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token

client = TestClient(app)

# Use Hunain's actual account
user_id = "4ee12030-8c9f-4458-99e9-45490155b80a"
token = create_access_token({"sub": user_id, "type": "access"})
headers = {"Authorization": f"Bearer {token}"}

# 1. Test results endpoint
res = client.get("/api/v1/results", headers=headers)
print("Results status:", res.status_code, "CGPA:", res.json().get("cgpa"))
assert res.status_code == 200
assert res.json()["cgpa"] == 3.65

# 2. Test assignments endpoint
assigns = client.get("/api/v1/assignments", headers=headers).json()
print("Total assignments:", len(assigns))
assert len(assigns) > 0
ml_lab_assigns = [a for a in assigns if a["course_name"] == "Machine Learning Lab"]
print("ML Lab assignments:", len(ml_lab_assigns))
assert len(ml_lab_assigns) == 6

# 3. Test single file download endpoint via token query param
mid_term_id = ml_lab_assigns[5]["id"]
file_dl = client.get(f"/api/v1/downloads/file?assignment_id={mid_term_id}&token={token}")
print("Download file status:", file_dl.status_code, "Length:", len(file_dl.content), "Type:", file_dl.headers.get("content-type"))
assert file_dl.status_code == 200
assert file_dl.content.startswith(b"%PDF-1.4")

# 4. Test course zip download endpoint via token query param
courses = client.get("/api/v1/courses", headers=headers).json()
print("Total courses:", len(courses))
ml_lab_course = next(c for c in courses if c["title"] == "Machine Learning Lab")
zip_dl = client.get(f"/api/v1/downloads/course/{ml_lab_course['id']}/zip?token={token}")
print("Zip download status:", zip_dl.status_code, "Length:", len(zip_dl.content), "Type:", zip_dl.headers.get("content-type"))
assert zip_dl.status_code == 200
assert len(zip_dl.content) > 1000

# 5. Test dashboard CGPA
dash = client.get("/api/v1/dashboard", headers=headers).json()
print("Dashboard CGPA:", dash.get("cgpa"), "SGPA:", dash.get("sgpa"))
assert dash.get("cgpa") == 3.65

print("ALL DOWNLOAD AND DATA VERIFICATION CHECKS PASSED PERFECTLY!")
