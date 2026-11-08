import sqlite3

def migrate():
    conn = sqlite3.connect('backend/campusflow.db')
    cur = conn.cursor()
    cols = [
        ('is_extended', 'BOOLEAN DEFAULT 0'),
        ('extended_deadline', 'DATETIME'),
        ('extended_deadline_raw', "VARCHAR(128) DEFAULT ''"),
        ('original_deadline', 'DATETIME'),
        ('original_deadline_raw', "VARCHAR(128) DEFAULT ''"),
        ('extension_type', "VARCHAR(64) DEFAULT ''"),
        ('can_submit', 'BOOLEAN DEFAULT 1'),
        ('can_reupload', 'BOOLEAN DEFAULT 0'),
        ('lms_assignment_id', "VARCHAR(64) DEFAULT ''"),
        ('lms_offered_course_id', "VARCHAR(64) DEFAULT ''"),
        ('lms_student_id', "VARCHAR(64) DEFAULT ''")
    ]
    cur.execute('PRAGMA table_info(assignments)')
    existing = [r[1] for r in cur.fetchall()]
    for col_name, col_type in cols:
        if col_name not in existing:
            cur.execute(f'ALTER TABLE assignments ADD COLUMN {col_name} {col_type}')
            print(f'Added column {col_name}')
    conn.commit()
    conn.close()
    print('Schema migration successful.')

if __name__ == '__main__':
    migrate()
