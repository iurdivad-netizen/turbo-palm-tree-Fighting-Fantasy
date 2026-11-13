#!/usr/bin/env python3
"""Proves a v1 -> v2 migration changed no game logic.

Compares, section by section, the destinations, conditions, effects, rolls and combat of a v1 book and its v2 conversion.
The text is expected to differ; the only other allowed difference is the ending flags the converter drops on purpose
(sections flagged as endings that still lead somewhere).

Usage: python3 check_v2_equivalence.py [v1.json] [v2.json]
Exit code 1 if anything differs.
"""
import json
import re
import sys
from collections import Counter

V1 = sys.argv[1] if len(sys.argv) > 1 else "CURSE_OF_HOLLOWS_END.json"
V2 = sys.argv[2] if len(sys.argv) > 2 else "CURSE_OF_HOLLOWS_END.v2.json"
EK = ("modifyStats", "permanentStats", "maxStats", "addItems", "removeItems", "nextFightSkill")
GOLD = re.compile(r"\b(gold pieces?|coins?|gp)\b", re.I)
CAT = {}


def fx(d):
    """Effects in a comparable form: gold as a number, items as id -> quantity (a v1 item, a v2 id or {id, qty})."""
    out = {k: d[k] for k in EK if d.get(k) and k not in ("addItems", "gold")}
    gold, items = d.get("gold", 0) or 0, Counter()
    for it in d.get("addItems") or []:
        if isinstance(it, str):
            items[it] += 1
        elif "name" in it and GOLD.search(it["name"]):
            m = re.search(r"(\d+)", it["name"])
            gold += int(m.group(1)) if m else 1
        else:
            items[it["id"]] += it.get("qty", 1)
    if gold:
        out["gold"] = gold
    if items:
        out["addItems"] = dict(items)
    return out


def main():
    v1, v2 = json.load(open(V1, encoding="utf-8")), json.load(open(V2, encoding="utf-8"))
    S1 = {x["id"]: x for x in v1["sections"]}
    S2 = {x["id"]: x for x in v2["sections"]}
    bad = []
    CAT.update(v2.get("items") or {})
    # the definitions: every v1 inline item must equal the v2 catalogue entry (so both play the same)
    def inline_defs(o, found):
        if isinstance(o, dict):
            for it in o.get("addItems") or []:
                if isinstance(it, dict) and "name" in it and not GOLD.search(it["name"]):
                    found.setdefault(it["id"], set()).add(json.dumps({k: v for k, v in it.items() if k != "id"}, sort_keys=True))
            for v in o.values():
                inline_defs(v, found)
        elif isinstance(o, list):
            for v in o:
                inline_defs(v, found)
    found = {}
    inline_defs(v1, found)
    for iid, defs in sorted(found.items()):
        if len(defs) != 1 or json.loads(next(iter(defs))) != CAT.get(iid):
            bad.append(("item " + iid, "v1 definition differs from the catalogue"))
    if set(S1) != set(S2):
        bad.append(("(book)", "different section ids"))
    for k in ("initialStats", "startingSection"):
        if v1.get(k) != v2.get(k):
            bad.append(("(book)", k))
    for i in sorted(set(S1) & set(S2)):
        a, b = S1[i], S2[i]
        o1 = [(c["targetSection"], c.get("conditions"), fx(c.get("effects") or {}), c.get("once")) for c in a.get("choices") or []]
        o2 = [(o["target"], o.get("conditions"), fx(o.get("effects") or {}), o.get("once")) for o in b.get("options") or []]
        if o1 != o2:
            bad.append((i, "options"))
        if fx(a) != fx(b.get("effects") or {}):
            bad.append((i, "effects"))
        c1 = a.get("combat")
        c2 = json.loads(json.dumps(b["combat"])) if b.get("combat") else None
        for e in (c2 if isinstance(c2, list) else [c2] if c2 else []):
            e.pop("victoryText", None)
        if c1 != c2:
            bad.append((i, "combat"))
        t, d, r = a.get("testLuck"), a.get("diceRoll"), b.get("roll")
        if t:
            ok = (r and r["kind"] == "luck" and r.get("once") == t.get("once") and r.get("gatesOptions") == t.get("gatesChoices")
                  and r.get("conditions") == t.get("conditions")
                  and r["success"].get("target") == t.get("successSection") and r["failure"].get("target") == t.get("failureSection")
                  and fx(r["success"].get("effects") or {}) == fx(t.get("successEffects") or {})
                  and fx(r["failure"].get("effects") or {}) == fx(t.get("failureEffects") or {}))
            if not ok:
                bad.append((i, "luck test"))
        if d:
            ok = r and r["kind"] == "dice" and r.get("once") == d.get("once") and r.get("gatesOptions") == d.get("gatesChoices") and len(r["outcomes"]) == len(d["outcomes"])
            if ok:
                for x, y in zip(d["outcomes"], r["outcomes"]):
                    if (x["min"], x["max"], x.get("targetSection"), fx(x)) != (y["min"], y["max"], y.get("target"), fx(y.get("effects") or {})):
                        ok = False
                    lt, yl = x.get("luckTest"), y.get("luck")
                    if bool(lt) != bool(yl):
                        ok = False
                    elif lt:
                        for side in ("success", "failure"):
                            if (lt[side].get("targetSection"), fx(lt[side])) != (yl[side].get("target"), fx(yl[side].get("effects") or {})):
                                ok = False
            if not ok:
                bad.append((i, "dice roll"))
        if not t and not d and r:
            bad.append((i, "roll that v1 did not have"))
        if bool(a.get("isEnding")) != bool(b.get("ending")):
            led_somewhere = bool(a.get("choices") or t or d or a.get("combat"))
            if not (a.get("isEnding") and led_somewhere):
                bad.append((i, "ending"))
    dropped = sorted(i for i in S1 if S1[i].get("isEnding") and not S2[i].get("ending"))
    print(f"{len(S1)} sections compared; {len(bad)} difference(s)" + (": " + str(bad[:20]) if bad else ""))
    print(f"ending flags dropped on purpose (they still lead somewhere): {dropped}")
    sys.exit(1 if bad else 0)


main()
