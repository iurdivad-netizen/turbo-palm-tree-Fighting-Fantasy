#!/usr/bin/env python3
"""Converts an adventure from book format v1 to v2 (see UI-AND-SCHEMA-DESIGN.md and book.schema.json).

  * every option gets a real label, recovered from the "Turn to N to <label>" lines of its own section,
    and the option lines are replaced in the text by an inline reference  {{opt:ID}}
  * Luck tests and dice tables move under one `roll` object; the roll's outcome prose is removed from the
    text and replaced by {{roll}}
  * stat/item effects are grouped under `effects`; endings are explicit (`ending`)
  * no "Turn to N" is left anywhere in the text

Hand-written decisions (labels the prose cannot give, text fixes, notes about problems in the book) live in a sidecar
file next to the book, <book>.overrides.json, so the converter itself stays generic. See AUTHORING.md.

Usage: python3 migrate_to_v2.py book.json [out.json] [review.md] [--overrides file.json]
  out.json   defaults to <book>.v2.json
  review.md  defaults to <book>.migration-review.md
  overrides  defaults to <book>.overrides.json when that file exists
"""
import argparse
import json
import os
import re
import sys
from collections import Counter

_ap = argparse.ArgumentParser(description="Convert a gamebook from format v1 to v2.")
_ap.add_argument("book")
_ap.add_argument("out", nargs="?")
_ap.add_argument("review", nargs="?")
_ap.add_argument("--overrides")
_args = _ap.parse_args()
SRC = _args.book
_stem = os.path.splitext(SRC)[0]
OUT = _args.out or _stem + ".v2.json"
REVIEW = _args.review or _stem + ".migration-review.md"
OVERRIDES_FILE = _args.overrides or (_stem + ".overrides.json" if os.path.exists(_stem + ".overrides.json") else None)


def load_overrides(path):
    """{'labels': {section: {option id: label}}, 'text': {section: [{replace, with}]}, 'notes': {section: text}, 'items': {id: definition}}"""
    if not path:
        return {}, {}, {}, {}
    data = json.load(open(path, encoding="utf-8"))
    unknown = set(data) - {"_comment", "labels", "text", "notes", "items"}
    if unknown:
        raise SystemExit(f"{path}: unknown key(s) {sorted(unknown)}; allowed: labels, text, notes, items")
    labels = {(int(sid), oid): lab for sid, d in data.get("labels", {}).items() for oid, lab in d.items()}
    text = {int(sid): [(r["replace"], r["with"]) for r in lst] for sid, lst in data.get("text", {}).items()}
    notes = {int(sid): note for sid, note in data.get("notes", {}).items()}
    return labels, text, notes, data.get("items", {})


LABEL_OVERRIDES, TEXT_OVERRIDES, NOTES, ITEM_DEFS = load_overrides(OVERRIDES_FILE)

GENERIC = re.compile(r"^\s*(turn to|go to( section)?)\s+\d+\s*[.:]?\s*$", re.I)
TURN = re.compile(r"\bTurn to (\d+)\b", re.I)
# Sections where the generic conversion cannot know which button belongs to which line (several options share one
# destination). The replacement is applied to the converted text. Keep this table short and reviewed.
EFFECT_KEYS = ("modifyStats", "permanentStats", "maxStats", "addItems", "removeItems", "nextFightSkill", "fightSave", "invisible", "gold")

review = {"item_conflicts": [], "uncatalogued": [], "auto_label": [], "residual_roll": [], "victory_narrative": [], "stripped_fragment": [], "unreferenced": [], "dropped_endings": []}


def effects_of(d):
    return {k: d[k] for k in EFFECT_KEYS if d.get(k)}


def sentence_case(s):
    s = re.sub(r"\s+", " ", s).strip(" .:;,—-")
    return s[:1].upper() + s[1:] if s else s


