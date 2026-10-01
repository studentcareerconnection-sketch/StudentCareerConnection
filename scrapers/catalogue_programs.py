"""Scrape undergraduate degree/minor requirements from catalogue.uci.edu.

Source list: https://catalogue.uci.edu/undergraduatedegrees/

Output: data/catalogue/programs.json — a list of programs:
{
  "id": "computerscience_bs", "name": "Computer Science, B.S.", "degree": "bs",
  "url": "...", "school": "donaldbrenschoolofinformationandcomputersciences",
  "requirements": {
    "text": "<plain-text of the requirements tab, for display/fallback>",
    "lists": [ {"heading": "...", "rows": [<row>, ...]} ]
  },
  "sample_plan": [ {"year": "Freshman", "term": "Fall", "items": ["I&C SCI 31", ...]} ],
  "other_tabs": {"Upper-Division Areas of Study": {"text": ..., "lists": [...]}}
}

A requirement <row> mirrors one line of CourseLeaf's sc_courselist table:
  {"kind": "header",  "text": "Lower-division"}
  {"kind": "comment", "text": "A. Select one of the following series:", "indent": 0}
  {"kind": "course",  "codes": ["I&C SCI 31","I&C SCI 32","I&C SCI 33"], "text": "I&C SCI 31 - 32 - 33",
                      "title": "...", "units": "4", "alternative": false, "indent": 0}
  {"kind": "or"}   # separates alternative options
Course rows with "alternative": true are "or X" lines that pair with the previous course row.
The tables are semi-structured prose; turning them into a strict rule tree is left to the
planner app (the ordered rows keep every piece of information needed for that).
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .common import DATA_DIR, Fetcher, clean, write_json

BASE = "https://catalogue.uci.edu"
INDEX = BASE + "/undergraduatedegrees/"


def program_links(fetcher: Fetcher) -> list[tuple[str, str]]:
    soup = BeautifulSoup(fetcher.fetch(INDEX), "html.parser")
    container = soup.find(id="textcontainer") or soup
    links = {}
    for a in container.find_all("a", href=True):
        href = a["href"].split("#")[0]
        if not href.startswith("http") and re.search(r"_(bs|ba|bfa|bmus|minor)/?$", href):
            # some links on the index are missing their leading slash
            links[urljoin(BASE + "/", href.lstrip("/").rstrip("/") + "/")] = clean(a.get_text())
    return sorted(links.items(), key=lambda kv: kv[1])


def _indent(row) -> int:
    div = row.find("div", style=re.compile(r"margin-left"))
    if not div:
        return 0
    m = re.search(r"margin-left:\s*(\d+)", div["style"])
    return int(m.group(1)) // 20 if m else 0


def parse_courselist(table) -> list[dict]:
    rows = []
    body = table.find("tbody") or table
    for tr in body.find_all("tr", recursive=False):
        classes = tr.get("class") or []
        tds = tr.find_all("td", recursive=False)
        text = clean(tr.get_text(" "))
        if not text:
            continue

        if "areaheader" in classes or "areasubheader" in classes:
            rows.append({"kind": "header", "text": text})
            continue

        code_td = tr.find("td", class_="codecol")
        links = code_td.find_all("a", class_="bubblelink") if code_td else []
        if code_td and links:
            codes = list(dict.fromkeys(clean(a.get("title") or a.get_text()) for a in links))
            code_text = clean(code_td.get_text(" "))
            others = [td for td in tds if td is not code_td]
            hours_td = tr.find("td", class_="hourscol")
            title_tds = [td for td in others if td is not hours_td]
            alternative = "orclass" in classes or code_text.lower().startswith("or ")
            rows.append({
                "kind": "course",
                "codes": codes,
                "text": re.sub(r"^or\s+", "", code_text, flags=re.I),
                "title": clean(" ".join(td.get_text(" ") for td in title_tds)),
                "units": clean(hours_td.get_text()) if hours_td else "",
                "alternative": alternative,
                "indent": _indent(tr),
            })
            continue

        if text.lower() == "or":
            rows.append({"kind": "or"})
        else:
            # comment lines may still mention courses inline ("MATH 3A or ...")
            codes = [clean(a.get("title") or a.get_text()) for a in tr.find_all("a", class_="bubblelink")]
            row = {"kind": "comment", "text": text, "indent": _indent(tr)}
            if codes:
                row["codes"] = list(dict.fromkeys(codes))
            rows.append(row)
    return rows


def parse_plangrid(table) -> list[dict]:
    plan, year, terms = [], "", []
    for tr in table.find_all("tr"):
        classes = tr.get("class") or []
        cells = [clean(c.get_text(" ")) for c in tr.find_all(["td", "th"])]
        if "plangridyear" in classes:
            year = cells[0] if cells else ""
            continue
        if "plangridterm" in classes:
            terms = cells
            continue
        if "plangridsum" in classes or "plangridtotal" in classes or not terms:
            continue
        for term, item in zip(terms, cells):
            if not item or item.lower().startswith("units"):
                continue
            slot = next((p for p in plan if p["year"] == year and p["term"] == term), None)
            if slot is None:
                slot = {"year": year, "term": term, "items": []}
                plan.append(slot)
            slot["items"].append(item)
    return plan


def parse_container(container) -> dict:
    lists = []
    for table in container.find_all("table", class_="sc_courselist"):
        heading_el = table.find_previous(["h2", "h3", "h4"])
        heading = clean(heading_el.get_text()) if heading_el and container in heading_el.parents else ""
        lists.append({"heading": heading, "rows": parse_courselist(table)})
    return {"text": clean(container.get_text(" ")), "lists": lists}


def parse_program(html: bytes, url: str, name: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    path_parts = url.replace(BASE, "").strip("/").split("/")
    program = {
        "id": slug,
        "name": name,
        "degree": slug.rsplit("_", 1)[-1],
        "url": url,
        "school": path_parts[0] if len(path_parts) > 1 else "",
        "department": path_parts[1] if len(path_parts) > 2 else "",
        "requirements": {"text": "", "lists": []},
        "sample_plan": [],
        "other_tabs": {},
    }

    # Tabbed pages: each tab N has <li id="Ntexttab"><a>Label</a></li> and <div id="Ntextcontainer">.
    tab_labels = {}
    for li in soup.select("#tabs li[id$='texttab'], ul.tabs li[id$='texttab']"):
        tab_labels[li["id"][: -len("tab")]] = clean(li.get_text())

    containers = soup.find_all("div", id=re.compile(r"textcontainer$"))
    req = soup.find(id="requirementstextcontainer")
    if req is None:
        # Untabbed page (common for minors): the main textcontainer holds the requirements.
        req = soup.find(id="textcontainer")
    if req is not None:
        program["requirements"] = parse_container(req)

    for c in containers:
        if c is req:
            continue
        key = c["id"][: -len("container")]
        label = tab_labels.get(key, key.replace("text", "") or "Overview")
        if key in ("admissiontext", "relatedprogramstext"):
            program["other_tabs"][label] = {"text": clean(c.get_text(" ")), "lists": []}
        elif key != "sampleprogramtext":
            program["other_tabs"][label] = parse_container(c)

    grid = soup.find("table", class_="sc_plangrid")
    if grid is not None:
        program["sample_plan"] = parse_plangrid(grid)
    return program


def scrape(fetcher: Fetcher) -> list[dict]:
    links = program_links(fetcher)
    print(f"[programs] {len(links)} undergraduate programs")
    programs = []
    for i, (url, name) in enumerate(links, 1):
        try:
            p = parse_program(fetcher.fetch(url), url, name)
            programs.append(p)
            n = sum(len(lst["rows"]) for lst in p["requirements"]["lists"])
            print(f"  [{i}/{len(links)}] {name}: {n} requirement rows")
        except Exception as e:
            print(f"  ! [{i}/{len(links)}] {name}: {e}")
    return programs


def main(fetcher: Fetcher) -> None:
    programs = scrape(fetcher)
    write_json(programs, DATA_DIR / "catalogue" / "programs.json")
