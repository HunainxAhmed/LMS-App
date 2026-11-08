// Web-compatible implementation using localStorage for testing on PC browser
const WEB_KEYS = {
  COURSES: "campusflow_offline_courses",
  ASSIGNMENTS: "campusflow_offline_assignments",
  ATTENDANCE: "campusflow_offline_attendance",
  MATERIALS: "campusflow_offline_materials",
};

export async function saveAcademicDataToSQLite(data: {
  courses?: any[];
  assignments?: any[];
  attendance?: any[];
  materials?: any[];
}) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;

    if (data.courses) {
      localStorage.setItem(WEB_KEYS.COURSES, JSON.stringify(data.courses));
    }
    if (data.assignments) {
      localStorage.setItem(WEB_KEYS.ASSIGNMENTS, JSON.stringify(data.assignments));
    }
    if (data.attendance) {
      localStorage.setItem(WEB_KEYS.ATTENDANCE, JSON.stringify(data.attendance));
    }
    if (data.materials) {
      localStorage.setItem(WEB_KEYS.MATERIALS, JSON.stringify(data.materials));
    }
  } catch (err) {
    console.warn("Web localStorage save error:", err);
  }
}

export async function getOfflineAcademicDataFromSQLite() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;

    const courses = JSON.parse(localStorage.getItem(WEB_KEYS.COURSES) || "[]");
    const assignments = JSON.parse(localStorage.getItem(WEB_KEYS.ASSIGNMENTS) || "[]");
    const attendance = JSON.parse(localStorage.getItem(WEB_KEYS.ATTENDANCE) || "[]");
    const materials = JSON.parse(localStorage.getItem(WEB_KEYS.MATERIALS) || "[]");

    return {
      courses,
      assignments,
      attendance,
      materials,
    };
  } catch (err) {
    console.warn("Web localStorage read error:", err);
    return null;
  }
}

export async function clearOfflineDatabase() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    localStorage.removeItem(WEB_KEYS.COURSES);
    localStorage.removeItem(WEB_KEYS.ASSIGNMENTS);
    localStorage.removeItem(WEB_KEYS.ATTENDANCE);
    localStorage.removeItem(WEB_KEYS.MATERIALS);
  } catch (err) {
    console.warn("Web localStorage clear error:", err);
  }
}
