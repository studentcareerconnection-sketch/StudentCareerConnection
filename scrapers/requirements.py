"""Turn a program's catalogue requirement rows into structured requirement groups.

Catalogue requirement tables are prose ("B. Select three of the following:", "FA1: Vision
and Graphics", "COMPSCI 103-189"). This parser recognises the common phrasings and emits:

  {
    "label": "B. Flexible Core Requirement (4 courses)",
    "section": "Upper-division (17 courses)",       # nearest header row
    "kind": "all" | "choose",
    "count": 4 | null,          # courses (slots) to pick, for kind=choose
    "units": 12 | null,         # or a unit total to reach
    "min_areas": 4 | null,      # picks must come from at least this many areas
    "single_area": false,       # all picks from one area ("12 units in one of the following areas")
    "areas": [{"label": "FA1: Vision and Graphics",
               "slots": [[["COMPSCI 112"]], ...],   # slot -> alternatives -> series of courses
               "ranges": [{"dept": "COMPSCI", "prefix": "", "from": 103, "to": 189}]}],
    "notes": ["Courses used in one section may not apply to another ..."],
    "status": "ok" | "manual"   # manual = no course list we could extract; show the text
  }

A slot is satisfied by completing any one of its alternatives; an alternative is a list of
courses that must all be taken (a series like I&C SCI 31-32-33).
"""
from __future__ import annotations

import re

NUMBERS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen".split())}
NUM = r"(\d+|" + "|".join(NUMBERS) + r")"

LETTERED_RE = re.compile(r"^(?:[A-Z]|\(\d+\)|\d+)\.?\s+|^\([a-z\d]+\)\s*")
MAX_COUNT = 20  # anything larger is a course number ("numbered 102 or above"), not a count
CHOOSE_RES = [
    re.compile(r"\b(?:select|choose|complete|take)\s+(?:at\s+least\s+|a\s+minimum\s+of\s+)?" + NUM + r"\b(?!\s*units)", re.I),
    re.compile(r"\b(?:select|choose|complete|take|plus)\b[^.]*?\b" + NUM + r"\b(?:\s+(?:additional|more|upper-division|lower-division|four-unit|elective|approved|other|courses?|of|from|,))", re.I),
    re.compile(r"\b(?:a\s+)?minimum\s+of\s+" + NUM + r"\s+(?:additional\s+|upper-division\s+)*(?:courses?|electives?)", re.I),
    re.compile(r"\b(?:select|choose|complete|take)\s+" + NUM + r"\s+(?:[\w&/-]+\s+){0,3}?(?:courses?|electives?)\b", re.I),
    re.compile(r"\(" + NUM + r"\s+courses?\)", re.I),
    re.compile(r"^(?:[A-Z]\.\s*)?" + NUM + r"\s+(?:additional\s+|upper-division\s+|lower-division\s+)*(?:courses?|electives?)\b", re.I),
    re.compile(r"\b" + NUM + r"\s+of\s+the\s+following\b", re.I),
]
UNITS_RE = re.compile(r"\b(?:minimum\s+of\s+|select\s+|complete\s+|total\s+of\s+)?" + NUM + r"\s+(?:additional\s+)?units\b", re.I)
DISTINCT_RE = re.compile(r"(?:at\s+least\s+)?" + NUM + r"\s+(?:distinct|different|separate)?\s*(?:of\s+the\s+(?:following\s+)?(?:\w+\s+)?)?(?:focus\s+)?(?:areas|rubrics|categories|groups|tracks|clusters|themes)\b", re.I)
SERIES_RE = re.compile(r"\bone\s+of\s+the\s+following\s+series\b|\bselect\s+one\s+series\b", re.I)
ALL_RE = re.compile(r"^(?:[A-Z]\.\s*)?(?:complete\b|required\b|requires\b|core\b|the\s+following\b)|\bcomplete(?:\s+the\s+following)?\s*:|\brequired\b.*:\s*$|courses?:\s*$", re.I)
RANGE_DEPT_RE = re.compile(r"([A-Z][A-Z&/]*(?:\s[A-Z&/]+)*)\s+((?:[A-Z]{0,2}\d+[A-Z]?\s*(?:[-–—]\s*[A-Z]{0,2}\d+[A-Z]?)?\s*(?:,\s*|and\s+)?)+)")
RANGE_ITEM_RE = re.compile(r"([A-Z]{0,2})(\d+)[A-Z]?(?:\s*[-–—]\s*([A-Z]{0,2})(\d+)[A-Z]?)?")


