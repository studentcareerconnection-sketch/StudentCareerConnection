"""Scrape the Schedule of Classes (WebSoc) at https://www.reg.uci.edu/perl/WebSoc.

WebSoc needs at least one filter besides the term, so we query one department at a time.

Output: data/websoc/<YearTerm>.json, e.g. data/websoc/2026-92.json:
{
  "term": "2026-92", "term_name": "2026 Fall Quarter", "scraped_at": "...",
  "courses": [
    {"id": "I&C SCI 31", "dept": "I&C SCI", "number": "31", "title": "INTRO TO PROGRAMMING",
     "comments": ["..."],
     "sections": [
        {"code": "36040", "type": "Lec", "section": "A", "units": "4",
         "instructors": ["ALFARO, S."], "modality": "In-Person",
         "meetings": [{"days": ["Tu","Th"], "start": 570, "end": 650, "raw": "TuTh 9:30-10:50", "place": "ALP 2300"}],
         "final": "Thu, Dec 10, 8:00-10:00am", "max": 182, "enrolled": 147, "enrolled_total": 147,
         "waitlist": null, "requests": 240, "restrictions": ["A"], "status": "OPEN", "comments": []}
     ]}
  ]
}
start/end are minutes after midnight (24h), or null for TBA.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from bs4 import BeautifulSoup

from .common import DATA_DIR, Fetcher, clean, write_json

URL = "https://www.reg.uci.edu/perl/WebSoc"
DAY_RE = re.compile(r"Su|Sa|Th|Tu|M|W|F")
TIME_RE = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(p)?", re.I)
STATUS_ALIASES = {"WAITL": "WAITLIST", "NEWONLY": "NEW_ONLY"}
# Header text -> key. The column set varies by term (e.g. older terms have no WL column),
# so each course's header row decides which cell is which.
HEADER_KEYS = {"code": "code", "type": "type", "sec": "section", "units": "units",
               "instructor": "instructors", "modality": "modality", "time": "time", "place": "place",
               "final": "final", "max": "max", "enr": "enrolled", "wl": "waitlist", "req": "requests",
               "nor": "non_affiliated", "rstr": "restrictions", "textbooks": "textbooks",
               "web": "web", "status": "status"}


def get_form_options(fetcher: Fetcher) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Return ([(term_value, term_name)], [(dept_value, dept_name)]) from the search form."""
    soup = BeautifulSoup(fetcher.fetch(URL), "html.parser")

    def opts(name):
        sel = soup.find("select", {"name": name})
        return [(o["value"], clean(o.get_text())) for o in sel.find_all("option")]

    terms = opts("YearTerm")
    depts = [(v, re.sub(r"\s*\.[ .]*", " - ", n, count=1)) for v, n in opts("Dept") if v.strip() != "ALL"]
    return terms, depts


def default_term(terms: list[tuple[str, str]]) -> str:
    """The form pre-selects the current term; fall back to the first listed."""
    return terms[0][0]


def parse_time(raw: str) -> tuple[int | None, int | None]:
    m = TIME_RE.search(raw)
    if not m:
        return None, None
    sh, sm, eh, em, pm = int(m[1]), int(m[2]), int(m[3]), int(m[4]), bool(m[5])
    if pm and eh != 12:
        eh += 12
    # The start is PM too if moving it into the afternoon still keeps it before the end.
    if pm and sh != 12 and (sh + 12) * 60 + sm <= eh * 60 + em:
        sh += 12
    return sh * 60 + sm, eh * 60 + em


def parse_meetings(time_td, place_td) -> list[dict]:
    def lines(td):
        return [clean(t) for t in td.get_text("\n").split("\n") if clean(t)]

    times, places = lines(time_td), lines(place_td)
    meetings = []
    for i, raw in enumerate(times or ["TBA"]):
        day_part = raw.split(" ")[0] if TIME_RE.search(raw) else ""
        start, end = parse_time(raw)
        meetings.append({
            "days": DAY_RE.findall(day_part) if start is not None else [],
            "start": start,
            "end": end,
            "raw": raw,
            "place": places[i] if i < len(places) else (places[-1] if places else ""),
        })
    return meetings


def _int(s: str) -> int | None:
    s = s.strip()
    return int(s) if s.isdigit() else None