def label_from_tail(tail):
    """'to enter the tavern' -> 'Enter the tavern'; 'for the ballroom (ghosts)' -> 'Go to the ballroom (ghosts)'."""
    t = re.sub(r"\s+", " ", tail).strip(" .:;")
    if not t:
        return None
    m = re.match(r"^\((.*)\)$", t)
    if m:
        return sentence_case(m.group(1))
    m = re.match(r"^to (.+)$", t, re.I)
    if m:
        return sentence_case(m.group(1))
    m = re.match(r"^for (.+)$", t, re.I)
    if m:
        return "Go to " + m.group(1).strip(" .:;")
    m = re.match(r"^(when|if) (.+)$", t, re.I)
    if m:
        return "Continue (" + t + ")"
    return sentence_case(t)


def split_paragraphs(text):
    text = text.replace("\r\n", "\n")
    return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]


ROLL_TRIGGER = re.compile(r"^(Roll (one|a) die|Test your Luck)", re.I)
ROLL_OUTCOME = re.compile(r"^(On \d(-\d)?\s*:|If (you are |you're )?(Lucky|Unlucky)|(Lucky|Unlucky)\s*:|If (you )?(roll|you rolled))", re.I)
INLINE_ROLL = re.compile(r"(Test your Luck\.?|Roll (one|a) die[^.:]*[.:])", re.I)