def to_int(word: str) -> int:
    return int(word) if word.isdigit() else NUMBERS[word.lower()]


def instruction(text: str) -> dict | None:
    """Parse an instruction comment. Returns None if the text isn't an instruction."""
    t = text.strip()
    info: dict = {}
    if SERIES_RE.search(t):
        info.update(kind="choose", count=1)
    if re.search(r"\bin\s+(?:one|a\s+single)\s+of\s+the\s+following\s+(?:areas|emphases|tracks|clusters)", t, re.I):
        info.update(kind="choose", single_area=True)
    elif m := DISTINCT_RE.search(t):
        info.update(kind="choose", min_areas=to_int(m[1]))
    if "count" not in info:
        for rx in CHOOSE_RES:
            n = next((to_int(m[1]) for m in rx.finditer(t) if to_int(m[1]) <= MAX_COUNT), None)
            if n is not None:
                info.update(kind="choose", count=n)
                break
    # "Complete one course from at least four distinct areas" means four courses in total.
    if info.get("min_areas") and (info.get("count") or 0) < info["min_areas"]:
        info["count"] = info["min_areas"]
    if m := UNITS_RE.search(t):
        if info.get("single_area") or re.search(r"select|minimum|complete|total|additional|elective", t, re.I):
            info.update(kind="choose", units=to_int(m[1]))
            if info.get("single_area"):
                info.pop("count", None)
    if not info and ALL_RE.search(t):
        info["kind"] = "all"
    return info or None


def parse_ranges(text: str, depts: set[str]) -> list[dict]:
    """'AFAM 110–159, 163' -> ranges; 'BIO SCI D103–D189, E106–E189' keeps letter prefixes."""
    ranges = []
    for m in RANGE_DEPT_RE.finditer(text):
        dept = m[1].strip()
        # longest known department suffix, e.g. "from COMPSCI" -> "COMPSCI"
        words = dept.split()
        dept = next((" ".join(words[i:]) for i in range(len(words)) if " ".join(words[i:]) in depts), None)
        if not dept:
            continue
        for item in RANGE_ITEM_RE.finditer(m[2]):
            lo = int(item[2])
            hi = int(item[4]) if item[4] else lo
            if hi < lo:  # "COMPSCI 103 -189" is fine; anything reversed is noise
                continue
            ranges.append({"dept": dept, "prefix": item[1] or "", "from": lo, "to": hi})
    return ranges


def _new_group(label: str, section: str, info: dict | None) -> dict:
    info = info or {}
    return {
        "label": label,
        "section": section,
        "kind": info.get("kind", "all"),
        "count": info.get("count"),
        "units": info.get("units"),
        "min_areas": info.get("min_areas"),  # picks must cover at least this many areas
        "single_area": info.get("single_area", False),  # all picks from the same area
        "areas": [{"label": "", "slots": [], "ranges": []}],
        "notes": [],
        "status": "ok",
    }


def _has_items(group: dict) -> bool:
    return any(a["slots"] or a["ranges"] for a in group["areas"])


FOOTNOTE_RE = re.compile(r"(?<=[a-z.:)\d])\s+\d$")  # "SOCIOL 112-199 2" -> footnote 2


