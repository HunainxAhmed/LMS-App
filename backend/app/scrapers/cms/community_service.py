import re
from typing import Dict, Any, List
from bs4 import BeautifulSoup

def parse_cms_community_services(html: str) -> Dict[str, Any]:
    """
    Parses Bahria University CMS CommunityServices.aspx page.
    URL: https://cms.bahria.edu.pk/Sys/Student/Exams/CommunityServices.aspx
    Extracts completed CSP events (semester, organization, job_title, completed_date, hours)
    and total completed CSP hours.
    """
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")

    records: List[Dict[str, Any]] = []
    total_hours = 0.0

    target_table = None
    for tbl in tables:
        txt = tbl.get_text().lower()
        if "organization" in txt and ("hour" in txt or "completed date" in txt or "community" in txt):
            target_table = tbl
            break

    if not target_table:
        target_table = soup.find(id=re.compile(r"gvCommunity|Community|Services|GridView", re.I))

    if not target_table:
        return {"total_hours": 0.0, "records": []}

    rows = target_table.find_all("tr")
    header_indices: Dict[str, int] = {}

    for row in rows:
        ths = row.find_all(["th", "td"])
        th_texts = [t.get_text(strip=True).lower() for t in ths]
        if any("organization" in t for t in th_texts):
            for idx, t in enumerate(th_texts):
                if "semester" in t:
                    header_indices["semester"] = idx
                elif "organization" in t:
                    header_indices["organization"] = idx
                elif "job" in t:
                    header_indices["job_title"] = idx
                elif "completed" in t or "date" in t:
                    header_indices["completed_date"] = idx
                elif "hour" in t:
                    header_indices["hours"] = idx
            break

    # Default indices if not found: [Semester, Organization, Job Title, Completed Date, Hours]
    if not header_indices:
        header_indices = {
            "semester": 0,
            "organization": 1,
            "job_title": 2,
            "completed_date": 3,
            "hours": 4,
        }

    for row in rows:
        tds = row.find_all("td")
        if len(tds) < 2:
            continue

        raw_texts = [td.get_text(strip=True) for td in tds]

        # Check if footer row (often just empty cells and a number in the last cell, e.g. "33")
        if len(raw_texts) >= 5 and not raw_texts[0] and not raw_texts[1] and re.search(r"^\d+(\.\d+)?$", raw_texts[-1]):
            try:
                footer_tot = float(raw_texts[-1])
                if footer_tot > total_hours:
                    total_hours = footer_tot
            except ValueError:
                pass
            continue

        sem_idx = header_indices.get("semester", 0)
        org_idx = header_indices.get("organization", 1)
        job_idx = header_indices.get("job_title", 2)
        date_idx = header_indices.get("completed_date", 3)
        hours_idx = header_indices.get("hours", 4)

        sem = raw_texts[sem_idx] if sem_idx < len(raw_texts) else ""
        org = raw_texts[org_idx] if org_idx < len(raw_texts) else ""
        job = raw_texts[job_idx] if job_idx < len(raw_texts) else "N/A"
        date_str = raw_texts[date_idx] if date_idx < len(raw_texts) else ""
        hours_str = raw_texts[hours_idx] if hours_idx < len(raw_texts) else "0"

        # Skip header rows
        if "semester" in sem.lower() or "organization" in org.lower() or "completed date" in date_str.lower():
            continue

        if not org and not sem:
            continue

        try:
            m = re.search(r"[\d.]+", hours_str)
            h_val = float(m.group()) if m else 0.0
        except Exception:
            h_val = 0.0

        records.append({
            "semester": sem,
            "organization": org,
            "job_title": job or "N/A",
            "completed_date": date_str,
            "hours": h_val,
        })

    computed_sum = sum(r["hours"] for r in records)
    final_total = max(total_hours, computed_sum)

    return {
        "total_hours": final_total,
        "records": records,
    }