def convert_section(x, book_info):
    sid = x["id"]
    choices = [dict(c) for c in x.get("choices") or []]
    roll_src = x.get("testLuck") or x.get("diceRoll")
    paras = split_paragraphs(x["text"])

    # ---- options: give every v1 choice an id; remember which are still unplaced
    opts = []
    seen = Counter()
    for c in choices:
        seen[c["targetSection"]] += 1
        oid = f"to-{c['targetSection']}" + ("" if seen[c["targetSection"]] == 1 else f"-{seen[c['targetSection']]}")
        o = {"id": oid, "label": c["text"], "target": c["targetSection"], "_generic": bool(GENERIC.match(c["text"]))}
        for k in ("conditions", "effects", "once", "vanishes"):
            if c.get(k):
                o[k] = c[k]
        opts.append(o)
    for o in opts:
        if (sid, o["id"]) in LABEL_OVERRIDES:
            o["label"] = LABEL_OVERRIDES[(sid, o["id"])]
            o["_generic"] = False
    unplaced = list(opts)

    def take(target):
        for o in unplaced:
            if o["target"] == target:
                unplaced.remove(o)
                return o
        return None

    # ---- 0. combat sections: "If you win: ..." becomes data (victoryText); flee outcomes are handled by the engine
    victory_text = None
    if x.get("combat"):
        keep = []
        for p in paras:
            m = re.match(r"^If you (win|defeat|are victorious|survive|reduce)[^:]*:\s*(.*)$", p, re.S | re.I)
            if m:
                for t in TURN.findall(m.group(2)):
                    o = take(int(t))
                    if o is not None and o["_generic"]:
                        o["label"] = "Continue"
                body = TURN.sub("", m.group(2))
                body = re.sub(r"\(?\b[A-Z ]*VICTORY!?\)?", "", body).strip(" .(\n)")
                if len(body) > 12:
                    victory_text = body if victory_text is None else victory_text + " " + body
                    review["victory_narrative"].append((sid, body[:80]))
                continue
            if re.match(r"^(Lucky|Unlucky)\s*:", p, re.I):
                for t in TURN.findall(p):
                    o = take(int(t))
                    if o is not None and o["_generic"]:
                        o["label"] = "Continue"
                continue
            keep.append(p)
        paras = keep

    # ---- 1. roll block: from the first trigger paragraph through the contiguous outcome paragraphs
    out = []
    roll_placed = False
    i = 0
    while i < len(paras):
        p = paras[i]
        if roll_src and not roll_placed and ROLL_TRIGGER.match(p):
            j = i + 1
            while j < len(paras) and (ROLL_OUTCOME.match(paras[j]) or (TURN.search(paras[j]) and re.match(r"^(If|On|Lucky|Unlucky)", paras[j]))):
                j += 1
            out.append("{{roll}}")
            roll_placed = True
            i = j
            continue
        out.append(p)
        i += 1

    # ---- 2. option lines and inline "Turn to N"
    final = []
    for p in out:
        if p == "{{roll}}":
            final.append(p)
            continue
        m = re.match(r"^Turn to (\d+)\b(.*)$", p, re.S | re.I)
        if m and not re.search(r"\bTurn to \d+", m.group(2)):
            o = take(int(m.group(1)))
            if o is not None:
                if o["_generic"]:
                    lab = label_from_tail(m.group(2))
                    o["label"] = lab or "Continue"
                    if lab is None:
                        review["auto_label"].append((sid, o["id"], "Continue", "bare line"))
                final.append("{{opt:%s}}" % o["id"])
                continue
        # sentence containing Turn to N (one or more): replace each by the option when it exists
        def repl(mm):
            o = take(int(mm.group(1)))
            if o is None:
                return mm.group(0)
            if o["_generic"]:
                o["label"] = "Continue"
                review["auto_label"].append((sid, o["id"], "Continue", "end of sentence"))
            return "{{opt:%s}}" % o["id"]
        q = TURN.sub(repl, p)
        final.append(q)

    # a stat block ("THE WIDOW SKILL 11 STAMINA 15" + "Special: ...") in a section without combat belongs to the fight elsewhere
    if not x.get("combat"):
        kept = []
        skip_special = False
        for p in final:
            if re.match(r"^[A-Z][A-Z' ()0-9-]+ SKILL \d+\s+STAMINA \d+", p):
                review["stripped_fragment"].append((sid, "stat block of a fight held elsewhere: " + p[:40]))
                skip_special = True
                continue
            if skip_special and re.match(r"^(Special|Special Ability)\b", p):
                skip_special = False
                continue
            skip_special = False
            kept.append(p)
        final = kept

    # ---- 3. strip what is left of the roll outcomes and any "Turn to N" that no option claims
    cleaned = []
    for p in final:
        if p == "{{roll}}" or (p.startswith("{{opt:") and p.endswith("}}") and p.count("{{") == 1):
            cleaned.append(p)
            continue
        if roll_src:
            if ROLL_OUTCOME.match(p):          # outcome prose of the roll, wherever it sits
                continue
            if INLINE_ROLL.search(p):          # "...You'll have to risk it. Test your Luck."
                p = INLINE_ROLL.sub("{{roll}}", p, count=1).strip()
                roll_placed = True
                review["residual_roll"].append((sid, "roll trigger inside a paragraph"))
                if p == "{{roll}}":
                    cleaned.append(p)
                    continue
        q = re.sub(r"\s*\(?\bTurn to \d+\b\)?(\s*\([^)]*\))?[.:]?", "", p)
        if q != p:
            review["stripped_fragment"].append((sid, TURN.search(p).group(0) + " ..."))
        q = re.sub(r"\s+([.,;:])", r"\1", q).strip()
        q = re.sub(r"(\{\{opt:[^}]+\}\})\.", r"\1", q)       # no full stop glued to a button
        if q != p and re.fullmatch(r"[^.!?]{0,80}:", q):          # a header whose only content was the removed "Turn to"
            continue
        if q:
            cleaned.append(q)
    # keep a single {{roll}}
    seen_roll = False
    tmp = []
    for p in cleaned:
        if "{{roll}}" in p:
            if seen_roll:
                p = p.replace("{{roll}}", "").strip()
            seen_roll = True
        if p:
            tmp.append(p)
    cleaned = tmp
    if roll_src and not seen_roll:
        cleaned.append("{{roll}}")
        review["residual_roll"].append((sid, "roll appended at the end"))
    # consecutive option lines form one compact list
    merged = []
    for p in cleaned:
        if merged and re.fullmatch(r"(\{\{opt:[^}]+\}\})(\n\{\{opt:[^}]+\}\})*", merged[-1]) and re.fullmatch(r"\{\{opt:[^}]+\}\}", p):
            merged[-1] += "\n" + p
        else:
            merged.append(p)
    cleaned = merged

    # combat sections: the stat block ("ZOMBIE SKILL 5 STAMINA 6", enemy name headers) repeats what the combat panel shows
    if x.get("combat"):
        names = {e["enemyName"] for e in (x["combat"] if isinstance(x["combat"], list) else [x["combat"]])}
        stat = re.compile(r"^(?:[A-Z][A-Z0-9' ()-]*?\s+)?SKILL\s*:?\s*\d+\s*[|,]?\s*STAMINA\s*:?\s*\d+\s*$")
        kept, removed = [], 0
        for p in cleaned:
            lines = [ln for ln in p.split("\n") if not (stat.match(ln.strip()) or ln.strip() in names)]
            removed += len(p.split("\n")) - len(lines)
            if lines and "".join(lines).strip():
                kept.append("\n".join(lines))
        if removed:
            review["stripped_fragment"].append((sid, f"{removed} stat-block line(s) of the fight (the combat panel shows them)"))
        cleaned = kept

    # leftovers that never appeared in the text still need a real label
    for o in unplaced:
        review["unreferenced"].append((sid, o["id"], o["label"]))
        if o["_generic"]:
            o["label"] = "Continue" if len(opts) == 1 else f"Go on to section {o['target']}"
            review["auto_label"].append((sid, o["id"], o["label"], "not found in text"))

    text = "\n\n".join(cleaned)
    for old, new in TEXT_OVERRIDES.get(sid, []):
        if old not in text:
            raise SystemExit(f"override for section {sid} no longer matches the converted text")
        text = text.replace(old, new)
    section = {"id": sid}
    if x.get("title"):
        section["title"] = x["title"]
    for k in ("area", "tags"):
        if x.get(k):
            section[k] = x[k]
    section["text"] = text
    if opts:
        section["options"] = [{k: v for k, v in o.items() if k != "_generic"} for o in opts]

    # ---- roll
    if x.get("testLuck"):
        t = x["testLuck"]
        r = {"kind": "luck"}
        if t.get("label"):
            r["label"] = t["label"]
        for src_k, dst_k in (("once", "once"), ("gatesChoices", "gatesOptions"), ("conditions", "conditions"), ("stealth", "stealth"), ("tags", "tags")):
            if t.get(src_k):
                r[dst_k] = t[src_k]
        for side, sec_k, txt_k, eff_k in (("success", "successSection", "successText", "successEffects"), ("failure", "failureSection", "failureText", "failureEffects")):
            o = {}
            if t.get(txt_k):
                o["text"] = t[txt_k]
            if t.get(sec_k):
                o["target"] = t[sec_k]
            if t.get(eff_k):
                o["effects"] = t[eff_k]
            r[side] = o
        section["roll"] = r
    if x.get("diceRoll"):
        d = x["diceRoll"]
        r = {"kind": "dice", "dice": "1d6"}
        if d.get("label"):
            r["label"] = d["label"]
        for src_k, dst_k in (("once", "once"), ("gatesChoices", "gatesOptions")):
            if d.get(src_k):
                r[dst_k] = d[src_k]
        outs = []
        for oc in d["outcomes"]:
            o = {"min": oc["min"], "max": oc["max"]}
            if oc.get("text"):
                o["text"] = oc["text"]
            if oc.get("targetSection"):
                o["target"] = oc["targetSection"]
            if effects_of(oc):
                o["effects"] = effects_of(oc)
            if oc.get("luckTest"):
                lt = {}
                for side in ("success", "failure"):
                    s_ = oc["luckTest"].get(side) or {}
                    so = {}
                    if s_.get("text"):
                        so["text"] = s_["text"]
                    if s_.get("targetSection"):
                        so["target"] = s_["targetSection"]
                    if effects_of(s_):
                        so["effects"] = effects_of(s_)
                    lt[side] = so
                o["luck"] = lt
            outs.append(o)
        r["outcomes"] = outs
        section["roll"] = r

    if x.get("combat"):
        cb = json.loads(json.dumps(x["combat"]))
        if victory_text:
            (cb[-1] if isinstance(cb, list) else cb)["victoryText"] = victory_text
        section["combat"] = cb
    if effects_of(x):
        section["effects"] = effects_of(x)
    # endings: only where nothing else can happen (the v1 flag was also set on 9 mid-game sections)
    if x.get("isEnding") and not (opts or x.get("testLuck") or x.get("diceRoll") or x.get("combat")):
        section["ending"] = {"type": x.get("endingType") or "neutral"}
    elif x.get("isEnding"):
        review["dropped_endings"].append(sid)
    return section


