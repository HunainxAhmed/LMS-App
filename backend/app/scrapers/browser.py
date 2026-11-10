import sys
import re
import asyncio
import logging
from typing import Dict, Any, Tuple, Optional
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from app.core.config import settings

logger = logging.getLogger(__name__)

async def _auto_complete_pending_surveys(page: Page, max_surveys: int = 25):
    """
    Automatically detects and completes mandatory Bahria QA Course & Teacher Evaluation forms
    with neutral/agree answers (Agree/Uncertain, Age < 22, Disability No, Comments Satisfactory).
    This seamlessly bypasses the mandatory QA survey wall and unlocks GoToLMS.
    """
    try:
        qa_url = f"{settings.BAHRIA_CMS_BASE_URL.rstrip('/')}/Sys/Student/QualityAssurance/QualityAssuranceSurveys.aspx"
        if "qualityassurancesurveys.aspx" not in page.url.lower():
            await page.goto(qa_url, wait_until="domcontentloaded", timeout=12000)
            await page.wait_for_timeout(1500)

        completed = 0
        while completed < max_surveys:
            eval_link = await page.query_selector("a:has-text('Evaluate')")
            if not eval_link:
                break

            completed += 1
            logger.info(f"Auto-completing pending QA survey #{completed}...")
            await eval_link.click()
            await page.wait_for_timeout(2500)

            # 1. Fill all Likert scale radio button questions (Agree / Uncertain / No)
            radios = await page.eval_on_selector_all("input[type='radio']", """
                radios => radios.map(r => ({
                    name: r.name,
                    id: r.id,
                    label: (document.querySelector('label[for=\"' + r.id + '\"]') || {}).innerText || ''
                }))
            """)
            groups: Dict[str, list] = {}
            for r in radios:
                groups.setdefault(r['name'], []).append(r)

            for gname, items in groups.items():
                target = None
                for item in items:
                    lbl = item['label'].strip().lower()
                    if lbl == 'agree':
                        target = item
                        break
                if not target:
                    for item in items:
                        lbl = item['label'].strip().lower()
                        if lbl in ('uncertain', 'neutral'):
                            target = item
                            break
                if not target:
                    for item in items:
                        lbl = item['label'].strip().lower()
                        if 'no' in lbl:
                            target = item
                            break
                if not target and len(items) >= 2:
                    target = items[1]
                elif not target:
                    target = items[0]

                try:
                    await page.check(f"input[type='radio'][id='{target['id']}']")
                except Exception:
                    pass

            # 2. Demographics Select dropdowns (Age < 22, Disability No)
            selects = await page.query_selector_all("select")
            for sel in selects:
                try:
                    options = await sel.eval_on_selector_all("option", "opts => opts.map(o => ({ text: o.innerText.trim(), val: o.value }))")
                    chosen_val = None
                    for opt in options:
                        t = opt['text'].lower()
                        if any(k in t for k in ['< 22', '<22', 'less than 22', 'under 22', '20-22']):
                            chosen_val = opt['val']
                            break
                        elif t in ['no', 'none']:
                            chosen_val = opt['val']
                            break
                    if not chosen_val and len(options) > 1:
                        chosen_val = options[1]['val']
                    if chosen_val:
                        await sel.select_option(value=chosen_val)
                except Exception:
                    pass

            # 3. Textareas (Satisfactory / Good)
            textareas = await page.query_selector_all("textarea")
            for ta in textareas:
                try:
                    val = await ta.input_value()
                    if not val.strip():
                        await ta.fill("Satisfactory")
                except Exception:
                    pass

            # 4. Submit form
            submit_btn = await page.query_selector("#BodyPH_surveyUserControl_btnSubmit, input[value='Submit'], a:has-text('Submit'), button:has-text('Submit')")
            if submit_btn:
                page.on("dialog", lambda dialog: dialog.accept())
                await submit_btn.click()
                await page.wait_for_timeout(1000)
                yes_btn = await page.query_selector("#yes, button:has-text('Yes')")
                if yes_btn and await yes_btn.is_visible():
                    await yes_btn.click()
                await page.wait_for_timeout(3500)

            # Navigate back to surveys list if not already there
            if "qualityassurancesurveys.aspx" not in page.url.lower():
                await page.goto(qa_url, wait_until="domcontentloaded", timeout=12000)
            else:
                await page.wait_for_timeout(1000)

        if completed > 0:
            logger.info(f"Successfully auto-completed {completed} QA evaluation surveys! GoToLMS is now unlocked.")
    except Exception as e:
        logger.warning(f"Auto QA survey handler note: {e}")

