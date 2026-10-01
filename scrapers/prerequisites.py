"""Scrape enforced prerequisites from the Registrar: https://www.reg.uci.edu/cob/prrqcgi

Unlike the catalogue's prose, these use explicit AND / OR / parentheses, so we can parse
them into a logic tree the planner can evaluate.

Output: data/prerequisites.json — {course_id: {"title", "raw", "tree"}}, where tree nodes are:
  {"and": [node, ...]}  |  {"or": [node, ...]}
  {"course": "I&C SCI 33", "min_grade": "C", "coreq": false, "recommended": false}
  {"exam": "AP COMP SCI A", "min_score": "3"}
  {"not": "MATH 3A"}                       # "NO MATH 3A": must NOT have taken it
  {"other": "LOWER DIVISION STANDING ONLY"} # standing / major restrictions etc.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from bs4 import BeautifulSoup

from .common import DATA_DIR, Fetcher, clean, write_json

URL = "https://www.reg.uci.edu/cob/prrqcgi"

MODIFIER_RE = re.compile(r"\(\s*([a-z][^()]*?)\s*\)")   # "( min grade = C )", "( coreq )" — always lowercase
TOKEN_RE = re.compile(r"(\(|\)|\bAND\b|\bOR\b)")
COURSE_RE = re.compile(r"^(.+?)\s+([A-Z]{0,2}\d+[A-Z0-9]*)$")


def departments(fetcher: Fetcher) -> list[str]:
    # lxml, because the page leaves <option> tags unclosed and html.parser nests them.
    soup = BeautifulSoup(fetcher.fetch(URL), "lxml")
    sel = soup.find("select", {"name": "dept"})
    names = (clean(o.get("value") or o.get_text()) for o in sel.find_all("option"))
    return [n for n in names if n and not n.startswith("Select")]


def _leaf(text: str, mods: list[str]) -> dict:
    text = clean(text)
    info = {}
    for m in mods:
        if "=" in m:
            k, v = (clean(x) for x in m.split("=", 1))
            info[k.replace(" ", "_")] = v
        else:
            info[clean(m).replace(" ", "_")] = True

    if text.startswith("NO "):
        return {"not": text[3:].strip()}
    if text.startswith("AP ") or "min_score" in info:
        return {"exam": text, **info}
    m = COURSE_RE.match(text)
    if m and m[1].upper() == m[1] and len(m[1]) <= 10:
        node = {"course": f"{m[1]} {m[2]}", **info}
        node.setdefault("coreq", False)
        node.setdefault("recommended", False)
        return node
    return {"other": text, **info}


def parse_prereq(raw: str) -> dict | None:
    """Parse registrar prereq text into a tree. AND binds tighter than OR."""
    raw = clean(raw)
    if not raw:
        return None

    # Pull modifiers out first so their parentheses don't look like grouping.
    mods: list[str] = []

    def stash(m):
        mods.append(m[1])
        return f" \x00{len(mods) - 1}\x00 "

    text = MODIFIER_RE.sub(stash, raw)
    tokens = [t.strip() for t in TOKEN_RE.split(text) if t.strip()]
    pos = 0

    def leaf_from(tok: str) -> dict:
        idx = [int(i) for i in re.findall(r"\x00(\d+)\x00", tok)]
        return _leaf(re.sub(r"\x00\d+\x00", "", tok), [mods[i] for i in idx])

    def parse_or():
        nonlocal pos
        items = [parse_and()]
        while pos < len(tokens) and tokens[pos] == "OR":
            pos += 1
            items.append(parse_and())
        return items[0] if len(items) == 1 else {"or": items}

    def parse_and():
        nonlocal pos
        items = [parse_atom()]
        while pos < len(tokens) and tokens[pos] == "AND":
            pos += 1
            items.append(parse_atom())
        return items[0] if len(items) == 1 else {"and": items}

    def parse_atom():
        nonlocal pos
        if pos >= len(tokens):
            return {"other": ""}
        tok = tokens[pos]
        pos += 1
        if tok == "(":
            node = parse_or()
            if pos < len(tokens) and tokens[pos] == ")":
                pos += 1
            return node
        return leaf_from(tok)

    tree = parse_or()
    # A trailing modifier with no leaf of its own (e.g. a lone "( recommended )") is dropped
    # by the tokenizer; anything left unparsed means our grammar missed something.
    if pos < len(tokens):
        return {"and": [tree, {"other": " ".join(tokens[pos:]).replace("\x00", "")}]}
    return tree


def parse_page(html: bytes) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    out = {}
    for tr in soup.find_all("tr"):
        course_td = tr.find("td", class_="course", recursive=False)
        prereq_td = tr.find("td", class_="prereq", recursive=False)
        if not course_td or not prereq_td:
            continue
        course_id = clean(course_td.get_text())
        if not course_id:
            continue
        title_td = tr.find("td", class_="title", recursive=False)
        raw = clean(prereq_td.get_text(" "))
        out[course_id] = {
            "title": clean(title_td.get_text()) if title_td else "",
            "raw": raw,
            "tree": parse_prereq(raw),
        }
    return out


def scrape(fetcher: Fetcher) -> dict:
    depts = departments(fetcher)
    print(f"[prereqs] {len(depts)} departments")
    result = {}
    for i, dept in enumerate(depts, 1):
        # action=view_all = every prerequisite on file (not only those enforced this term)
        html = fetcher.fetch(f"{URL}?dept={quote(dept)}&action=view_all")
        page = parse_page(html)
        result.update(page)
        print(f"  [{i}/{len(depts)}] {dept}: {len(page)} courses")
    return result


def main(fetcher: Fetcher) -> None:
    data = scrape(fetcher)
    write_json(data, DATA_DIR / "prerequisites.json")
    print(f"[prereqs] {len(data)} courses with prerequisites")
