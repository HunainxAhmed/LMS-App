import sys
sys.path.insert(0, 'backend')
from app.database.session import SessionLocal
from app.models.academic import AttendanceRecord, AttendanceSession, Course

db = SessionLocal()
records = db.query(AttendanceRecord).all()
print(f'Found {len(records)} attendance records:')
for r in records:
    c = db.query(Course).filter(Course.id == r.course_id).first()
    c_inst = c.instructor if c else 'None'
    sess = db.query(AttendanceSession).filter(AttendanceSession.attendance_record_id == r.id).all()
    print(f'  - [{r.course_code}] {r.course_title}: Record instructor="{r.instructor}", Course instructor="{c_inst}", Sessions={len(sess)}')
    if sess:
        for s in sess[:5]:
            print(f'       Session: {s.session_date} | {s.status} | slot={s.slot_info} | remarks={s.remarks}')