def parse_section(tds, columns: list[str]) -> dict:
    cells = dict(zip(columns, tds))
    txt = {k: clean(v.get_text(" ")) for k, v in cells.items()}
    blank = BeautifulSoup("<td></td>", "html.parser").td
    for key in HEADER_KEYS.values():
        txt.setdefault(key, "")
        cells.setdefault(key, blank)

    # Enr can be "45" or "12 / 45" (this section / all cross-listed sections)
    enr = txt["enrolled"].split("/")
    return {
        "code": txt["code"],
        "type": txt["type"],
        "section": txt["section"],
        "units": txt["units"],
        "instructors": [clean(t) for t in cells["instructors"].get_text("\n").split("\n") if clean(t)],
        "modality": txt["modality"],
        "meetings": parse_meetings(cells["time"], cells["place"]),
        "final": txt["final"],
        "max": _int(txt["max"]),
        "enrolled": _int(enr[0]),
        "enrolled_total": _int(enr[-1]),
        "waitlist": _int(txt["waitlist"]),
        "requests": _int(txt["requests"]),
        "restrictions": [r for r in re.split(r"\s*(?:and|or|&)\s*|\s+", txt["restrictions"]) if r],
        "status": STATUS_ALIASES.get(txt["status"].upper(), txt["status"].upper()),
        "comments": [],
    }


def parse_title(td) -> tuple[str, str, str]:
    bold = td.find("b")
    title = clean(bold.get_text()) if bold else ""
    # Text before the <font>/<b> is "&nbsp; I&C Sci &nbsp; 31 &nbsp;"
    head = clean("".join(s for s in td.find_all(string=True, recursive=False)))
    head = head.split("(")[0].strip()
    dept, _, number = head.rpartition(" ")
    return dept.upper(), number, title


def parse_results(html: bytes) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser", from_encoding="iso-8859-1")
    course_list = soup.find("div", class_="course-list")
    table = course_list.find("table") if course_list else None
    if table is None:  # no classes match (e.g. a department with nothing in a Law term)
        return []
    courses, course, columns = [], None, []
    # Only the outer table's rows: comment boxes are nested tables and would repeat otherwise.
    for tr in table.find_all("tr", recursive=False):
        tds = tr.find_all("td", recursive=False)
        title_td = tr.find("td", class_="CourseTitle", recursive=False)
        if title_td is not None:
            dept, number, title = parse_title(title_td)
            course = {"id": f"{dept} {number}", "dept": dept, "number": number,
                      "title": title, "comments": [], "sections": []}
            courses.append(course)
        elif course is None:
            continue
        elif tr.find("th", recursive=False) is not None:
            columns = [HEADER_KEYS.get(clean(th.get_text()).lower(), clean(th.get_text()).lower())
                       for th in tr.find_all("th", recursive=False)]
        elif columns and len(tds) == len(columns) and clean(tds[0].get_text()).isdigit():
            course["sections"].append(parse_section(tds, columns))
        else:
            comment_tds = tr.find_all("td", class_="Comments")
            if not comment_tds:
                continue
            texts = [clean(td.get_text(" ")) for td in comment_tds]
            target = course["sections"][-1]["comments"] if course["sections"] else course["comments"]
            target.extend(t for t in texts if t)
    return courses


def query(fetcher: Fetcher, term: str, dept: str) -> bytes:
    form = {
        "YearTerm": term,
        "Dept": dept,
        "ShowComments": "on",
        "ShowFinals": "on",
        "Breadth": "ANY",
        "Division": "ANY",
        "ClassType": "ALL",
        "FullCourses": "ANY",
        "CancelledCourses": "Exclude",
        "Submit": "Display Web Results",
    }
    return fetcher.fetch(URL, data=form)


def scrape_term(fetcher: Fetcher, term: str, term_name: str, depts, only: set[str] | None = None) -> dict:
    all_courses = []
    selected = [(v, n) for v, n in depts if not only or v in only]
    print(f"[websoc] {term_name} ({term}): {len(selected)} departments")
    failed = []
    for i, (value, name) in enumerate(selected, 1):
        try:
            courses = parse_results(query(fetcher, term, value))
        except Exception as e:  # one bad department shouldn't lose the whole term
            print(f"  ! [{i}/{len(selected)}] {value}: {e}")
            failed.append(value)
            continue
        n_sec = sum(len(c["sections"]) for c in courses)
        print(f"  [{i}/{len(selected)}] {value}: {len(courses)} courses, {n_sec} sections")
        all_courses.extend(courses)
    return {
        "term": term,
        "term_name": term_name,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "failed_depts": failed,
        "courses": all_courses,
    }


def main(fetcher: Fetcher, terms: list[str] | None = None, depts: list[str] | None = None) -> None:
    term_opts, dept_opts = get_form_options(fetcher)
    names = dict(term_opts)
    if terms == ["all"]:
        terms = [v for v, _ in term_opts]
    for term in terms or [default_term(term_opts)]:
        if term not in names:
            raise SystemExit(f"Unknown term {term!r}. Available: {', '.join(v for v, _ in term_opts[:12])} ...")
        result = scrape_term(fetcher, term, names[term], dept_opts, set(depts) if depts else None)
        write_json(result, DATA_DIR / "websoc" / f"{term}.json")
