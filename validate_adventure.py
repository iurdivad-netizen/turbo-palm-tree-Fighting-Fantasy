#!/usr/bin/env python3
"""Validate an adventure JSON file: unique section ids, valid links, required fields.

Format v1 (the original) gets the structural checks below. Format v2 (schemaVersion: 2, see book.schema.json
and UI-AND-SCHEMA-DESIGN.md) also gets the JSON Schema (if the `jsonschema` package is installed) and the
cross-reference checks: option references in the text, real button labels, no "Turn to N" left in the text,
dice tables that cover every result, items that conditions need.

Usage: python3 validate_adventure.py book.json [...]
Exit code is 1 if any file has errors.
"""
import json
import os
import re
import sys
from collections import Counter


def targets(section):
    for c in section.get("choices") or []:
        yield c.get("targetSection")
    tl = section.get("testLuck") or {}
    for k in ("successSection", "failureSection"):
        if tl.get(k) is not None:
            yield tl[k]
    for o in (section.get("diceRoll") or {}).get("outcomes", []):
        if o.get("targetSection") is not None:
            yield o["targetSection"]
    combat = section.get("combat") or []
    for c in combat if isinstance(combat, list) else [combat]:
        for k in ("onVictorySection", "onDefeatSection", "fleeSection"):
            if c.get(k) is not None:
                yield c[k]


TURN_TO = re.compile(r"\bturn to \d+", re.I)
GENERIC_LABEL = re.compile(r"^\s*(turn to|go to( section)?|go on to section)\s+\d+\s*[.:]?\s*$", re.I)
OPT_REF = re.compile(r"\{\{opt:([a-z0-9-]+)\}\}")
SCHEMA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "book.schema.json")


def all_effects(section):
    """Every effects object in a v2 section (section, options, roll outcomes, combat)."""
    out = [section.get("effects")]
    for o in section.get("options") or []:
        out.append(o.get("effects"))
    r = section.get("roll") or {}
    for side in ("success", "failure"):
        out.append((r.get(side) or {}).get("effects"))
    for oc in r.get("outcomes", []):
        out.append(oc.get("effects"))
        for side in ("success", "failure"):
            out.append(((oc.get("luck") or {}).get(side) or {}).get("effects"))
    cc = section.get("combat") or []
    for c in cc if isinstance(cc, list) else [cc]:
        out.append(c.get("onVictoryEffects"))
    return [e for e in out if e]


def targets_v2(section):
    for o in section.get("options") or []:
        yield o["target"]
    r = section.get("roll") or {}
    for side in ("success", "failure"):
        if (r.get(side) or {}).get("target") is not None:
            yield r[side]["target"]
    for oc in r.get("outcomes", []):
        if oc.get("target") is not None:
            yield oc["target"]
        for side in ("success", "failure"):
            t = ((oc.get("luck") or {}).get(side) or {}).get("target")
            if t is not None:
                yield t
    cc = section.get("combat") or []
    for c in cc if isinstance(cc, list) else [cc]:
        for k in ("onVictorySection", "onDefeatSection", "fleeSection"):
            if c.get(k) is not None:
                yield c[k]


