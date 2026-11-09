#!/usr/bin/env python3
"""Validate an adventure JSON file: unique section ids, valid links, required fields.

Usage: python3 validate_adventure.py book.json [...]
Exit code is 1 if any file has errors.
"""
import json
import sys
from collections import Counter


def targets(section):
    for c in section.get("choices") or []:
        yield c.get("targetSection")
    tl = section.get("testLuck") or {}
    for k in ("successSection", "failureSection"):
        if tl.get(k) is not None:
            yield tl[k]
    combat = section.get("combat") or []
    for c in combat if isinstance(combat, list) else [combat]:
        for k in ("onVictorySection", "onDefeatSection", "fleeSection"):
            if c.get(k) is not None:
                yield c[k]


def validate(path):
    errors = []
    book = json.load(open(path, encoding="utf-8"))
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
    return errors


if __name__ == "__main__":
    bad = False
    for p in sys.argv[1:]:
        errs = validate(p)
        print(f"{p}: {'OK' if not errs else str(len(errs)) + ' problem(s)'}")
        for e in errs:
            print("  -", e)
        bad = bad or bool(errs)
    sys.exit(1 if bad else 0)