GOLD = re.compile(r"\b(gold pieces?|coins?|gp)\b", re.I)


def normalize_items(v2):
    """One definition per item id (the catalogue), sections name ids; repeated grants become a quantity; gold becomes a number."""
    seen = {}                      # id -> definitions found inline

    def refs(lst, where):
        gold, order, qty = 0, [], {}
        for it in lst:
            if GOLD.search(it["name"]):
                m = re.search(r"(\d+)", it["name"])
                gold += int(m.group(1)) if m else 1
                continue
            d = {k: v for k, v in it.items() if k != "qty"}
            seen.setdefault(it["id"], []).append(d)
            if it["id"] not in qty:
                order.append(it["id"])
            qty[it["id"]] = qty.get(it["id"], 0) + it.get("qty", 1)
        return gold, [i if qty[i] == 1 else {"id": i, "qty": qty[i]} for i in order]

    def walk(o, where):
        if isinstance(o, dict):
            if isinstance(o.get("addItems"), list):
                gold, out = refs(o["addItems"], where)
                if gold:
                    o["gold"] = o.get("gold", 0) + gold
                if out:
                    o["addItems"] = out
                else:
                    del o["addItems"]
            for k, v in list(o.items()):
                if k != "addItems":
                    walk(v, where)
        elif isinstance(o, list):
            for v in o:
                walk(v, where)

    for sec in v2["sections"]:
        walk(sec, sec["id"])
    if v2.get("startingItems"):
        gold, out = refs(v2["startingItems"], "start")
        v2["startingItems"] = out
    catalogue = {}
    for iid, defs in seen.items():
        if iid in ITEM_DEFS:
            catalogue[iid] = ITEM_DEFS[iid]
            continue
        unique = {json.dumps(d, sort_keys=True): d for d in defs}
        best = max(unique.values(), key=lambda d: len(d))
        if len(unique) > 1:
            review["item_conflicts"].append(f"{iid}: {len(unique)} different inline definitions; kept the fullest ({best.get('name')})")
        review["uncatalogued"].append(f"{iid} ({best.get('name')})")
        catalogue[iid] = {k: v for k, v in best.items() if k != "id"}
    # items that only a catalogue entry mentions (never granted) are still listed, in case an option or a rule uses them
    for iid, d in ITEM_DEFS.items():
        catalogue.setdefault(iid, d)
    order = {"weapon": 0, "armor": 1, "potion": 2, "food": 2, "key": 3}
    v2["items"] = dict(sorted(catalogue.items(), key=lambda kv: (order.get(kv[1].get("type"), 4), kv[0])))


