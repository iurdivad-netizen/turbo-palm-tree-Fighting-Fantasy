#!/usr/bin/env python3
"""Do a book's choices make sense? Looks at every menu (a section with 8 or more options) and asks, for each option:

  * does its label share a content word with the section it leads to?   (label vs destination)
  * if the label promises a fight, does a fight wait there? if it promises a find, does the place give anything?
  * does the place lead back to the menu you chose from?                (geography)

Usage: python3 check_option_coherence.py [book.v2.json] [--min-options 8]
It prints one line per menu, worst first, and a summary. A word overlap is a rough test: use it to find where to look, then read.
Exit code 0 always (it reports, it does not judge).
"""
import json
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BOOK = args[0] if args else "CURSE_OF_HOLLOWS_END.v2.json"
MIN = int(sys.argv[sys.argv.index("--min-options") + 1]) if "--min-options" in sys.argv else 8

book = json.load(open(BOOK, encoding="utf-8"))
S = {s["id"]: s for s in book["sections"]}
STOP = set("the a an to of and or in on at for with from into your you is it that this his her their its be as by up out back go get find search examine explore look visit enter take use read try investigate discover check attempt return continue another more some one them about locate".split())
FIGHT = re.compile(r"encounter|fight|attack|confront|battle|ambush|ghost|specter|spectre|zombie|skeleton|cultist|ghoul|undead|guardian", re.I)
FIND = re.compile(r"\b(find|locate|discover)\b", re.I)


def stem(w):
    return re.sub(r"(ing|ed|es|s)$", "", w)


def words(t):
    return {stem(w) for w in re.findall(r"[a-z']{3,}", t.lower()) if w not in STOP}


def exits(s):
    out = {o["target"] for o in s.get("options") or []}
    r = s.get("roll") or {}
    for side in ("success", "failure"):
        if (r.get(side) or {}).get("target") is not None:
            out.add(r[side]["target"])
    for oc in r.get("outcomes") or []:
        if oc.get("target") is not None:
            out.add(oc["target"])
    c = s.get("combat")
    for e in c if isinstance(c, list) else [c] if c else []:
        if e.get("onVictorySection") is not None:
            out.add(e["onVictorySection"])
    return out


def gives(s):
    fx = s.get("effects") or {}
    return bool(fx.get("addItems") or fx.get("gold") or fx.get("modifyStats") or fx.get("permanentStats"))


rows, tot = [], dict(n=0, share=0, fl=0, fk=0, fd=0, fg=0, back=0)
for h, s in S.items():
    opts = [o for o in s.get("options") or [] if o["label"] != "Continue"]
    if len(s.get("options") or []) < MIN or not opts:
        continue
    n = share = fl = fk = fd = fg = back = 0
    for o in opts:
        t = S[o["target"]]
        n += 1
        share += bool(words(o["label"]) & words((t.get("title") or "") + " " + t["text"][:1500]))
        if FIGHT.search(o["label"]):
            fl += 1
            fk += bool(t.get("combat"))
        if FIND.search(o["label"]):
            fd += 1
            fg += gives(t)
        back += h in exits(t)
    rows.append((share / n, h, n, share, fl, fk, fd, fg, back))
    for k, v in zip(("n", "share", "fl", "fk", "fd", "fg", "back"), (n, share, fl, fk, fd, fg, back)):
        tot[k] += v

print(f"{BOOK}: {len(rows)} menus of {MIN}+ options, {tot['n']} options\n")
print("menu  options  label shares a word with its destination   'find' labels that give something   leads back to the menu")
for share, h, n, sh, fl, fk, fd, fg, back in sorted(rows):
    flag = "  <-- labels do not describe where they lead" if share < 0.4 else ""
    print(f"{h:>4}  {n:>7}  {sh:>5} of {n:<3} ({100 * share:>3.0f}%)                        {fg:>3} of {fd:<3}                         {back:>3} of {n:<3}{flag}")
if tot["n"]:
    print(f"\nall menus: {100 * tot['share'] / tot['n']:.0f}% of labels share a word with their destination; "
          f"{tot['fg']} of {tot['fd']} 'find' labels lead to a place that gives something; "
          f"{tot['fk']} of {tot['fl']} 'fight' labels lead to a fight; {100 * tot['back'] / tot['n']:.0f}% lead back to their menu")