def validate_v2(book, warnings):
    errors = []
    try:
        import jsonschema
        schema = json.load(open(SCHEMA_FILE, encoding="utf-8"))
        validator = jsonschema.Draft202012Validator(schema)
        found = sorted(validator.iter_errors(book), key=lambda e: list(e.absolute_path))
        for e in found[:25]:
            path = "/".join(str(p) for p in e.absolute_path) or "(book)"
            errors.append(f"schema: {path}: {e.message[:140]}")
        if len(found) > 25:
            errors.append(f"schema: ... and {len(found) - 25} more")
        if found:
            return errors   # semantic checks assume a structurally valid book
    except ImportError:
        warnings.append("jsonschema is not installed: structure not checked against book.schema.json (pip install jsonschema)")

    sections = book["sections"]
    counts = Counter(s["id"] for s in sections)
    for sid, n in counts.items():
        if n > 1:
            errors.append(f"duplicate section id {sid} ({n} times)")
    ids = set(counts)
    if book["startingSection"] not in ids:
        errors.append(f"startingSection {book['startingSection']} does not exist")
    catalogue = book.get("items") or {}
    inline = {}                                   # id -> the different inline definitions found
    def ref_id(r):
        return r if isinstance(r, str) else r["id"]
    def note_ref(r, where):
        if isinstance(r, dict) and "name" in r:
            inline.setdefault(r["id"], []).append(json.dumps({k: v for k, v in r.items() if k != "qty"}, sort_keys=True))
        elif ref_id(r) not in catalogue:
            errors.append(f"{where}: item '{ref_id(r)}' is not defined in the book's items")
    obtainable = set()
    for r in book.get("startingItems") or []:
        note_ref(r, "startingItems")
        obtainable.add(ref_id(r))
    granted = set(obtainable)
    for s in sections:
        for e in all_effects(s):
            for r in e.get("addItems") or []:
                note_ref(r, f"section {s['id']}")
                obtainable.add(ref_id(r))
                granted.add(ref_id(r))
            for rid in e.get("removeItems") or []:
                if rid not in catalogue and rid not in inline:
                    warnings.append(f"section {s['id']} removes item '{rid}' which is not defined")
    for rid, defs in inline.items():
        if len(set(defs)) > 1:
            errors.append(f"item '{rid}' is defined {len(set(defs))} different ways inline; define it once in the book's items")
    needed = set()
    for s in sections:
        for c in [(o.get("conditions") or {}) for o in s.get("options") or []] + [((s.get("roll") or {}).get("conditions") or {})]:
            for key in ("requiresItem", "requiresNoItem", "requiresMissingAny"):
                needed |= set([c[key]] if isinstance(c.get(key), str) else c.get(key) or [])
    for iid, d in catalogue.items():
        if iid not in granted:
            warnings.append(f"item '{iid}' is defined but no section or starting kit gives it")
        if d["type"] in ("potion", "food") and not (d.get("restore") or d.get("onUse")):
            errors.append(f"item '{iid}' is a {d['type']} but has neither 'restore' nor 'onUse': it could never be used")
        if d["type"] == "weapon" and not d.get("bonus") and not d.get("properties"):
            warnings.append(f"weapon '{iid}' has no bonus or properties: it is a plain weapon")
    keepsakes = [i for i, d in catalogue.items() if d["type"] in ("other", "treasure", "key") and i not in needed and not d.get("onUse") and not d.get("saveBonus")]
    if keepsakes:
        warnings.append(f"{len(keepsakes)} item(s) have no effect and no option asks for them (shown as keepsakes): {', '.join(sorted(keepsakes))}")
    unreferenced = 0
    for s in sections:
        sid = s["id"]
        text = s["text"]
        opts = s.get("options") or []
        oids = [o["id"] for o in opts]
        for oid, n in Counter(oids).items():
            if n > 1:
                errors.append(f"section {sid}: duplicate option id '{oid}'")
        for lab, n in Counter(o["label"] for o in opts).items():
            if n > 1:
                errors.append(f"section {sid}: {n} options share the label '{lab}'")
        for o in opts:
            if GENERIC_LABEL.match(o["label"]):
                errors.append(f"section {sid}: option '{o['id']}' has a generic label '{o['label']}'")
        for m in OPT_REF.finditer(text):
            if m.group(1) not in oids:
                errors.append(f"section {sid}: text refers to unknown option '{m.group(1)}'")
        used = Counter(OPT_REF.findall(text))
        for oid, n in used.items():
            if n > 1:
                errors.append(f"section {sid}: option '{oid}' appears {n} times in the text")
        unreferenced += sum(1 for oid in oids if oid not in used)
        if TURN_TO.search(text):
            errors.append(f"section {sid}: text still contains 'Turn to N'")
        for bad in ("{choice", "{item", "{action", "\r"):
            if bad in text:
                errors.append(f"section {sid}: text contains a leftover marker ({bad.strip()})")
        if "{{roll}}" in text and not s.get("roll"):
            errors.append(f"section {sid}: text has {{{{roll}}}} but the section has no roll")
        if text.count("{{roll}}") > 1:
            errors.append(f"section {sid}: {{{{roll}}}} appears more than once")
        r = s.get("roll")
        if r and "{{roll}}" not in text:
            warnings.append(f"section {sid}: has a roll but the text has no {{{{roll}}}} (shown under the text)")
        if r and r["kind"] == "dice":
            hi = 6 if r["dice"] == "1d6" else 12
            lo = 1 if r["dice"] == "1d6" else 2
            covered = Counter()
            for oc in r["outcomes"]:
                if oc["min"] > oc["max"]:
                    errors.append(f"section {sid}: dice outcome {oc['min']}-{oc['max']} is empty")
                for v in range(oc["min"], oc["max"] + 1):
                    covered[v] += 1
            for v in range(lo, hi + 1):
                if covered[v] != 1:
                    errors.append(f"section {sid}: dice result {v} is covered {covered[v]} times")
        for t in targets_v2(s):
            if t not in ids:
                errors.append(f"section {sid} links to missing section {t}")
        for cond_owner in list(opts) + ([r] if r else []):
            cond = cond_owner.get("conditions") or {}
            for key in ("requiresItem", "requiresNoItem", "requiresMissingAny"):
                for item_id in ([cond[key]] if isinstance(cond.get(key), str) else cond.get(key) or []):
                    if item_id not in obtainable:
                        errors.append(f"section {sid} needs item '{item_id}' which no section gives")
        # a section must lead somewhere (or end), except the intro
        has_exit = bool(opts or r or s.get("combat"))
        if s.get("ending") and has_exit:
            errors.append(f"section {sid}: is marked as an ending but also has options, a roll or combat")
        if not s.get("ending") and not has_exit and not (sid == 0 and book["startingSection"] != 0):
            errors.append(f"section {sid}: dead end (no options, roll, combat or ending)")
    if unreferenced:
        warnings.append(f"{unreferenced} option(s) are not referenced in their text (they are listed under it)")
    return errors


