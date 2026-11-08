import sqlite3
import base64
from app.core.security import decrypt_credential

print("s=20263:", base64.b64decode("MjAyNjM=").decode())
print("oc=151750:", base64.b64decode("MTUxNzUw").decode())
print("oc=151751:", base64.b64decode("MTUxNzUx").decode())

conn = sqlite3.connect("backend/campusflow.db")
c = conn.cursor()
c.execute("""
    SELECT a.id, a.enrollment, a.campus_id, a.campus_name, c.ciphertext, c.nonce, s.cookies_json_encrypted, s.nonce
    FROM university_accounts a 
    LEFT JOIN encrypted_credentials c ON c.account_id = a.id
    LEFT JOIN encrypted_sessions s ON s.account_id = a.id
    WHERE a.enrollment = '02-136242-009'
""")
row = c.fetchone()
if row:
    print("Account found:", row[0], row[1], row[2], row[3])
    if row[4]:
        pwd = decrypt_credential(row[4], row[5])
        print("Cloud Password exists:", bool(pwd))
    else:
        print("No cloud password")
    if row[6]:
        cookies_json = decrypt_credential(row[6], row[7])
        print("Session cookies exist, length:", len(cookies_json))
        import json
        cookies = json.loads(cookies_json)
        print("Cookies keys:", list(cookies.keys()))
    else:
        print("No session cookies")
else:
    print("Account not found")
