"""Scrape every course from https://catalogue.uci.edu/allcourses/.

Output: data/catalogue/courses.json — a list of courses:
{
  "id": "I&C SCI 46", "dept": "I&C SCI", "number": "46",
  "title": "...", "units": {"min": 4, "max": 4, "text": "4 Units."},
  "description": "...",
  "prerequisite": {"text": "...", "courses": ["I&C SCI 45C", ...]} | null,
  "corequisite": ..., "restriction": ..., "same_as": ..., "overlaps_with": ..., "concurrent_with": ...,
  "ge": ["II", "Vb"], "grading_option": "...", "repeatability": "...",
  "details": {<every raw 'Label:' field, for anything not mapped above>}
}
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .common import DATA_DIR, Fetcher, clean, write_json

BASE = "https://catalogue.uci.edu"
INDEX = BASE + "/allcourses/"

# CourseLeaf field class -> output key. Fields whose text contains linked course codes
# also get a "courses" list extracted from the bubblelinks.
LINKED_FIELDS = {
    "prereqs": "prerequisite",
    "corequisites": "corequisite",
    "coreqs": "corequisite",
    "restrictions": "restriction",
    "same_as": "same_as",
    "overlaps_with": "overlaps_with",
    "concurrent_with": "concurrent_with",
    "prereq_coreq": "prerequisite_or_corequisite",
}
TEXT_FIELDS = {"grading_option", "repeatability"}
GE_RE = re.compile(r"\(([IVX]+[ab]?)\)", re.I)


def dept_pages(fetcher: Fetcher) -> list[tuple[str, str]]:
    soup = BeautifulSoup(fetcher.fetch(INDEX), "html.parser")
    container = soup.find(id="textcontainer") or soup
    pages = {}
    for a in container.find_all("a", href=re.compile(r"^/allcourses/[^/]+/?$")):
        pages[urljoin(BASE, a["href"])] = clean(a.get_text())
    return sorted(pages.items())


def _code_of(link) -> str:
    return clean(link.get("title") or link.get_text())


def parse_units(text: str) -> dict:
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", text)]
    as_num = lambda x: int(x) if x == int(x) else x  # noqa: E731
    return {"min": as_num(min(nums)) if nums else None,
            "max": as_num(max(nums)) if nums else None,
            "text": text}


def parse_block(block) -> dict:
    code = clean(block.find(class_="detail-code").get_text()).rstrip(".")
    dept, _, number = code.rpartition(" ")
    title_el = block.find(class_="detail-title")
    units_el = block.find(class_="detail-hours_html")
    desc_el = block.find(class_="courseblockextra")

    course = {
        "id": code,
        "dept": dept,
        "number": number,
        "title": clean(title_el.get_text()).rstrip(".") if title_el else "",
        "units": parse_units(clean(units_el.get_text())) if units_el else None,
        "description": clean(desc_el.get_text()) if desc_el else "",
        "ge": [],
        "details": {},
    }

    for span in block.find_all("span", class_=re.compile(r"^detail-")):
        field = next(c[len("detail-"):] for c in span["class"] if c.startswith("detail-"))
        if field in ("code", "title", "hours_html"):
            continue
        label_el = span.find(class_="label")
        label = clean(label_el.get_text()).rstrip(":") if label_el else field
        if label_el:
            label_el.extract()
        text = clean(span.get_text(" "))
        text = re.sub(r"\s+([.,;)])", r"\1", text).replace("( ", "(")
        course["details"][label] = text

        if field == "gened":
            course["ge"] = [g.upper()[:-1] + g[-1].lower() if g[-1] in "abAB" else g.upper()
                            for g in GE_RE.findall(text)]
        elif field in LINKED_FIELDS:
            course[LINKED_FIELDS[field]] = {
                "text": text,
                "courses": list(dict.fromkeys(_code_of(a) for a in span.find_all("a", class_="bubblelink"))),
            }
        elif field in TEXT_FIELDS:
            course[field] = text
    return course


def scrape(fetcher: Fetcher) -> list[dict]:
    courses = []
    pages = dept_pages(fetcher)
    print(f"[catalogue] {len(pages)} department course pages")
    for i, (url, name) in enumerate(pages, 1):
        soup = BeautifulSoup(fetcher.fetch(url), "html.parser")
        blocks = soup.find_all("div", class_="courseblock")
        for b in blocks:
            try:
                c = parse_block(b)
                c["dept_name"] = name
                courses.append(c)
            except Exception as e:  # keep going; one odd block shouldn't kill the run
                print(f"  ! failed to parse a block on {url}: {e}")
        print(f"  [{i}/{len(pages)}] {name}: {len(blocks)} courses")
    return courses


def main(fetcher: Fetcher) -> None:
    courses = scrape(fetcher)
    write_json(courses, DATA_DIR / "catalogue" / "courses.json")
    print(f"[catalogue] {len(courses)} courses total")