async def _async_browser_login(
    enrollment: str,
    password: str,
    campus_name: str,
    campus_id: str = "2",
    timeout_ms: int = 45000,
    scrape_data: bool = True,
) -> Tuple[bool, str, Dict[str, str], Dict[str, Any]]:
    """
    Internal async implementation of Bahria CMS browser automation.
    """
    cookies_dict: Dict[str, str] = {}
    student_info: Dict[str, Any] = {
        "full_name": "",
        "enrollment": enrollment,
        "campus_name": campus_name,
        "program": "",
        "current_semester": "",
    }

    try:
        async with async_playwright() as p:
            try:
                browser: Browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--disable-blink-features=AutomationControlled",
                    ]
                )
            except Exception as launch_err:
                err_str = str(launch_err)
                if "playwright install" in err_str or "Executable doesn't exist" in err_str:
                    logger.warning("Playwright Chromium executable missing on host. Auto-installing now...")
                    import subprocess
                    subprocess.run(
                        [sys.executable, "-m", "playwright", "install", "chromium"],
                        check=True,
                        timeout=180
                    )
                    logger.info("Chromium installed successfully. Relaunching browser...")
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            "--no-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-gpu",
                            "--disable-blink-features=AutomationControlled",
                        ]
                    )
                else:
                    raise launch_err
            context: BrowserContext = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800}
            )
            # Speed up page loads across international networks by bypassing heavy images and fonts
            await context.route(
                "**/*",
                lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_()
            )
            page: Page = await context.new_page()

            try:
                logger.info("Navigating to Bahria CMS Login page...")
                login_url = f"{settings.BAHRIA_CMS_BASE_URL.rstrip('/')}/Logins/Student/Login.aspx"
                try:
                    await page.goto(login_url, wait_until="commit", timeout=timeout_ms)
                except Exception as goto_err:
                    logger.warning(f"Fast commit goto warning: {goto_err}. Retrying with domcontentloaded...")
                    await page.goto(login_url, wait_until="domcontentloaded", timeout=timeout_ms)

                # Wait for enrollment input
                enroll_selector = "input[name*='tbEnrollment'], #BodyPH_tbEnrollment, input[placeholder*='Enrollment']"
                await page.wait_for_selector(enroll_selector, timeout=25000)

                # Fill credentials
                await page.fill(enroll_selector, enrollment)

                pass_selector = "input[name*='tbPassword'], #BodyPH_tbPassword, input[type='password']"
                await page.fill(pass_selector, password)

                # Select institute dropdown
                institute_selector = "select[name*='ddlInstituteID'], #BodyPH_ddlInstituteID"
                try:
                    if campus_id:
                        await page.select_option(institute_selector, value=campus_id)
                    else:
                        await page.select_option(institute_selector, label=campus_name)
                except Exception as e:
                    logger.warning(f"Could not select institute by value {campus_id}: {e}. Trying campus_name: {campus_name}")
                    try:
                        await page.select_option(institute_selector, label=campus_name)
                    except Exception:
                        pass

                # Select student role dropdown (Required by Bahria CMS: value="None")
                try:
                    sub_user_selector = "#BodyPH_ddlSubUserType, select[name*='SubUserType']"
                    sub_user_el = await page.query_selector(sub_user_selector)
                    if sub_user_el:
                        await sub_user_el.select_option(value="None")
                except Exception as e:
                    logger.debug(f"SubUserType selection note: {e}")

                # Click login button (prioritizing #BodyPH_btnLogin which is an ASP.NET LinkButton)
                submit_selector = "#BodyPH_btnLogin, a:has-text('Sign In'), input[name*='btnLogin'], button:has-text('Sign In'), input[value*='Sign In'], input[value*='Login']"
                await page.click(submit_selector)

                # Wait for navigation away from Login.aspx or for error message to appear
                try:
                    await page.wait_for_function(
                        "() => !window.location.href.toLowerCase().includes('login.aspx') || document.body.innerText.includes('Invalid') || document.body.innerText.includes('Error')",
                        timeout=15000
                    )
                except Exception:
                    await page.wait_for_timeout(3000)

                # Check if login succeeded or failed
                current_url = page.url
                content = await page.content()

                is_login_page = "login.aspx" in current_url.lower()

                if is_login_page:
                    if "invalid credentials" in content.lower() or "invalid" in content.lower():
                        await browser.close()
                        return False, "Invalid Enrollment ID or Password. Please check your Bahria University credentials and campus.", {}, {}
                    elif "captcha" in content.lower():
                        await browser.close()
                        return False, "University portal requires captcha verification. Please complete verification on the official portal.", {}, {}
                    else:
                        await browser.close()
                        return False, "Failed to authenticate with Bahria University CMS. Please verify your enrollment number, password, and campus.", {}, {}

                logger.info(f"CMS Login succeeded! Current URL: {current_url}")

                # If landed on Quality Assurance Surveys, auto-complete them to unblock portal
                if "qualityassurancesurveys.aspx" in current_url.lower():
                    logger.info("Landed on Quality Assurance Surveys. Auto-completing surveys to unlock LMS...")
                    await _auto_complete_pending_surveys(page)

                # Read student profile information from CMS page if available
                try:
                    from app.scrapers.cms.profile import parse_cms_profile
                    scraped_profile = parse_cms_profile(content)
                    if scraped_profile.get("full_name"):
                        student_info["full_name"] = scraped_profile["full_name"]
                    if scraped_profile.get("program"):
                        student_info["program"] = scraped_profile["program"]
                    if scraped_profile.get("current_semester"):
                        student_info["current_semester"] = scraped_profile["current_semester"]
                except Exception as e:
                    logger.debug(f"Profile extraction error: {e}")

                scraped_data: Dict[str, Any] = {
                    "courses": [],
                    "attendance": [],
                    "assignments": [],
                    "materials": [],
                }

                # 1. Scrape Attendance from CMS StudentWiseAttendance.aspx (only if full browser crawl requested)
                if scrape_data:
                    try:
                        logger.info("Scraping attendance from CMS StudentWiseAttendance.aspx...")
                        att_url = f"{settings.BAHRIA_CMS_BASE_URL.rstrip('/')}/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx"
                        await page.goto(att_url, wait_until="domcontentloaded", timeout=12000)
                        att_html = await page.content()
                        from app.scrapers.cms.attendance import parse_attendance_html
                        scraped_att = parse_attendance_html(att_html)
                        scraped_data["attendance"] = scraped_att
                        logger.info(f"Playwright scraped {len(scraped_att)} attendance records from CMS.")
                    except Exception as e:
                        logger.warning(f"Browser attendance scrape note: {e}")

                # 2. Transition to LMS via GoToLMS or LMS button
                lms_page = page
                try:
                    logger.info("Transitioning to LMS via GoToLMS.aspx...")
                    lms_transit_url = f"{settings.BAHRIA_CMS_BASE_URL.rstrip('/')}/Sys/Common/GoToLMS.aspx"
                    try:
                        await page.goto(lms_transit_url, wait_until="commit", timeout=25000)
                    except Exception:
                        await page.goto(lms_transit_url, wait_until="domcontentloaded", timeout=25000)
                    await page.wait_for_timeout(2500)
                    if len(context.pages) > 1:
                        lms_page = context.pages[-1]
                        await lms_page.wait_for_load_state("domcontentloaded", timeout=12000)
                    logger.info(f"LMS tab active: {lms_page.url}")

                    # Check if GoToLMS is blocked by Quality Assurance surveys
                    if "qualityassurancesurveys.aspx" in lms_page.url.lower():
                        logger.info("GoToLMS blocked by pending QA surveys. Auto-completing surveys now...")
                        await _auto_complete_pending_surveys(lms_page)
                        logger.info("Retrying GoToLMS.aspx transition...")
                        try:
                            await lms_page.goto(lms_transit_url, wait_until="commit", timeout=25000)
                        except Exception:
                            await lms_page.goto(lms_transit_url, wait_until="domcontentloaded", timeout=25000)
                        await lms_page.wait_for_timeout(2500)
                        if len(context.pages) > 1:
                            lms_page = context.pages[-1]

                    # Check if LMS requires a separate login form
                    if "login" in lms_page.url.lower():
                        logger.info("LMS login form encountered. Submitting credentials...")
                        try:
                            user_sel = "input[name*='user'], input[id*='user'], input[name*='Enrollment']"
                            pass_sel = "input[type='password']"
                            if await lms_page.query_selector(user_sel):
                                await lms_page.fill(user_sel, enrollment)
                                await lms_page.fill(pass_sel, password)
                                sub_btn = "button[type='submit'], input[type='submit']"
                                await lms_page.click(sub_btn)
                                await lms_page.wait_for_timeout(3000)
                        except Exception as e:
                            logger.warning(f"LMS login form note: {e}")

                    if not scrape_data:
                        # Fast session renewal: extract cookies without scraping full catalog
                        all_cookies = await context.cookies()
                        for c in all_cookies:
                            cookies_dict[c["name"]] = c["value"]
                        logger.info(f"Fast session renewal cookies extracted: {list(cookies_dict.keys())}")
                        await browser.close()
                        return True, "", cookies_dict, student_info

                    # 3. Scrape Assignments from LMS Assignments.php
                    try:
                        logger.info("Navigating to LMS Assignments.php...")
                        await lms_page.goto("https://lms.bahria.edu.pk/Student/Assignments.php", wait_until="domcontentloaded", timeout=15000)
                        await lms_page.wait_for_timeout(2000)

                        course_select_sel = "select#courseId, select[name='courseName'], select[name*='course']"
                        course_select = await lms_page.query_selector(course_select_sel)
                        course_options = []
                        if course_select:
                            options = await course_select.query_selector_all("option")
                            for opt in options:
                                val = await opt.get_attribute("value")
                                txt = (await opt.inner_text()).strip()
                                if val and "select" not in txt.lower():
                                    course_options.append({"value": val, "name": txt})

                        for c_opt in course_options:
                            try:
                                c_name = c_opt["name"]
                                c_val = c_opt["value"]
                                if ":" in c_name:
                                    code_val = c_name.split(":")[0].strip()
                                    title_val = c_name.split(":")[1].strip()
                                else:
                                    title_val = c_name
                                    code_val = ""
                                    for att in scraped_data.get("attendance", []):
                                        if att.get("title", "").strip().lower() == title_val.lower():
                                            code_val = att.get("code", "")
                                            break

                                scraped_data["courses"].append({
                                    "name": c_name,
                                    "value": c_val,
                                    "code": code_val,
                                    "title": title_val,
                                })

                                # Extract semester param s if present
                                s_match = re.search(r's=([^&]+)', lms_page.url)
                                s_param = s_match.group(1) if s_match else "MjAyNjM%3D"

                                # Select course and wait (matching BahriaLmsAdapter.ts)
                                try:
                                    await lms_page.select_option(course_select_sel, value=c_val)
                                except Exception:
                                    pass

                                try:
                                    assign_url = f"https://lms.bahria.edu.pk/Student/Assignments.php?s={s_param}&oc={c_val}"
                                    await lms_page.goto(assign_url, wait_until="domcontentloaded", timeout=12000)
                                except Exception:
                                    pass

                                await lms_page.wait_for_timeout(1500)
                                page_html = await lms_page.content()
                                from app.scrapers.lms.assignments import parse_assignments_html
                                c_assigns = parse_assignments_html(page_html, course_name=title_val)
                                scraped_data["assignments"].extend(c_assigns)
                            except Exception as course_err:
                                logger.warning(f"Error scraping assignments for {c_opt.get('name')}: {course_err}")

                        logger.info(f"Playwright scraped {len(scraped_data['assignments'])} assignments across {len(course_options)} courses.")
                    except Exception as e:
                        logger.warning(f"Browser assignments scraping note: {e}")

                    # 4. Scrape Lecture Notes from LMS LectureNotes.php
                    try:
                        logger.info("Navigating to LMS LectureNotes.php...")
                        await lms_page.goto("https://lms.bahria.edu.pk/Student/LectureNotes.php", wait_until="domcontentloaded", timeout=15000)
                        await lms_page.wait_for_timeout(2000)

                        s_match = re.search(r's=([^&]+)', lms_page.url)
                        s_param = s_match.group(1) if s_match else "MjAyNjM%3D"

                        course_select_sel = "select#courseId, select[name='courseName'], select[name*='course']"
                        course_select = await lms_page.query_selector(course_select_sel)
                        lecture_options = []
                        if course_select:
                            options = await course_select.query_selector_all("option")
                            for opt in options:
                                val = await opt.get_attribute("value")
                                txt = (await opt.inner_text()).strip()
                                if val and "select" not in txt.lower():
                                    lecture_options.append({"value": val, "name": txt})

                        target_opts = lecture_options or course_options
                        for l_opt in target_opts:
                            try:
                                l_name = l_opt["name"]
                                l_val = l_opt["value"]
                                title_val = l_name.split(":")[1].strip() if ":" in l_name else l_name

                                try:
                                    await lms_page.select_option(course_select_sel, value=l_val)
                                except Exception:
                                    pass

                                try:
                                    mat_url = f"https://lms.bahria.edu.pk/Student/LectureNotes.php?s={s_param}&oc={l_val}"
                                    await lms_page.goto(mat_url, wait_until="domcontentloaded", timeout=12000)
                                except Exception:
                                    pass

                                await lms_page.wait_for_timeout(1500)
                                page_html = await lms_page.content()
                                from app.scrapers.lms.materials import parse_materials_html
                                c_mats = parse_materials_html(page_html, course_name=title_val)
                                scraped_data["materials"].extend(c_mats)
                            except Exception as mat_err:
                                logger.warning(f"Error scraping lecture notes for {l_opt.get('name')}: {mat_err}")

                        logger.info(f"Playwright scraped {len(scraped_data['materials'])} lecture materials.")
                    except Exception as e:
                        logger.warning(f"Browser materials scraping note: {e}")

                except Exception as e:
                    logger.warning(f"LMS navigation/scraping exception: {e}")

                # Attach scraped data to student_info
                student_info["_scraped_data"] = scraped_data

                # Extract all cookies from context
                all_cookies = await context.cookies()
                for c in all_cookies:
                    cookies_dict[c["name"]] = c["value"]

                logger.info(f"Session cookies extracted: {list(cookies_dict.keys())}")
                await browser.close()
                return True, "", cookies_dict, student_info

            except Exception as e:
                logger.error(f"Playwright page interaction exception: {e}")
                await browser.close()
                return False, f"Connection to university portal timed out or failed: {str(e)}", {}, {}

    except Exception as e:
        logger.error(f"Playwright launch exception: {e}")
        return False, f"Browser automation error: {str(e)}", {}, {}

