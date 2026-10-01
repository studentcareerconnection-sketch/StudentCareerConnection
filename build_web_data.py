"""Turn the raw scraped data in data/ into the compact files the web app loads.

Run after scraping:  python build_web_data.py

Writes to web/public/data/:
  courses.json          {course_id: {title, units, ge, description, prereq, prereq_text, restriction, same_as}}
  offerings.json        {"terms": [{id, name}], "courses": {course_id: [term_id, ...]}}
  programs.json         [{id, name, degree, school}]   (index for the picker)
  programs/<id>.json    requirement rows, structured requirement groups, sample plan
"""
import json
import re
from pathlib import Path

from scrapers.common import DATA_DIR, ROOT
from scrapers.program_tree import from_anteater, from_catalogue_groups
from scrapers.requirements import parse_groups

OUT = ROOT / "web" / "public" / "data"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(obj, path: Path, quiet: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if not quiet:
        print(f"  {path.relative_to(ROOT)}  {path.stat().st_size / 1024:.0f} KB")


def build_courses() -> None:
    prereqs = load(DATA_DIR / "prerequisites.json") if (DATA_DIR / "prerequisites.json").exists() else {}
    out = {}
    for c in load(DATA_DIR / "catalogue" / "courses.json"):
        units = c.get("units") or {}
        registrar = prereqs.get(c["id"], {})
        out[c["id"]] = {
            "title": c["title"],
            "dept": c["dept"],
            "units": [units.get("min"), units.get("max")],
            "ge": c.get("ge", []),
            "description": c.get("description", ""),
            # Registrar tree is authoritative (it's what WebReg enforces); catalogue text is the fallback.
            "prereq": registrar.get("tree"),
            "prereq_text": (c.get("prerequisite") or {}).get("text") or registrar.get("raw", ""),
            "restriction": (c.get("restriction") or {}).get("text", ""),
            "same_as": (c.get("same_as") or {}).get("courses", []),
        }
    dump(out, OUT / "courses.json")


PREVIOUSLY_RE = re.compile(r"Previously offered as ([A-Z&/ ]+?)\s+([A-Z]?\d+[A-Z0-9]*)\b")
COMMENT_DEPT_ALIASES = {"ICS": "I&C SCI"}  # comments use informal department names


def build_offerings() -> None:
    terms, offered, renamed = [], {}, {}
    for f in sorted((DATA_DIR / "websoc").glob("*.json"), reverse=True):
        data = load(f)
        terms.append({"id": data["term"], "name": data["term_name"]})
        for c in data["courses"]:
            # WebSoc can list one course several times in a term (e.g. BIO SCI 199 once per instructor)
            if c["sections"] and data["term"] not in offered.setdefault(c["id"], []):
                offered[c["id"]].append(data["term"])
            for comment in c["comments"]:
                if m := PREVIOUSLY_RE.search(comment):
                    renamed[c["id"]] = f"{COMMENT_DEPT_ALIASES.get(m[1], m[1])} {m[2]}"

    # A renumbered course inherits its old number's history, so it doesn't look brand new.
    order = {t["id"]: i for i, t in enumerate(terms)}  # newest first
    merged = 0
    for new, old in renamed.items():
        if old in offered and old != new:
            offered[new] = sorted(set(offered[new]) | set(offered[old]), key=order.__getitem__)
            merged += 1
    print(f"  merged history for {merged} renumbered courses")
    dump({"terms": terms, "courses": offered}, OUT / "offerings.json")


DEGREE_CODES = {"B.A.": "ba", "B.S.": "bs", "B.F.A.": "bfa", "B.Mus.": "bmus"}


def _name_key(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower().replace("&", "and"))


def build_programs() -> None:
    """Degree requirements: Anteater API (DegreeWorks) first, catalogue prose as the fallback.

    Every program file has the same requirement tree format (scrapers/program_tree.py), plus the
    catalogue's sample plan and page link when the program can be matched by name.
    """
    catalogue_courses = load(DATA_DIR / "catalogue" / "courses.json")
    ids_by_dept: dict[str, list[str]] = {}
    for c in catalogue_courses:
        ids_by_dept.setdefault(c["dept"], []).append(c["id"])
    # Anteater writes course ids without spaces ("I&CSCI31"); map them back to ours.
    known = [c["id"] for c in catalogue_courses] + list(load(OUT / "offerings.json")["courses"])
    compact = {cid.replace(" ", ""): cid for cid in known}
    course_id = lambda c: compact.get(c, c)  # noqa: E731  unknown (retired) courses keep Anteater's id

    catalogue = {(_name_key(p["name"].rpartition(", ")[0]), p["degree"]): p
                 for p in load(DATA_DIR / "catalogue" / "programs.json")}
    used_catalogue: set[str] = set()
    index = []

    def write(entry: dict, requirements: list[dict], cat: dict | None, school: dict | None = None,
              catalog_year: str | None = None, source: str = "anteater") -> None:
        if cat:
            used_catalogue.add(cat["id"])
            entry["legacyId"] = cat["id"]  # old saved plans used catalogue slugs
        index.append(entry)
        dump({
            **entry, "source": source, "catalogYear": catalog_year,
            "url": cat["url"] if cat else None,
            "requirements": requirements,
            "schoolRequirements": school,
            "sample_plan": cat["sample_plan"] if cat else [],
        }, OUT / "programs" / f"{entry['id']}.json", quiet=True)

    ant = load(DATA_DIR / "anteater" / "programs.json")
    for m in ant["majors"]:
        base = re.sub(r"\s*\(B\.\w+\.\)$", "", re.sub(r"^Major in ", "", m["name"]))
        degree = DEGREE_CODES.get(m["type"], m["type"].lower())
        school = m.get("schoolRequirements")
        write({"id": m["id"], "name": f"{base}, {m['type']}", "degree": degree,
               "specializationRequired": m["specializationRequired"], "specializations": m["specializations"]},
              [from_anteater(n, course_id) for n in m["requirements"]],
              catalogue.get((_name_key(base), degree)),
              {"name": school["name"], "requirements": [from_anteater(n, course_id) for n in school["requirements"]]} if school else None,
              m.get("catalogYear"))
    for m in ant["minors"]:
        base = re.sub(r"^Minor in ", "", m["name"])
        write({"id": m["id"], "name": f"{base}, Minor", "degree": "minor"},
              [from_anteater(n, course_id) for n in m["requirements"]], catalogue.get((_name_key(base), "minor")))
    for s in ant["specializations"]:
        write({"id": s["id"], "name": s["name"], "degree": "spec", "majorId": s["majorId"]},
              [from_anteater(n, course_id) for n in s["requirements"]], None, catalog_year=s.get("catalogYear"))

    # Catalogue-only programs: parse the prose into the same tree.
    depts = set(ids_by_dept)
    fallback = 0
    for p in load(DATA_DIR / "catalogue" / "programs.json"):
        if p["id"] in used_catalogue:
            continue
        groups = [g for lst in p["requirements"]["lists"] for g in parse_groups(lst["rows"], lst["heading"], depts)]
        write({"id": p["id"], "name": p["name"], "degree": p["degree"]},
              from_catalogue_groups(groups, p["id"], ids_by_dept), p, source="catalogue")
        fallback += 1

    dump({k: {"name": f"{k} requirements", "catalogYear": v.get("catalogYear"),
              "requirements": [from_anteater(n, course_id) for n in v["requirements"]]}
          for k, v in ant["ugrad"].items()}, OUT / "ugrad.json")
    print(f"  programs: {len(index) - fallback} from Anteater API, {fallback} from catalogue fallback")
    dump(index, OUT / "programs.json")


if __name__ == "__main__":
    build_courses()
    build_offerings()
    build_programs()
