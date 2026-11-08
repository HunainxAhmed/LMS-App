import { openDatabaseAsync, SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

let dbInstance: SQLiteDatabase | null = null;

async function getDb(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === "web") {
    return null;
  }
  if (!dbInstance) {
    dbInstance = await openDatabaseAsync("campusflow_offline.db");
    await initTables(dbInstance);
  }
  return dbInstance;
}

async function initTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_courses (
      id TEXT PRIMARY KEY,
      code TEXT,
      title TEXT,
      credit_hours REAL,
      instructor TEXT,
      section TEXT,
      semester TEXT
    );

    CREATE TABLE IF NOT EXISTS offline_assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      course_name TEXT,
      assignment_number TEXT,
      title TEXT,
      description TEXT,
      deadline_raw TEXT,
      days_left INTEGER,
      is_passed INTEGER,
      submission_status TEXT,
      personal_completed INTEGER,
      attachment_url TEXT,
      attachment_name TEXT,
      teacher_attachment_url TEXT,
      teacher_attachment_name TEXT,
      submission_attachment_url TEXT,
      submission_attachment_name TEXT,
      is_extended INTEGER DEFAULT 0,
      extended_deadline_raw TEXT,
      original_deadline_raw TEXT,
      extension_type TEXT,
      can_submit INTEGER DEFAULT 1,
      can_reupload INTEGER DEFAULT 0,
      lms_assignment_id TEXT,
      lms_offered_course_id TEXT,
      lms_student_id TEXT
    );

    CREATE TABLE IF NOT EXISTS offline_attendance (
      id TEXT PRIMARY KEY,
      course_code TEXT,
      course_title TEXT,
      instructor TEXT,
      present_hours REAL,
      absent_hours REAL,
      total_hours REAL,
      percentage REAL,
      safe_misses INTEGER,
      risk_status TEXT
    );

    CREATE TABLE IF NOT EXISTS offline_materials (
      id TEXT PRIMARY KEY,
      course_name TEXT,
      week_number TEXT,
      title TEXT,
      file_name TEXT,
      file_url TEXT,
      file_type TEXT
    );

    CREATE TABLE IF NOT EXISTS local_downloads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      course_name TEXT,
      category TEXT,
      mime_type TEXT,
      downloaded_at TEXT NOT NULL
    );
  `);

  // Safe migration for previously created SQLite databases
  const assignmentMigrationCols = [
    "course_id TEXT",
    "teacher_attachment_url TEXT",
    "teacher_attachment_name TEXT",
    "submission_attachment_url TEXT",
    "submission_attachment_name TEXT",
    "is_extended INTEGER DEFAULT 0",
    "extended_deadline_raw TEXT",
    "original_deadline_raw TEXT",
    "extension_type TEXT",
    "can_submit INTEGER DEFAULT 1",
    "can_reupload INTEGER DEFAULT 0",
    "lms_assignment_id TEXT",
    "lms_offered_course_id TEXT",
    "lms_student_id TEXT",
  ];
  for (const col of assignmentMigrationCols) {
    try {
      await db.execAsync(`ALTER TABLE offline_assignments ADD COLUMN ${col};`);
    } catch {}
  }
}

export async function getSQLiteDb(): Promise<SQLiteDatabase | null> {
  return getDb();
}

export async function saveAcademicDataToSQLite(data: {
  courses?: any[];
  assignments?: any[];
  attendance?: any[];
  materials?: any[];
}) {
  try {
    const db = await getDb();
    if (!db) return;

    if (data.courses && data.courses.length > 0) {
      await db.runAsync("DELETE FROM offline_courses");
      for (const c of data.courses) {
        await db.runAsync(
          "INSERT OR REPLACE INTO offline_courses (id, code, title, credit_hours, instructor, section, semester) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [c.id, c.code, c.title, c.credit_hours || 3.0, c.instructor || "", c.section || "", c.semester || ""]
        );
      }
    }

    if (data.assignments && data.assignments.length > 0) {
      await db.runAsync("DELETE FROM offline_assignments");
      for (const a of data.assignments) {
        await db.runAsync(
          `INSERT OR REPLACE INTO offline_assignments (
            id, course_id, course_name, assignment_number, title, description, deadline_raw, days_left, is_passed,
            submission_status, personal_completed, attachment_url, attachment_name,
            teacher_attachment_url, teacher_attachment_name, submission_attachment_url, submission_attachment_name,
            is_extended, extended_deadline_raw, original_deadline_raw, extension_type,
            can_submit, can_reupload, lms_assignment_id, lms_offered_course_id, lms_student_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            a.id,
            a.course_id || "",
            a.course_name,
            a.assignment_number || "",
            a.title,
            a.description || "",
            a.deadline_raw || "",
            a.days_left ?? null,
            a.is_passed ? 1 : 0,
            a.submission_status || "PENDING",
            a.personal_completed ? 1 : 0,
            a.attachment_url || "",
            a.attachment_name || "",
            a.teacher_attachment_url || "",
            a.teacher_attachment_name || "",
            a.submission_attachment_url || "",
            a.submission_attachment_name || "",
            a.is_extended ? 1 : 0,
            a.extended_deadline_raw || "",
            a.original_deadline_raw || "",
            a.extension_type || "",
            a.can_submit === false ? 0 : 1,
            a.can_reupload ? 1 : 0,
            a.lms_assignment_id || "",
            a.lms_offered_course_id || "",
            a.lms_student_id || "",
          ]
        );
      }
    }

    if (data.attendance && data.attendance.length > 0) {
      await db.runAsync("DELETE FROM offline_attendance");
      for (const att of data.attendance) {
        await db.runAsync(
          "INSERT OR REPLACE INTO offline_attendance (id, course_code, course_title, instructor, present_hours, absent_hours, total_hours, percentage, safe_misses, risk_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            att.id || att.course_code,
            att.course_code,
            att.course_title,
            att.instructor || "",
            att.present_hours,
            att.absent_hours,
            att.total_hours,
            att.percentage,
            att.safe_misses,
            att.risk_status,
          ]
        );
      }
    }

    if (data.materials && data.materials.length > 0) {
      await db.runAsync("DELETE FROM offline_materials");
      for (const m of data.materials) {
        await db.runAsync(
          "INSERT OR REPLACE INTO offline_materials (id, course_name, week_number, title, file_name, file_url, file_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [m.id, m.course_name, m.week_number || "", m.title, m.file_name, m.file_url, m.file_type || "pdf"]
        );
      }
    }
  } catch (err) {
    console.warn("Failed to write to offline SQLite database:", err);
  }
}

