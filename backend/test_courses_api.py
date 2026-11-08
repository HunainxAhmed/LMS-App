import httpx
from app.database.session import SessionLocal
from app.models.user import UniversityAccount
from app.core.security import create_access_token

db = SessionLocal()
account = db.query(UniversityAccount).filter(UniversityAccount.id == '784cc8af-16ed-4f1b-b923-0c73d2bfc9da').first()
token = create_access_token({"sub": account.id})
r = httpx.get('http://127.0.0.1:8000/api/v1/courses', headers={'Authorization': f'Bearer {token}'})
print('Status:', r.status_code)
print('Response:', r.json())