def parse_groups(rows: list[dict], heading: str, depts: set[str]) -> list[dict]:
    groups: list[dict] = []
    section = heading
    group: dict | None = None
    pending_or = False
    pending_notes: list[str] = []  # prose seen before the group it belongs to

    def start(label: str, info: dict | None) -> dict:
        nonlocal group, pending_notes
        group = _new_group(label, section, info)
        group["notes"].extend(pending_notes)
        pending_notes = []
        groups.append(group)
        return group

    def current() -> dict:
        return group if group is not None else start(section or heading, None)

    for i, row in enumerate(rows):
        kind = row["kind"]
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        if kind == "header":
            text = row["text"].strip()
            # "Anthropology:" followed by indented courses inside "Select three of the following"
            # is an area of that choice, not a new section.
            in_areas = group is not None and (not _has_items(group) or bool(group["areas"][-1]["label"]))
            if (group is not None and group["kind"] == "choose" and in_areas and not LETTERED_RE.match(text)
                    and nxt and nxt["kind"] in ("course", "comment") and nxt.get("indent", 0) > 0):
                _add_area(group, text, [])
                continue
            section, group, pending_or = text, None, False
            continue
        if kind == "or":
            pending_or = True
            continue
        if kind == "course":
            area = current()["areas"][-1]
            series = row["codes"]
            if (row.get("alternative") or pending_or) and area["slots"]:
                area["slots"][-1].append(series)
            else:
                area["slots"].append([series])
            pending_or = False
            continue

        # comment row
        text = FOOTNOTE_RE.sub("", row["text"].strip())
        if text.lower() in ("and", "or equivalent", "or"):
            continue
        info = instruction(text)
        ranges = parse_ranges(text, depts)
        lettered = bool(LETTERED_RE.match(text))
        # Long prose that merely says "complete" ("Complete sections A-D. Courses used in one
        # section may not apply to another...") is a note, not a requirement of its own.
        if info and info.get("kind") == "all" and not lettered and not text.endswith(":") and len(text) > 60:
            info = None
        if info:
            # An instruction starts a new group, unless it refines one that is still empty:
            # "B. Flexible Core (4 courses)" then "Complete one course from at least four areas".
            if group is not None and not lettered and not _has_items(group):
                for k in ("kind", "count", "units", "min_areas"):
                    if info.get(k) is not None:
                        group[k] = info[k]
                group["single_area"] = group["single_area"] or info.get("single_area", False)
                group["label"] += " " + text
            else:
                start(text, info)
            group["areas"][-1]["ranges"].extend(ranges)
            pending_or = False
            continue

        if lettered:
            start(text, None)
            group["areas"][-1]["ranges"].extend(ranges)
            continue
        if group is None and not ranges:
            pending_notes.append(text)
            continue
        g = current()
        is_area_label = g["kind"] == "choose" and len(text) < 120 and (
            text.endswith(":") or re.match(r"^(FA\d+|Area|Track|Category|Group|Emphasis|Module)\b", text, re.I)
            or (ranges and re.match(r"^[A-Z][\w/& ,'-]*\(", text)))
        if is_area_label:
            _add_area(g, text, ranges)
        elif ranges and len(text) < 120:
            g["areas"][-1]["ranges"].extend(ranges)
        else:
            g["notes"].append(text)

    if pending_notes and groups:
        groups[-1]["notes"].extend(pending_notes)

    for g in groups:
        if len(g["areas"]) > 1 and not (g["areas"][0]["label"] or g["areas"][0]["slots"] or g["areas"][0]["ranges"]):
            g["areas"].pop(0)
        n_slots = sum(len(a["slots"]) for a in g["areas"])
        has_ranges = any(a["ranges"] for a in g["areas"])
        # "A. Core (2 courses)" listing exactly two courses is just "complete these".
        if g["kind"] == "choose" and g["count"] and g["count"] >= n_slots > 0 and not has_ranges and not g["min_areas"]:
            g["kind"], g["count"] = "all", None
        if not _has_items(g):
            g["status"] = "manual"
        elif g["kind"] == "all" and not n_slots:
            g["status"] = "manual"  # "all of COMPSCI 103-189" isn't a real requirement; needs a count
        elif g["kind"] == "choose" and not g["count"] and not g["units"]:
            g["status"] = "manual"  # we know the options but not how many to take
    return groups


def _add_area(group: dict, label: str, ranges: list[dict]) -> None:
    last = group["areas"][-1]
    if last["slots"] or last["ranges"] or last["label"]:
        group["areas"].append({"label": label, "slots": [], "ranges": ranges})
    else:
        last.update(label=label, ranges=ranges)