export async function getOfflineAcademicDataFromSQLite() {
  try {
    const db = await getDb();
    if (!db) return null;

    const courses = await db.getAllAsync("SELECT * FROM offline_courses");
    const assignments = await db.getAllAsync("SELECT * FROM offline_assignments");
    const attendance = await db.getAllAsync("SELECT * FROM offline_attendance");
    const materials = await db.getAllAsync("SELECT * FROM offline_materials");

    return {
      courses,
      assignments: assignments.map((a: any) => ({
        ...a,
        is_passed: Boolean(a.is_passed),
        personal_completed: Boolean(a.personal_completed),
        is_extended: Boolean(a.is_extended),
        can_submit: a.can_submit === undefined || a.can_submit === null ? true : Boolean(a.can_submit),
        can_reupload: Boolean(a.can_reupload),
      })),
      attendance,
      materials,
    };
  } catch (err) {
    console.warn("Failed to read from offline SQLite database:", err);
    return null;
  }
}

export async function clearOfflineDatabase() {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync("DELETE FROM offline_courses");
    await db.runAsync("DELETE FROM offline_assignments");
    await db.runAsync("DELETE FROM offline_attendance");
    await db.runAsync("DELETE FROM offline_materials");
  } catch (err) {
    console.warn("Failed to clear offline database:", err);
  }
}