async def login_with_browser(
    enrollment: str,
    password: str,
    campus_name: str,
    campus_id: str = "2",
    timeout_ms: int = 45000,
    scrape_data: bool = True,
) -> Tuple[bool, str, Dict[str, str], Dict[str, Any]]:
    """
    Automates Bahria CMS login via Playwright Chromium.
    Authenticates, transitions to LMS via GoToLMS.aspx, and extracts session cookies
    so subsequent scraping can run via high-speed async HTTPX requests.

    On Windows: if the current event loop is not a ProactorEventLoop (such as when uvicorn
    runs with reload=True and creates a SelectorEventLoop), automatically dispatches
    execution to a background thread equipped with a dedicated ProactorEventLoop to avoid
    asyncio.subprocess NotImplementedError.

    Returns:
        (success: bool, error_msg: str, cookies_dict: dict, student_info: dict)
    """
    loop = asyncio.get_running_loop()
    if sys.platform == "win32" and not isinstance(loop, getattr(asyncio, "ProactorEventLoop", ())):
        logger.info("Current loop is SelectorEventLoop on Windows. Dispatching Playwright to Proactor worker thread...")
        def _worker():
            w_loop = asyncio.ProactorEventLoop()
            asyncio.set_event_loop(w_loop)
            try:
                return w_loop.run_until_complete(
                    _async_browser_login(enrollment, password, campus_name, campus_id, timeout_ms, scrape_data)
                )
            finally:
                w_loop.close()

        return await asyncio.to_thread(_worker)

    return await _async_browser_login(enrollment, password, campus_name, campus_id, timeout_ms, scrape_data)