def main():
    v1 = json.load(open(SRC, encoding="utf-8"))
    v2 = {"schemaVersion": 2, "id": v1["id"], "title": v1["title"]}
    for k in ("author", "description"):
        if v1.get(k):
            v2[k] = v1[k]
    v2["startingSection"] = v1.get("startingSection", 1)
    v2["initialStats"] = v1["initialStats"]
    if v1.get("startingItems"):
        v2["startingItems"] = v1["startingItems"]
    v2["sections"] = [convert_section(x, v1) for x in v1["sections"]]
    normalize_items(v2)
    # keep the keys in the reader's order: items before sections
    v2 = {k: v2[k] for k in ("schemaVersion", "id", "title", "author", "description", "startingSection", "initialStats", "items", "startingItems", "sections") if k in v2}
    json.dump(v2, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    open(OUT, "a").write("\n")

    have = {(sec["id"], o["id"]) for sec in v2["sections"] for o in sec.get("options", [])}
    missing = sorted(set(LABEL_OVERRIDES) - have)
    if missing:
        raise SystemExit(f"LABEL_OVERRIDES refer to options that do not exist: {missing}")
    n_opts = sum(len(s.get("options", [])) for s in v2["sections"])
    follow = NOTES
    amb = [(sec["id"], [o["label"] for o in sec["options"]]) for sec in v2["sections"] if len(sec.get("options", [])) >= 2 and any(o["label"] == "Continue" for o in sec["options"])]
    longl = [(sec["id"], o["id"], o["label"]) for sec in v2["sections"] for o in sec.get("options", []) if len(o["label"]) > 60]
    lines = [f"# Migration review: {SRC} -> {OUT}", "", f"{len(v2['sections'])} sections, {n_opts} options, {sum(1 for sec in v2['sections'] for o in sec.get('options', []) if o['label'] == 'Continue')} labelled just 'Continue'.", "",
             "Items for a human to check. The conversion changed no game logic (every destination, condition, effect, roll and combat is identical to v1); the only flags dropped are 'ending' marks on sections that still lead somewhere (listed below). Run check_v2_equivalence.py to prove it.", ""]
    sections_ = (("follow", "Found while reading the text: logic that v1 already lacked (NOT changed by the migration)", follow),
                 ("amb", "Sections that mix 'Continue' with other labels (check they read clearly)", amb),
                 ("longl", "Labels longer than 60 characters", longl),
                 ("unreferenced", "Options not referenced in the text (listed under it): combat continuations, rewritten choices", review["unreferenced"]),
                 ("residual_roll", "Roll prose cut from inside a paragraph (check the text reads well)", review["residual_roll"]),
                 ("victory_narrative", "Narrative about winning a fight, kept as combat.victoryText", review["victory_narrative"]),
                 ("stripped_fragment", "'Turn to N' fragments and stray stat blocks removed", review["stripped_fragment"]),
                 ("item_conflicts", "Items defined differently in different sections (add them to the overrides file's \"items\")", review["item_conflicts"]),
                 ("uncatalogued", "Items taken from the sections' own definitions (not in the overrides file's \"items\")", review["uncatalogued"]),
                 ("dropped_endings", "Sections whose v1 ending flag was dropped (they are not endings)", review["dropped_endings"]))
    # a ready-to-fill skeleton for the sidecar: every section whose buttons would read the same or mostly "Continue"
    todo = {}
    for sec in v2["sections"]:
        labs = [o["label"] for o in sec.get("options", [])]
        if len(labs) >= 2 and (len(set(labs)) < len(labs) or "Continue" in labs):
            todo[str(sec["id"])] = {o["id"]: o["label"] for o in sec["options"]}
    if todo:
        lines += [f"## Labels still to write: {len(todo)} section(s)", "",
                  "Several buttons in these sections read the same (or just 'Continue'), so a player cannot tell them apart.",
                  "Copy this into the \"labels\" part of the overrides file and replace each label with what the button does:", "",
                  "```json", json.dumps({"labels": todo}, indent=2, ensure_ascii=False), "```", ""]
    for key, title, items in sections_:
        items = list(items.items()) if isinstance(items, dict) else items
        lines += [f"## {title}: {len(items)}", ""]
        for it in items[:60]:
            lines.append("- " + " | ".join(str(z) for z in (it if isinstance(it, tuple) else (it,))))
        if len(items) > 60:
            lines.append(f"- ... and {len(items) - 60} more")
        lines.append("")
    open(REVIEW, "w", encoding="utf-8").write("\n".join(lines))
    print(f"wrote {OUT} ({len(v2['sections'])} sections, {n_opts} options) and {REVIEW}")
    print({k: len(v) for k, v in review.items()})


if __name__ == "__main__":
    main()
