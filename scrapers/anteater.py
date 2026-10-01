"""Download degree requirements from Anteater API (https://anteaterapi.com, by ICSSC).

Anteater API scrapes UCI's DegreeWorks, so requirements come as a structured tree instead
of catalogue prose. We save a snapshot locally; the website never calls the API directly.

Output: data/anteater/programs.json
{
  "fetched_at": "...",
  "majors":          [{id, name, type, catalogYear, specializationRequired, specializations, requirements, schoolRequirements}],
  "minors":          [{id, name, requirements}],
  "specializations": [{id, majorId, name, requirements}],
  "ugrad":           {"GE": {...}, "UC": {...}}
}

Requirement nodes (see anteater-api apps/api/src/schema/programs.ts):
  {"requirementType": "Course", "label", "requirementId", "courseCount": n, "courses": ["I&CSCI31", ...]}
  {"requirementType": "Unit",   ..., "unitCount": n, "courses": [...]}
  {"requirementType": "Group",  ..., "requirementCount": n, "requirements": [node, ...]}
  {"requirementType": "Marker", ...}   # e.g. "Entry Level Writing", checked off by hand
Data is AGPL-3.0 project output; attribution to Anteater API / ICSSC is required.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.parse import urlencode

from .common import DATA_DIR, Fetcher, write_json

BASE = "https://anteaterapi.com/v2/rest/programs"


def get(fetcher: Fetcher, path: str, **params) -> object:
    url = f"{BASE}/{path}" + (f"?{urlencode(params)}" if params else "")
    body = json.loads(fetcher.fetch(url))
    if not body.get("ok"):
        raise RuntimeError(f"{url}: {body}")
    return body["data"]


def scrape(fetcher: Fetcher) -> dict:
    majors = [m for m in get(fetcher, "majors") if m["division"] == "Undergraduate"]
    minors = get(fetcher, "minors")
    major_ids = {m["id"] for m in majors}
    specializations = [s for s in get(fetcher, "specializations") if s["majorId"] in major_ids]
    year_of = {m["id"]: m["catalogYear"] for m in majors}
    print(f"[anteater] {len(majors)} majors, {len(minors)} minors, {len(specializations)} specializations")

    failed = []

    def details(kind: str, item: dict, **params) -> dict | None:
        try:
            data = get(fetcher, kind, programId=item["id"], **params)
        except Exception as e:  # keep going; record what's missing
            print(f"  ! {kind} {item['id']}: {e}")
            failed.append(f"{kind}:{item['id']}")
            return None
        return {**item, **{k: data.get(k) for k in ("requirements", "schoolRequirements", "catalogYear") if k in data}}

    out_majors = [d for m in majors if (d := details("major", m, catalogYear=m["catalogYear"]))]
    print(f"  majors done ({len(out_majors)})")
    out_minors = [d for m in minors if (d := details("minor", m))]
    print(f"  minors done ({len(out_minors)})")
    out_specs = [d for s in specializations if (d := details("specialization", s, catalogYear=year_of[s["majorId"]]))]
    print(f"  specializations done ({len(out_specs)})")
    # GE / UC requirements apply to every undergraduate degree. Without catalogYear the API
    # returns an older year, so ask for the one most majors are on.
    current_year = max(year_of.values(), key=list(year_of.values()).count)
    ugrad = {block: get(fetcher, "ugradRequirements", id=block, catalogYear=current_year) for block in ("GE", "UC")}

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Anteater API (https://anteaterapi.com) by ICSSC",
        "failed": failed,
        "majors": out_majors,
        "minors": out_minors,
        "specializations": out_specs,
        "ugrad": ugrad,
    }


def main(fetcher: Fetcher) -> None:
    write_json(scrape(fetcher), DATA_DIR / "anteater" / "programs.json")
