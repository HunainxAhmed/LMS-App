import re
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
import httpx
from bs4 import BeautifulSoup
from app.core.config import settings
from app.scrapers.browser import login_with_browser
from app.scrapers.cms.attendance import parse_attendance_html, parse_attendance_summary_html
from app.scrapers.cms.profile import parse_cms_profile
from app.scrapers.lms.assignments import parse_assignments_html
from app.scrapers.lms.materials import parse_materials_html

logger = logging.getLogger(__name__)

COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

class ScrapingEngine:
    def __init__(
        self,
        enrollment: str,
        password: str,
        campus_name: str,
        campus_id: str = "2",
        cookies: Optional[Dict[str, str]] = None,
        attendance_threshold: float = 75.0,
    ):
        self.enrollment = enrollment
        self.password = password
        self.campus_name = campus_name
        self.campus_id = campus_id
        self.cookies = cookies or {}
        self.attendance_threshold = attendance_threshold
        self.cms_base = settings.BAHRIA_CMS_BASE_URL.rstrip('/')
        self.lms_base = settings.BAHRIA_LMS_BASE_URL.rstrip('/')

    async def _test_session_validity(self, client: httpx.AsyncClient) -> bool:
        """Checks if current cookies are still valid on CMS and LMS without re-logging in."""
        if not self.cookies or "cms" not in self.cookies or "PHPSESSID" not in self.cookies:
            return False

        try:
            # 1. Test CMS validity
            cms_url = f"{self.cms_base}/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx"
            cms_resp = await client.get(cms_url, cookies=self.cookies, timeout=8.0, follow_redirects=False)
            if cms_resp.status_code != 200 or "login.aspx" in str(cms_resp.url).lower():
                return False

            # 2. Test LMS validity
            lms_url = f"{self.lms_base}/Student/Assignments.php"
            lms_resp = await client.get(lms_url, cookies=self.cookies, timeout=8.0, follow_redirects=True)
            if lms_resp.status_code != 200 or "login" in str(lms_resp.url).lower() or "cms.bahria.edu.pk" in str(lms_resp.url).lower():
                return False

            return True
        except Exception:
            return False

    async def _try_http_login(self, client: httpx.AsyncClient) -> Tuple[bool, Dict[str, str]]:
        """
        Attempts direct HTTP POST login to CMS ASP.NET form to avoid launching a browser.
        Extracts __VIEWSTATE, __EVENTVALIDATION, etc.
        """
        try:
            login_url = f"{self.cms_base}/Logins/Student/Login.aspx"
            get_resp = await client.get(login_url, headers=COMMON_HEADERS, timeout=10.0)
            if get_resp.status_code != 200:
                return False, {}

            soup = BeautifulSoup(get_resp.text, "html.parser")
            form_data: Dict[str, str] = {}
            for inp in soup.find_all("input"):
                name = inp.get("name")
                if name:
                    form_data[name] = inp.get("value", "")

            # Set user inputs
            form_data["ctl00$BodyPH$tbEnrollment"] = self.enrollment
            form_data["ctl00$BodyPH$tbPassword"] = self.password
            form_data["ctl00$BodyPH$ddlInstituteID"] = self.campus_id
            form_data["ctl00$BodyPH$ddlSubUserType"] = "None"
            form_data["ctl00$BodyPH$btnLogin"] = "Sign In"
            form_data["ctl00$hfJsEnabled"] = "1"

            post_resp = await client.post(
                login_url,
                data=form_data,
                headers={**COMMON_HEADERS, "Referer": login_url},
                cookies=dict(get_resp.cookies),
                timeout=12.0,
                follow_redirects=True
            )

            # Check if redirected to authenticated portal (/Sys/ or any authenticated page)
            url_lower = str(post_resp.url).lower()
            if "login.aspx" not in url_lower and "/sys/" in url_lower:
                merged_cookies = dict(get_resp.cookies)
                merged_cookies.update(dict(post_resp.cookies))

                # Transition to LMS via GoToLMS.aspx
                try:
                    transit_url = f"{self.cms_base}/Sys/Common/GoToLMS.aspx"
                    lms_resp = await client.get(
                        transit_url,
                        cookies=merged_cookies,
                        headers=COMMON_HEADERS,
                        timeout=10.0,
                        follow_redirects=True
                    )
                    merged_cookies.update(dict(lms_resp.cookies))
                except Exception as e:
                    logger.debug(f"GoToLMS transit note: {e}")

                return True, merged_cookies
            else:
                logger.info(f"Direct HTTP login remained on {post_resp.url}. Delegating to Playwright browser automation.")
                return False, {}
        except Exception as e:
            logger.debug(f"Direct HTTP login attempt encountered: {e}")

        return False, {}

    async def authenticate(self, need_lms: bool = True) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Authenticates with the university portal.
        Checks if existing session cookies are valid.
        If valid on CMS & LMS, returns immediately so lightweight HTTPX can scrape without launching Chromium.
        Only launches Playwright if cookies are expired or missing.
        """
        async with httpx.AsyncClient(headers=COMMON_HEADERS, verify=False) as client:
            if await self._test_session_validity(client):
                logger.info("Existing session cookies are valid on CMS & LMS. Using fast HTTP scraper (zero Chromium overhead).")
                return True, "", {}

            if not need_lms:
                # Fast CMS-only authentication for instant login connection (1-2s, zero browser overhead)
                logger.info("Attempting direct HTTP CMS login...")
                http_success, new_cookies = await self._try_http_login(client)
                if http_success:
                    self.cookies = new_cookies
                    logger.info(f"Direct HTTP login succeeded with cookies: {list(new_cookies.keys())}")
                    return True, "", {}

        # If LMS access is needed or direct HTTP CMS login failed, launch fast Playwright automation
        logger.info("Launching fast Playwright browser automation for authentication and LMS transition...")
        browser_success, error_msg, browser_cookies, student_info = await login_with_browser(
            enrollment=self.enrollment,
            password=self.password,
            campus_name=self.campus_name,
            campus_id=self.campus_id,
            scrape_data=False,
            need_lms=need_lms,
        )

        if not browser_success:
            return False, error_msg, {}

        self.cookies = browser_cookies
        return True, "", student_info

    async def scrape_all(self, on_progress: Optional[Any] = None) -> Dict[str, Any]:
        """
        Full synchronization run:
        1. Authenticate / establish session
        2. Scrape Attendance (CMS)
        3. Scrape Profile (CMS)
        4. Scrape LMS Courses list
        5. Concurrently scrape Assignments & Materials per course
        """
        if on_progress:
            await on_progress("Connecting to CMS...")

        auth_ok, err, student_info = await self.authenticate()
        if not auth_ok:
            raise ValueError(err or "Failed to authenticate with Bahria University portal.")

        results: Dict[str, Any] = {
            "student_info": student_info,
            "courses": [],
            "attendance": [],
            "assignments": [],
            "materials": [],
            "cookies": self.cookies,
        }

        # If Playwright browser automation already collected portal data, merge it first
        browser_data = student_info.get("_scraped_data") or {}
        if browser_data.get("courses"):
            results["courses"] = browser_data["courses"]
        if browser_data.get("attendance"):
            results["attendance"] = browser_data["attendance"]
        if browser_data.get("assignments"):
            results["assignments"] = browser_data["assignments"]
        if browser_data.get("materials"):
            results["materials"] = browser_data["materials"]

        async with httpx.AsyncClient(headers=COMMON_HEADERS, cookies=self.cookies, verify=False, timeout=25.0) as client:
            # Step 1: Scrape Attendance from CMS (if not already collected)
            if not results["attendance"]:
                if on_progress:
                    await on_progress("Updating attendance...")
                try:
                    att_url = f"{self.cms_base}/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx"
                    att_resp = await client.get(att_url)
                    if att_resp.status_code == 200:
                        att_records = parse_attendance_html(att_resp.text, self.attendance_threshold)
                        results["attendance"] = att_records
                        logger.info(f"Scraped {len(att_records)} attendance records.")
                except Exception as e:
                    logger.warning(f"Attendance scraping error: {e}")

            # Fetch authentic class session history for each course from AttendanceSummary.aspx
            if results["attendance"]:
                async def fetch_summary(rec: Dict[str, Any]):
                    if rec.get("sessions"):
                        return
                    detail_url = rec.get("detail_url")
                    if not detail_url:
                        return
                    try:
                        resp = await client.get(detail_url, timeout=15.0)
                        if resp.status_code == 200:
                            sessions = parse_attendance_summary_html(resp.text)
                            rec["sessions"] = sessions
                            logger.info(f"Loaded {len(sessions)} authentic class sessions for {rec.get('code')}")
                    except Exception as err:
                        logger.warning(f"Error fetching attendance summary for {rec.get('code')}: {err}")

                await asyncio.gather(*(fetch_summary(rec) for rec in results["attendance"]), return_exceptions=True)

            # Step 2: Scrape Student Profile from CMS if not already extracted
            try:
                dash_url = f"{self.cms_base}/Sys/Student/Dashboard.aspx"
                dash_resp = await client.get(dash_url)
                if dash_resp.status_code == 200:
                    profile = parse_cms_profile(dash_resp.text)
                    for k, v in profile.items():
                        if v and not results["student_info"].get(k):
                            results["student_info"][k] = v
            except Exception as e:
                logger.warning(f"Profile scraping error: {e}")

            # Step 2b: Scrape Official Provisional Exam Results from CMS
            try:
                from app.scrapers.cms.results import parse_cms_exam_results
                exam_url = f"{self.cms_base}/Sys/Student/Exams/ExamResult.aspx"
                exam_resp = await client.get(exam_url, timeout=15.0)
                if exam_resp.status_code == 200:
                    results["exam_results"] = parse_cms_exam_results(exam_resp.text)
                    logger.info(f"Scraped official provisional results: {results['exam_results']['completed_semesters_count']} completed semesters, {results['exam_results']['total_credits']} credits.")
            except Exception as e:
                logger.warning(f"Exam results scraping error: {e}")

            # Step 3: Fetch LMS Courses from Assignments.php dropdown
            if on_progress:
                await on_progress("Loading courses...")
            courses_list: List[Dict[str, str]] = []
            try:
                assign_page_url = f"{self.lms_base}/Student/Assignments.php"
                assign_page_resp = await client.get(assign_page_url)
                if assign_page_resp.status_code == 200:
                    soup = BeautifulSoup(assign_page_resp.text, "html.parser")
                    course_dropdown = (
                        soup.select_one("select#courseId")
                        or soup.select_one("select[name='courseName']")
                        or soup.find("select", id=re.compile(r"^course", re.I))
                    )
                    if course_dropdown:
                        for opt in course_dropdown.find_all("option"):
                            c_name = opt.get_text().strip()
                            c_val = opt.get("value", "").strip()
                            if c_name and "select" not in c_name.lower() and c_val:
                                # Extract course code if present in name (e.g. "CS-312: Database Systems")
                                code_match = re.search(r"^([A-Z]{2,4}[-\s]?\d{3,4})[:\s-]+(.*)", c_name)
                                if code_match:
                                    c_code = code_match.group(1).strip()
                                    c_title = code_match.group(2).strip()
                                else:
                                    c_title = c_name
                                    c_code = ""
                                    for att in results.get("attendance", []):
                                        if att.get("title", "").strip().lower() == c_title.lower():
                                            c_code = att.get("code", "")
                                            break

                                courses_list.append({
                                    "name": c_name,
                                    "value": c_val,
                                    "code": c_code,
                                    "title": c_title,
                                })
            except Exception as e:
                logger.warning(f"Course list fetching error: {e}")

            if courses_list and len(courses_list) >= len(results["courses"]):
                results["courses"] = courses_list
            elif results["courses"]:
                courses_list = results["courses"]
            elif not courses_list and results["attendance"]:
                for att in results["attendance"]:
                    courses_list.append({
                        "name": att["title"],
                        "value": att["code"],
                        "code": att["code"],
                        "title": att["title"],
                    })
                results["courses"] = courses_list

            logger.info(f"Discovered {len(results['courses'])} enrolled courses.")

            # Step 4: Bounded concurrent fetching of assignments and materials for ALL enrolled courses
            if courses_list:
                if on_progress:
                    await on_progress("Fetching assignments & course material...")

                semaphore = asyncio.Semaphore(4)

                async def fetch_course_data(course: Dict[str, str]):
                    async with semaphore:
                        c_name = course["name"]
                        c_val = course["value"]
                        c_title = course["title"]
                        # Build query string for Bahria LMS offerings
                        # Format: ?s=MjAyNjM%3D&oc=... or direct query string
                        c_query = ""
                        if "s=" in c_val or "oc=" in c_val:
                            c_query = c_val.lstrip("?")
                        elif c_val:
                            c_query = f"s=MjAyNjM%3D&oc={c_val}"

                        # 1. Fetch assignments for this specific course
                        try:
                            assign_url = f"{self.lms_base}/Student/Assignments.php"
                            if c_query:
                                assign_url = f"{assign_url}?{c_query}"

                            resp = await client.get(assign_url, timeout=15.0)
                            if resp.status_code == 200:
                                parsed_assigns = parse_assignments_html(resp.text, c_title, self.lms_base)
                                if parsed_assigns:
                                    results["assignments"].extend(parsed_assigns)
                                else:
                                    # Fallback POST
                                    post_resp = await client.post(f"{self.lms_base}/Student/Assignments.php", data={"courseId": c_val, "course": c_val}, timeout=15.0)
                                    if post_resp.status_code == 200:
                                        results["assignments"].extend(parse_assignments_html(post_resp.text, c_title, self.lms_base))
                        except Exception as err:
                            logger.debug(f"Assignment fetch error for {c_name}: {err}")

                        # 2. Fetch lecture materials for this specific course
                        try:
                            mat_url = f"{self.lms_base}/Student/LectureNotes.php"
                            if c_query:
                                mat_url = f"{mat_url}?{c_query}"

                            resp = await client.get(mat_url, timeout=15.0)
                            if resp.status_code == 200:
                                parsed_mats = parse_materials_html(resp.text, c_title, self.lms_base)
                                if parsed_mats:
                                    results["materials"].extend(parsed_mats)
                                else:
                                    # Fallback POST
                                    post_resp = await client.post(f"{self.lms_base}/Student/LectureNotes.php", data={"courseId": c_val, "course": c_val}, timeout=15.0)
                                    if post_resp.status_code == 200:
                                        results["materials"].extend(parse_materials_html(post_resp.text, c_title, self.lms_base))
                        except Exception as err:
                            logger.debug(f"Material fetch error for {c_name}: {err}")

                await asyncio.gather(*(fetch_course_data(c) for c in courses_list), return_exceptions=True)

            if on_progress:
                await on_progress("Finalizing synchronization...")

            return results
