"""Normalise program requirements into one tree format for the web app.

Node shapes (web/src/types.ts ReqNode):
  {"id", "label", "type": "course", "count": n, "courses": [...], "reusable": bool}  take n of these courses
  {"id", "label", "type": "units",  "count": n, "courses": [...], "reusable": bool}  earn n units from these
  {"id", "label", "type": "group",  "count": n, "children": [...]}                    satisfy n children
  {"id", "label", "type": "marker"}                                                   checked off by hand

Anteater API (DegreeWorks) trees map almost 1:1. Programs only in the catalogue are
converted from the groups scrapers/requirements.py parses out of the catalogue prose.
"""
from __future__ import annotations

import re
from typing import Callable

COURSE_NUMBER_RE = re.compile(r"^([A-Z]{0,2})(\d+)[A-Z]*$")


# ---------------------------------------------------------------- Anteater API

def from_anteater(node: dict, course_id: Callable[[str], str]) -> dict:
    kind = node["requirementType"]
    out = {"id": node["requirementId"], "label": node["label"]}
    if kind == "Group":
        out.update(type="group", count=node["requirementCount"],
                   children=[from_anteater(n, course_id) for n in node["requirements"]])
    elif kind in ("Course", "Unit"):
        out.update(type="course" if kind == "Course" else "units",
                   count=node["courseCount"] if kind == "Course" else node["unitCount"],
                   courses=list(dict.fromkeys(course_id(c) for c in node["courses"])),
                   # NonExclusive: courses used here may also count toward other requirements.
                   reusable=any(q.get("qualifierType") == "NonExclusive" for q in node.get("qualifiers") or []))
    else:
        out["type"] = "marker"
    return out


# ------------------------------------------------------- catalogue fallback

class _Ids:
    def __init__(self, prefix: str):
        self.prefix, self.n = prefix, 0

    def __call__(self) -> str:
        self.n += 1
        return f"{self.prefix}-{self.n}"


def expand_range(r: dict, ids_by_dept: dict[str, list[str]]) -> list[str]:
    out = []
    for cid in ids_by_dept.get(r["dept"], []):
        m = COURSE_NUMBER_RE.match(cid[len(r["dept"]) + 1:])
        if m and m[1] == r["prefix"] and r["from"] <= int(m[2]) <= r["to"]:
            out.append(cid)
    return out


def _slot_node(slot: list[list[str]], label: str, new_id: _Ids) -> dict:
    alts = [{"id": new_id(), "label": " - ".join(a), "type": "course", "count": len(a), "courses": a, "reusable": False}
            for a in slot]
    if len(alts) == 1:
        return {**alts[0], "label": label or alts[0]["label"]}
    return {"id": new_id(), "label": label or " or ".join(a["label"] for a in alts), "type": "group", "count": 1, "children": alts}


def from_catalogue_groups(groups: list[dict], program_id: str, ids_by_dept: dict[str, list[str]]) -> list[dict]:
    new_id = _Ids(program_id)
    nodes = []
    for g in groups:
        label = g["label"]
        if g["notes"]:
            label += " — " + " ".join(g["notes"])
        if g["status"] == "manual":
            nodes.append({"id": new_id(), "label": label, "type": "marker"})
            continue

        areas = []
        for a in g["areas"]:
            listed = {c for slot in a["slots"] for alt in slot for c in alt}
            extra = [c for r in a["ranges"] for c in expand_range(r, ids_by_dept) if c not in listed]
            areas.append((a["label"], a["slots"] + [[[c]] for c in dict.fromkeys(extra)]))
        all_slots = [s for _, slots in areas for s in slots]
        simple = all(len(s) == 1 and len(s[0]) == 1 for s in all_slots)  # every option is one course

        def pool(slots, count, lbl, units=False):
            if simple or units:
                return {"id": new_id(), "label": lbl, "type": "units" if units else "course", "count": count,
                        "courses": list(dict.fromkeys(c for s in slots for alt in s for c in alt)), "reusable": False}
            return {"id": new_id(), "label": lbl, "type": "group", "count": count,
                    "children": [_slot_node(s, "", new_id) for s in slots]}

        if g["kind"] == "all":
            children = [_slot_node(s, "", new_id) for s in all_slots]
            nodes.append(children[0] | {"label": label} if len(children) == 1
                         else {"id": new_id(), "label": label, "type": "group", "count": len(children), "children": children})
        elif g["single_area"]:
            # "12 units in one of the following areas": one child per area, pick one area.
            nodes.append({"id": new_id(), "label": label, "type": "group", "count": 1,
                          "children": [pool(slots, g["units"] or g["count"] or 1, a_label, units=bool(g["units"]))
                                       for a_label, slots in areas]})
        elif g["min_areas"] and len(areas) > 1:
            # "N courses, at least one from K areas": K area children, plus the rest from anywhere.
            per_area = {"id": new_id(), "label": f"One course from {g['min_areas']} different areas", "type": "group",
                        "count": g["min_areas"], "children": [pool(slots, 1, a_label) for a_label, slots in areas]}
            rest = (g["count"] or g["min_areas"]) - g["min_areas"]
            children = [per_area] + ([pool(all_slots, rest, f"{rest} more from any area")] if rest > 0 else [])
            nodes.append(children[0] | {"label": label} if len(children) == 1
                         else {"id": new_id(), "label": label, "type": "group", "count": len(children), "children": children})
        else:
            units = bool(g["units"]) and not g["count"]
            nodes.append(pool(all_slots, g["units"] if units else g["count"], label, units=units))
    return nodes