def validate(path, warnings=None):
    warnings = warnings if warnings is not None else []
    errors = []
    book = json.load(open(path, encoding="utf-8"))
    if book.get("schemaVersion") == 2:
        return validate_v2(book, warnings)
    for key in ("id", "title", "initialStats", "sections"):
        if key not in book:
            errors.append(f"missing top-level field '{key}'")
    sections = book.get("sections", [])
    counts = Counter(s.get("id") for s in sections)
    for sid, n in sorted(counts.items(), key=lambda kv: str(kv[0])):
        if n > 1:
            errors.append(f"duplicate section id {sid} ({n} times)")
    ids = set(counts)
    start = book.get("startingSection")
    if start is not None and start not in ids:
        errors.append(f"startingSection {start} does not exist")
    for s in sections:
        for t in targets(s):
            if t not in ids:
                errors.append(f"section {s.get('id')} links to missing section {t}")
    # Every item a choice requires must be obtainable somewhere (or be a starting item)
    obtainable = {i.get("id") for s in sections for i in s.get("addItems") or []}
    obtainable |= {i.get("id") for i in book.get("startingItems") or []}
    for s in sections:
        gated = list(s.get("choices") or [])
        if s.get("testLuck"):
            gated.append(s["testLuck"])
        for c in gated:
            cond = c.get("conditions") or {}
            for key in ("requiresItem", "requiresNoItem", "requiresMissingAny"):
                for item_id in ([cond[key]] if isinstance(cond.get(key), str) else cond.get(key) or []):
                    if item_id not in obtainable:
                        errors.append(f"section {s.get('id')} needs item '{item_id}' which no section gives")
    return errors


if __name__ == "__main__":
    bad = False
    for p in sys.argv[1:]:
        warns = []
        errs = validate(p, warns)
        print(f"{p}: {'OK' if not errs else str(len(errs)) + ' problem(s)'}")
        for e in errs:
            print("  -", e)
        for w in warns:
            print("  (note)", w)
        bad = bad or bool(errs)
    sys.exit(1 if bad else 0)
