#!/usr/bin/env python3
"""Builds simulation-report.html from simulation-results.json (see simulate_playthroughs.js).

Usage: python3 make_simulation_report.py [results.json] [book.json] [out.html]
"""
import html
import json
import math
import re
import sys
from collections import Counter, defaultdict

RES = sys.argv[1] if len(sys.argv) > 1 else "simulation-results.json"
BOOK = sys.argv[2] if len(sys.argv) > 2 else "CURSE_OF_HOLLOWS_END.json"
OUT = sys.argv[3] if len(sys.argv) > 3 else "simulation-report.html"

R = json.load(open(RES, encoding="utf-8"))
B = json.load(open(BOOK, encoding="utf-8"))
S = {x["id"]: x for x in B["sections"]}
P = R["policies"]
ORDER = ["random", "explorer", "guided"]
LABEL = {"random": "Random walker", "explorer": "Careful explorer", "guided": "Informed speed-runner"}
BLURB = {
    "random": "Picks uniformly among the options on screen. A floor for a player who never plans.",
    "explorer": "Visits new sections first and avoids the final door until it holds the Silver Key and her true name.",
    "guided": "Knows where the key, the name and a magical weapon are and walks straight there (15% random moves).",
}
COL = {"victory": "#2f9e6b", "defeat": "#c2453d", "instant-death": "#7a1f1f", "death": "#e08a3c", "stuck": "#8b8f98", "timeout": "#b9a46a"}
NAME = {"victory": "Victory", "defeat": "Died in combat / reached the defeat page", "instant-death": "Instant-death section", "death": "Died to a hazard", "stuck": "Stuck (no moves)", "timeout": "Timed out"}


def e(x):
    return html.escape(str(x))


def pct(a, b, d=1):
    return f"{100 * a / b:.{d}f}%" if b else "–"


def wilson(k, n, z=1.96):
    if not n:
        return (0, 0)
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0, c - h), min(1, c + h))


def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2] if xs else 0


def mean(xs):
    return sum(xs) / len(xs) if xs else 0


def bar(value, maxv, color="var(--accent)", label=""):
    w = 0 if not maxv else max(0.5, 100 * value / maxv)
    return f'<div class="bar"><span style="width:{w:.1f}%;background:{color}"></span><em>{label}</em></div>'


def sec_name(i):
    t = S.get(int(i), {}).get("text", "") if str(i).isdigit() else ""
    return re.sub(r"\s+", " ", t)[:70]


# ------------------------------------------------------------------ static analysis of the book
def targets(x):
    for c in x.get("choices") or []:
        yield c["targetSection"]
    tl = x.get("testLuck") or {}
    for k in ("successSection", "failureSection"):
        if tl.get(k):
            yield tl[k]
    for o in (x.get("diceRoll") or {}).get("outcomes", []):
        if o.get("targetSection"):
            yield o["targetSection"]
    cc = x.get("combat") or []
    for c in cc if isinstance(cc, list) else [cc]:
        for k in ("onVictorySection", "fleeSection"):
            if c.get(k):
                yield c[k]


reach = {1}
queue = [1]
while queue:
    for t in targets(S[queue.pop()]):
        if t in S and t not in reach:
            reach.add(t)
            queue.append(t)
visited_any = set()
for p in ORDER:
    visited_any |= {int(k) for k, v in P[p]["visitGames"].items() if v > 0}
never = sorted(set(S) - visited_any - {0, 999})
unreach = sorted(set(S) - reach - {0, 999})

inbound = Counter()
for x in B["sections"]:
    for t in set(targets(x)):
        inbound[t] += 1

skipped_menu = []
for x in B["sections"]:
    cc = x.get("combat")
    if not cc:
        continue
    last = cc[-1] if isinstance(cc, list) else cc
    tv = last.get("onVictorySection")
    menu = [c["targetSection"] for c in x.get("choices", []) if c["targetSection"] not in (tv, last.get("fleeSection"))]
    if tv and menu:
        only_here = [m for m in menu if inbound[m] == 1]
        skipped_menu.append((x["id"], tv, menu, only_here))

false_end = [x["id"] for x in B["sections"] if x.get("isEnding") and (x.get("choices") or x.get("diceRoll") or x.get("testLuck") or x.get("combat"))]
dice_gates, luck_gates = [], []
for x in B["sections"]:
    if x.get("diceRoll") or x.get("testLuck") or x.get("combat"):
        continue
    t = re.sub(r"\s+", " ", x["text"])
    if re.search(r"Roll (?:one|a) die", t, re.I):
        dice_gates.append(x["id"])
    elif re.search(r"Test your Luck", t, re.I):
        luck_gates.append(x["id"])
converted = [x["id"] for x in B["sections"] if x.get("diceRoll") or x.get("testLuck")]

src245 = [x['id'] for x in B['sections'] if any(c['targetSection'] == 245 for c in x.get('choices', []))]

# ------------------------------------------------------------------ pooled combat table
comb = defaultdict(lambda: dict(section=0, enemies="", fights=0, won=0, lost=0, fled=0, stamLost=0, rounds=0))
for p in ORDER:
    for k, v in P[p]["combat"].items():
        c = comb[k]
        c["section"], c["enemies"] = v["section"], v["enemies"]
        for f in ("fights", "won", "lost", "fled", "stamLost", "rounds"):
            c[f] += v[f]
comb_rows = sorted(comb.values(), key=lambda c: -c["fights"])

dmg = defaultdict(lambda: dict(n=0, net=0, lost=0, deaths=0))
for p in ORDER:
    for k, v in P[p]["damage"].items():
        d = dmg[int(k)]
        for f in ("n", "net", "lost", "deaths"):
            d[f] += v[f]

# ------------------------------------------------------------------ html pieces
N = R["games"]


def outcome_block():
    rows = []
    for p in ORDER:
        a = P[p]
        n = a["games"]
        segs = ""
        legend = ""
        for k in ["victory", "defeat", "instant-death", "death", "stuck", "timeout"]:
            v = a["outcomes"].get(k, 0)
            if v:
                segs += f'<span style="width:{100 * v / n:.2f}%;background:{COL[k]}" title="{NAME[k]}: {v}"></span>'
                legend += f'<li><i style="background:{COL[k]}"></i>{NAME[k]} <b>{pct(v, n)}</b> <small>({v})</small></li>'
        lo, hi = wilson(a["outcomes"].get("victory", 0), n)
        rows.append(f'''<div class="policy"><h3>{LABEL[p]}</h3><p class="muted">{BLURB[p]}</p>
<div class="stack">{segs}</div><ul class="legend">{legend}</ul>
<p class="small">Win rate <b>{pct(a["outcomes"].get("victory", 0), n)}</b> (95% interval {100 * lo:.1f}–{100 * hi:.1f}%) · median {median(a["steps"])} moves · {mean(a["uniqueSections"]):.0f} distinct sections seen on average</p></div>''')
    return "\n".join(rows)


def death_table(p):
    a = P[p]
    n = a["games"]
    items = sorted(a["deathCauses"].items(), key=lambda kv: -kv[1])[:7]
    mx = items[0][1] if items else 1
    rows = ""
    for k, v in items:
        pretty = {"section 4": "Instant death: section 4 (spike pit)", "section 39": "Instant death: section 39 (spectral blade)", "section 65": "Instant death: section 65 (bottomless pit)"}.get(k, k.replace("combat: ", "Fight: "))
        rows += f"<tr><td>{e(pretty)}</td><td class='num'>{v}</td><td style='width:38%'>{bar(v, mx, '#c2453d', pct(v, n))}</td></tr>"
    return f"<div><h4>{LABEL[p]}</h4><table class='t'><tbody>{rows}</tbody></table></div>"


def via_table(p):
    a = P[p]
    items = sorted([(k, v) for k, v in a.get("deathVia", {}).items() if k.split(" > ")[1] in ("4", "39", "65")], key=lambda kv: -kv[1])[:5]
    tot = sum(v for k, v in a.get("deathVia", {}).items() if k.split(" > ")[1] in ("4", "39", "65"))
    return items, tot


def funnel_row(p):
    g = P[p]["gate"]
    return f"""<tr><td>{LABEL[p]}</td><td class='num'>{g.get('arrivals', 0)}</td><td class='num'>{g.get('missingEither', 0)}</td>
<td class='num'>{pct(g.get('missingEither', 0), g.get('arrivals', 0), 0)}</td><td class='num'>{g.get('ritualAttempts', 0)}</td><td class='num'>{g.get('ritualLucky', 0)}</td>
<td class='num'>{sum(P[p].get('via362', {}).values())}</td><td class='num'>{g.get('finalFightEntered', 0)}</td><td class='num'>{g.get('finalFightWon', 0)}</td><td class='num'>{g.get('finalFightLost', 0)}</td></tr>"""


def histogram(p, key, cap, bins=24, color="var(--accent)"):
    xs = [min(x, cap) for x in P[p][key]]
    step = max(1, math.ceil(cap / bins))
    h = Counter((x // step) * step for x in xs)
    mx = max(h.values()) if h else 1
    cols = ""
    for lo in range(0, cap + 1, step):
        v = h.get(lo, 0)
        cols += f'<div class="col" title="{lo}–{lo + step - 1}: {v} games"><span style="height:{100 * v / mx:.1f}%;background:{color}"></span></div>'
    return f'<div class="hist">{cols}</div><div class="axis"><span>0</span><span>{cap // 2}</span><span>{cap}+</span></div>'


def combat_table():
    rows = ""
    big = [c for c in comb_rows if c["fights"] >= 25]
    big.sort(key=lambda c: (c["won"] / max(1, c["fights"] - c["fled"])))
    for c in big[:14]:
        decided = c["fights"] - c["fled"]
        rows += f"""<tr><td>{c['section']}</td><td>{e(c['enemies'])}</td><td class='num'>{c['fights']}</td>
<td class='num'>{pct(c['won'], decided, 0)}</td><td class='num'>{pct(c['fled'], c['fights'], 0)}</td><td class='num'>{c['stamLost'] / max(1, c['fights']):.1f}</td></tr>"""
    return rows


def hazard_table():
    rows = ""
    cand = [(i, d) for i, d in dmg.items() if d["n"] >= 40 and d["lost"] > 0]
    cand.sort(key=lambda kv: -kv[1]["lost"])
    for i, d in cand[:12]:
        kind = "combat" if S[i].get("combat") else ("dice roll" if S[i].get("diceRoll") else ("luck test" if S[i].get("testLuck") else "effect"))
        rows += f"<tr><td>{i}</td><td>{kind}</td><td class='num'>{d['n']}</td><td class='num'>{d['lost'] / d['n']:.2f}</td><td class='num'>{d['deaths']}</td><td class='small'>{e(sec_name(i))}…</td></tr>"
    return rows


def top_visited():
    tot = defaultdict(int)
    for p in ORDER:
        for k, v in P[p]["visitGames"].items():
            tot[int(k)] += v
    return sorted(tot.items(), key=lambda kv: -kv[1])[:8]


# numbers for the narrative
def load_stage(path):
    try:
        return json.load(open(path, encoding="utf-8"))["policies"]
    except OSError:
        return None


ST0, ST1 = load_stage("simulation-results-before.json"), load_stage("simulation-results-v2.json")
STAGES = [("Original", ST0), ("Chance gates converted", ST1), ("Structural fixes", P)]
rnd, exp, gd = P["random"], P["explorer"], P["guided"]
n = N
speed = [r["steps"] for r in gd["victoryRuns"]]
W = {p: P[p]["outcomes"].get("victory", 0) for p in ORDER}
W1 = {p: ST1[p]["outcomes"].get("victory", 0) for p in ORDER} if ST1 else None
W0 = {p: ST0[p]["outcomes"].get("victory", 0) for p in ORDER} if ST0 else None
c362 = next(c for c in comb_rows if c["section"] == 362)
c394 = next(c for c in comb_rows if c["section"] == 394)


def deaths_into(stage, ids=("4", "39", "65")):
    return {p: sum(v for k, v in stage[p].get("deathVia", {}).items() if k.split(" > ")[1] in ids) for p in ORDER}


def into362(stage):
    return {p: sum(stage[p].get("via362", {}).values()) for p in ORDER}


f362_now, f362_prev = into362(P), (into362(ST1) if ST1 else None)

# the rolls that still end in instant death (pooled over the three players)
TRAPS = [(7, "4–6", "50%", "rope snaps"), (167, "1–3", "50%", "floor gives way"), (275, "1–2", "33%", ""), (150, "1–2", "33%", ""),
         (107, "1–2", "33%", ""), (245, "1–2, then a failed Luck test", "≈6%", "fixed: Luck save"), (189, "1–2, then a failed Luck test", "≈6%", "fixed: Luck save")]
trap_rows = []
for sid, band, chance, note in TRAPS:
    reached = sum(P[p]["visitGames"].get(str(sid), 0) for p in ORDER)
    died = sum(v for p in ORDER for k, v in P[p].get("deathVia", {}).items() if k.startswith(f"{sid} > ") and k.split(" > ")[1] in ("4", "39", "65"))
    died_g = sum(v for k, v in gd.get("deathVia", {}).items() if k.startswith(f"{sid} > ") and k.split(" > ")[1] in ("4", "39", "65"))
    before_died = sum(v for p in ORDER for k, v in (ST1 or P)[p].get("deathVia", {}).items() if k.startswith(f"{sid} > ") and k.split(" > ")[1] in ("4", "39", "65"))
    trap_rows.append((sid, band, chance, note, reached, died, before_died, inbound[sid]))
trap_by = {r_[0]: r_ for r_ in trap_rows}
fixed_now = trap_by[245][5] + trap_by[189][5]
fixed_before = trap_by[245][6] + trap_by[189][6]
other_now = sum(r_[5] for r_ in trap_rows if r_[0] not in (245, 189))
top_other = sorted((r_ for r_ in trap_rows if r_[0] not in (245, 189)), key=lambda r_: -r_[5])

one_way = sorted(x["id"] for x in B["sections"] if x["id"] != 395 and set(targets(x)) == {395})
unprep = {p: (P[p]["gate"].get("missingEither", 0), P[p]["gate"].get("arrivals", 0)) for p in ORDER}
retreat_rooms = sorted(x["id"] for x in B["sections"] if any(c["targetSection"] == 388 for c in x.get("choices") or []) and x["id"] not in (388,))
mismatch = [(x["id"], x["testLuck"]["failureSection"]) for x in B["sections"] if x.get("testLuck") and x["testLuck"].get("failureSection") in (97, 117, 152)]
mismatch_by = defaultdict(list)
for a_, b_ in mismatch:
    mismatch_by[b_].append(a_)
left_gates = sorted(dice_gates + luck_gates)
final_g = gd["gate"]

verdict = f"""
<p><b>Both structural problems are fixed, and the win rates moved a long way.</b>
Informed player {pct(W0['guided'], n)} → {pct(W1['guided'], n)} → <b>{pct(W['guided'], n)}</b> across the three builds;
careful explorer {pct(W0['explorer'], n)} → {pct(W1['explorer'], n)} → <b>{pct(W['explorer'], n)}</b>;
random walker {pct(W0['random'], n)} → {pct(W1['random'], n)} → <b>{pct(W['random'], n)}</b>.
(Original build → chance gates converted → structural fixes, same seed and bots.)</p>
<ul>
<li><b>Pit traps 245 and 189.</b> A roll of 1–2 is now a Luck test instead of death. Deaths there fell from <b>{fixed_before:,}</b> to <b>{fixed_now:,}</b> across the 3,000 games.</li>
<li><b>One-way doors.</b> The preparation rooms return to their hub and 395 lets an unprepared player back away. Entries into the deadly 362 ambush fell from
<b>{sum(f362_prev.values()):,}</b> to <b>{sum(f362_now.values()):,}</b>.</li>
</ul>
<p><b>What now limits the book is smaller and more ordinary:</b> the remaining instant-death rolls (section 7 and 167 at 50%, 275, 150 and 107 at 33%) account for
<b>{other_now:,}</b> deaths, and the Widow's final fight is lost {pct(final_g['finalFightLost'], final_g['finalFightEntered'], 0)} of the time by the informed player ({final_g['finalFightLost']} of {final_g['finalFightEntered']} fights).
Random players win {pct(W['random'], n)} of games, which is low but no longer the near-zero it was. These results describe this build and these bots, so read them as a diagnosis, not a final balance verdict.</p>
"""

compare_rows = ""
if ST0 and ST1:
    def trio(k, p):
        vals = [stg[p]["outcomes"].get(k, 0) for _, stg in STAGES]
        return "".join(f"<td class='num'>{'<b>' if i == 2 else ''}{pct(v, n)}{'</b>' if i == 2 else ''}</td>" for i, v in enumerate(vals))
    def med(p):
        return "".join(f"<td class='num'>{'<b>' if i == 2 else ''}{median(stg[p]['steps'])}{'</b>' if i == 2 else ''}</td>" for i, (_, stg) in enumerate(STAGES))
    for p in ORDER:
        compare_rows += f"<tr><td>{LABEL[p]}</td>{trio('victory', p)}{trio('instant-death', p)}{trio('defeat', p)}{med(p)}</tr>"

trap_html = "".join(
    f"<tr><td>{sid}</td><td>{band}</td><td class='num'>{ch if not str(sid) in ('245', '189') else pct(died, reached, 0) + ' observed'}</td><td class='num'>{ib}</td><td class='num'>{reached:,}</td><td class='num'>{before:,}</td><td class='num'><b>{died:,}</b></td><td class='small'>{note}</td></tr>"
    for sid, band, ch, note, reached, died, before, ib in trap_rows
)

findings = f"""
<div class="finding sev-good"><h3><span>✓</span> Fixed: pit traps 245 and 189 <em>done</em></h3>
<p>A roll of 1–2 no longer sends the player to the death page. It now asks for a Luck test to catch the edge (the player loses 4 STAMINA at 245, 3 at 189) and only a failed test falls.
At full LUCK that turns a one-in-three death into about one in eighteen. In the simulation the observed rate is
<b>{pct(trap_by[245][5], trap_by[245][4])}</b> at 245 and <b>{pct(trap_by[189][5], trap_by[189][4])}</b> at 189 of the games that reached them, because players arrive with LUCK already spent on earlier tests (each test costs 1).
Deaths at these two sections: <b>{fixed_before:,} → {fixed_now:,}</b>.</p></div>

<div class="finding sev-good"><h3><span>✓</span> Fixed: the final-preparation rooms <em>done</em></h3>
<p>Rooms {', '.join(map(str, [377, 380, 381, 382, 383, 384, 385, 386, 387, 389, 390]))} now return to their hub (388, or the staircase 355 for 377 and 380) instead of carrying the player to 395, and the fights among them hand back to 388 after the win.
Section 395 offers "back away and prepare further" to a player without both the Silver Key and her true name, and section 29 offers "keep searching".
Entries into the 362 ambush: <b>{sum(f362_prev.values()):,} → {sum(f362_now.values()):,}</b>. Unprepared arrivals at 395 are still common ({pct(unprep['explorer'][0], unprep['explorer'][1], 0)} for the explorer) but most of them now back away.</p></div>

<div class="finding sev-high"><h3><span>1</span> Five other rolls still end in instant death <em>high</em></h3>
<p>The same pattern as 245 and 189 remains in sections 7, 167, 275, 150 and 107. The two worst are <b>section 7</b> (the rope snaps; a roll of 4–6 means death, {trap_by[7][7]} links in)
and <b>section 167</b> (roll 1–3). Together they caused <b>{other_now:,}</b> deaths in {3 * n:,} games; section 7 alone ended <b>{exp['deathVia'].get('7 > 4', 0)}</b> of the careful explorer's {n:,} games.
These are the next candidates for the same Luck-save treatment (or to be turned into damage).</p>
<div class="scroll"><table class="t"><thead><tr><th>Section</th><th>Dies on</th><th class="num">Chance</th><th class="num">Links in</th><th class="num">Games that reached it</th><th class="num">Deaths (gates build)</th><th class="num">Deaths now</th><th></th></tr></thead><tbody>{trap_html}</tbody></table></div></div>

<div class="finding sev-med"><h3><span>2</span> The "incomplete victory" ending does not exist <em>medium</em></h3>
<p>Section 362 ends in the text with "THE END (Partial Victory)", but in the data its fight leads on to section 363, an ordinary Phantom Servant ambush, and then back into the hub at 335.
Players who survive the three Shadows and the weakened Widow get no ending. Add a proper ending section (or make 362 an ending after the fight).</p></div>

<div class="finding sev-med"><h3><span>3</span> Wrong "ending" flags on {len(false_end)} mid-game sections <em>medium</em></h3>
<p>Sections {', '.join(map(str, false_end))} are flagged as endings although they carry choices, dice rolls or combat. The reader prints a "Victory!" or "The End" banner on them while the story continues
(24 and 56 are the Mayor refusing to help, flagged as <i>victory</i>). This came from the converter reading "(VICTORY!)" or "THE END" in prose. Remove <code>isEnding</code> from these sections.</p></div>

<div class="finding sev-med"><h3><span>4</span> {sum(len(m[3]) for m in skipped_menu)} sections can never be reached in play <em>medium</em></h3>
<p>{'; '.join(f"Section {a} lists {len(m)} places to explore after the fight, but its victory link jumps straight to {b}, so the menu is never shown. Sections {', '.join(map(str, o))} have no other entrance." for a, b, m, o in skipped_menu)}
These are the {len(never)} sections the bots never entered in {3 * N:,} games. Fix: remove <code>onVictorySection</code> from the fight so its menu appears after the win (and keep the jump target as one of the menu items).</p></div>

<div class="finding sev-med"><h3><span>5</span> Some Luck-test failures lead somewhere that does not fit <em>medium</em></h3>
<p>The conversion follows the book's own cross-references literally, and some of them do not match the story:
{'; '.join(f"failing the test in {', '.join(map(str, v))} sends you to <b>{k}</b> ({ {97: 'a healing shrine that fully restores STAMINA and gives +1 LUCK', 117: 'a journal with the curse timeline', 152: 'a study with a journal'}[k] })" for k, v in sorted(mismatch_by.items()))}.
In those sections an unlucky roll is a reward. I did not guess the author's intent; they need a human decision (most likely a real trap section, such as the dart trap in 58).</p></div>

<div class="finding sev-info"><h3><span>6</span> Still open <em>note</em></h3>
<p>{', '.join(map(str, left_gates)) or 'None'}: {'section 22 is a Ghoul paralysis test whose SKILL penalty must carry into the next fight; it needs a carry-over penalty mechanic' if 22 in left_gates else 'no remaining unconverted gates'}.
The Widow's final fight (394) is now the informed player's main killer: {final_g['finalFightLost']} losses in {final_g['finalFightEntered']} fights ({pct(final_g['finalFightWon'], final_g['finalFightEntered'], 0)} won).
She is immune to non-magical weapons and her Wail can cost 2 SKILL for the whole fight, so a player who reaches her without a magical weapon cannot win; the book does not guarantee one.</p></div>
"""

method = f"""
<ul>
<li><b>Engine:</b> the bots drive the real <code>index.html</code> game logic (<code>GameState</code>, <code>fightRound</code>, <code>handleChoice</code>, Luck tests, dice rolls, item use, conditions) in headless Chromium, with delays and DOM rendering switched off.</li>
<li><b>Randomness:</b> a seeded generator (seed {R['seed']}) feeds every die and every bot decision, so the run is reproducible. {N:,} games per policy, {3 * N:,} in total, in {R['runtimeSeconds']:.0f}s. All three builds use the same seed.</li>
<li><b>Shared bot habits:</b> flee when STAMINA ≤ {R['opts']['fleeAt']} and the fight allows it; eat or drink healing items when STAMINA falls below {int(R['opts']['healAt'] * 100)}% of the maximum (and below {int(R['opts']['preFightHeal'] * 100)}% before a fight); a game ends after {R['opts']['maxSteps']:,} moves.</li>
<li><b>Roll once:</b> encounter hubs (155, 221, 301, 335, 355, 127) and the pit traps (150, 189, 245, 275) roll only on the first visit per game. Other traps roll again on every visit.</li>
<li><b>Limits:</b> bots are not people. Random under-plays (never plans) and the informed bot over-plays (has read the book), so treat them as bounds. The explorer retreats from the final door when it can. Gold is never spent (the book has no shop). Reading text, noticing hints and risk-aversion are not modelled.</li>
</ul>
<p class="small">Reproduce: <code>node simulate_playthroughs.js CURSE_OF_HOLLOWS_END.json 1000 simulation-results.json {R['seed']} &amp;&amp; python3 make_simulation_report.py</code>. The earlier builds' results are kept in <code>simulation-results-before.json</code> and <code>simulation-results-v2.json</code>.</p>
"""

cards = "".join(
    f"""<div class="card"><small>{LABEL[p]}</small><b>{pct(P[p]['outcomes'].get('victory', 0), N)}</b><span>win rate</span>
<small>{pct(P[p]['outcomes'].get('instant-death', 0), N, 0)} instant death · {pct(P[p]['outcomes'].get('defeat', 0), N, 0)} defeat</small></div>"""
    for p in ORDER
)

hist_html = "".join(
    f"<div class='hp'><h4>{LABEL[p]}</h4>{histogram(p, 'steps', 80, 20)}<p class='small'>moves per game · median {median(P[p]['steps'])} · mean {mean(P[p]['steps']):.0f}</p></div>"
    for p in ORDER
)

fin_html = "".join(f"<td>{x}</td>" for x in [])
visited = len(visited_any)
coverage = f"""
<p>Across all {3 * N:,} games the bots entered <b>{visited}</b> of {len(S) - 1} sections (not counting the intro). Statically, <b>{len(S) - 1 - len(unreach)}</b> are reachable from section 1.
{'Never entered: ' + ', '.join(map(str, never)) + '.' if never else 'Every reachable section was entered at least once.'}
{'Not reachable by any route from section 1: ' + ', '.join(map(str, unreach)) + '.' if unreach else ''}</p>
<p class="small">Busiest sections (games × bots): {', '.join(f'<b>{i}</b> ({v:,})' for i, v in top_visited())}. These hubs are why the shortest path is so short.</p>
"""

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playthrough Simulation Report</title>
<style>
:root{{--bg:#faf7f0;--fg:#22201c;--muted:#6b665c;--card:#fff;--line:#e4ddcc;--accent:#b5651d;--good:#2f9e6b;--bad:#c2453d}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#16140f;--fg:#ece6d6;--muted:#a39b86;--card:#1f1c15;--line:#38332a;--accent:#e0a050}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:980px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:1.9rem;margin:.2em 0}}h2{{margin:2.2em 0 .4em;font-size:1.35rem;border-bottom:2px solid var(--line);padding-bottom:.25em}}h3{{margin:.2em 0}}h4{{margin:1.2em 0 .3em}}
.muted,.small{{color:var(--muted)}}.small{{font-size:.88rem}}code{{background:var(--card);border:1px solid var(--line);padding:0 .3em;border-radius:4px;font-size:.9em}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:16px 0}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}}.card b{{display:block;font-size:2.1rem;line-height:1.1}}.card span{{color:var(--muted);display:block}}.card small{{display:block;color:var(--muted)}}
.verdict{{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--bad);border-radius:8px;padding:6px 18px;margin:18px 0}}
.policy{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:12px 0}}
.stack{{display:flex;height:26px;border-radius:6px;overflow:hidden;background:var(--line)}}.stack span{{display:block;height:100%}}
.legend{{list-style:none;padding:0;margin:8px 0;display:flex;flex-wrap:wrap;gap:4px 18px;font-size:.9rem}}.legend i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}}
table.t{{border-collapse:collapse;width:100%;font-size:.92rem}}.t th,.t td{{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}}.t th{{font-weight:600;color:var(--muted)}}.num{{text-align:right!important;font-variant-numeric:tabular-nums}}
.bar{{position:relative;height:18px;background:var(--line);border-radius:4px;min-width:90px}}.bar span{{position:absolute;left:0;top:0;bottom:0;border-radius:4px}}.bar em{{position:relative;font-style:normal;font-size:.78rem;padding-left:6px;line-height:18px;color:var(--fg)}}
.cols{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}}.deaths{{grid-template-columns:1fr}}@media (min-width:900px){{.deaths{{grid-template-columns:repeat(3,1fr)}}}}
.hist{{display:flex;align-items:flex-end;gap:2px;height:90px;border-bottom:1px solid var(--line)}}.col{{flex:1;height:100%;display:flex;align-items:flex-end}}.col span{{display:block;width:100%;border-radius:2px 2px 0 0}}
.axis{{display:flex;justify-content:space-between;font-size:.75rem;color:var(--muted)}}
.finding{{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--muted);border-radius:8px;padding:8px 16px;margin:14px 0}}.finding h3 span{{display:inline-block;width:1.5em;height:1.5em;line-height:1.5em;text-align:center;border-radius:50%;background:var(--fg);color:var(--bg);font-size:.8em;margin-right:.4em}}
.finding h3 em{{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;float:right;color:var(--muted)}}.sev-high{{border-left-color:var(--bad)}}.sev-med{{border-left-color:#e08a3c}}.sev-info{{border-left-color:#6b8fb5}}.sev-good{{border-left-color:var(--good)}}
.scroll{{overflow-x:auto}}footer{{margin-top:40px;color:var(--muted);font-size:.85rem}}
</style></head><body><main>
<h1>Playthrough Simulation Report</h1>
<p class="muted">{e(R['book']['title'])} · {R['book']['sections']} sections · {N:,} simulated games for each of three player types ({3 * N:,} total) · seed {R['seed']}</p>
<div class="cards">{cards}</div>
<div class="verdict">{verdict}</div>

<h2>1 · Three builds, same players, same seed</h2>
<p>Original build, then after converting the chance gates, then after the structural fixes (preparation rooms and pit traps).</p>
<div class="scroll"><table class="t"><thead><tr><th rowspan="2">Player</th><th colspan="3" class="num">Victory</th><th colspan="3" class="num">Instant death</th><th colspan="3" class="num">Died in combat</th><th colspan="3" class="num">Median moves</th></tr>
<tr>{''.join('<th class="num">orig</th><th class="num">gates</th><th class="num">now</th>' for _ in range(4))}</tr></thead><tbody>{compare_rows}</tbody></table></div>

<h2>2 · How the games ended</h2>
{outcome_block()}

<h2>3 · What kills players</h2>
<p>Share of all games that ended in each death. "Section 4/39/65" are the instant-death pages.</p>
<div class="cols deaths">{death_table('random')}{death_table('explorer')}{death_table('guided')}</div>
<h4>Which section sent them to the instant-death page</h4>
<div class="scroll"><table class="t"><thead><tr><th>Player</th><th>Top routes into 4 / 39 / 65</th></tr></thead><tbody>
{''.join(f"<tr><td>{LABEL[p]}</td><td>{', '.join(f'<b>{k}</b> ×{v}' for k, v in via_table(p)[0])}</td></tr>" for p in ORDER)}
</tbody></table></div>

<h2>4 · The final confrontation</h2>
<p>How often players reach section 395 and what happens there. <i>Arrivals</i> counts every entry to 395; <i>unprepared</i> means without both the Silver Key and her true name.</p>
<div class="scroll"><table class="t"><thead><tr><th>Player</th><th class="num">Arrivals</th><th class="num">Unprepared</th><th class="num">%</th><th class="num">Ritual tried</th><th class="num">Ritual lucky</th><th class="num">Entered 362</th><th class="num">Widow fight</th><th class="num">Won</th><th class="num">Lost</th></tr></thead><tbody>
{''.join(funnel_row(p) for p in ORDER)}</tbody></table></div>
<p class="small">The ritual is the Luck test at 395; lucky goes straight to victory (400), unlucky fights the Widow in section 394 (SKILL 11, STAMINA 15, immune to non-magical weapons).</p>

<h2>5 · Game length</h2>
<div class="cols">{hist_html}</div>

<h2>6 · The deadliest fights</h2>
<p>Pooled over all {3 * N:,} games; fights seen at least 25 times, lowest win rate first. A fight ends in a win, a death or a flight.</p>
<div class="scroll"><table class="t"><thead><tr><th>Section</th><th>Enemies</th><th class="num">Fights</th><th class="num">Won (of fought)</th><th class="num">Fled</th><th class="num">STAMINA lost / fight</th></tr></thead><tbody>{combat_table()}</tbody></table></div>

<h2>7 · Where STAMINA goes</h2>
<p>Sections ranked by total STAMINA lost on entering or rolling in them (sections entered at least 40 times).</p>
<div class="scroll"><table class="t"><thead><tr><th>Section</th><th>Type</th><th class="num">Entries</th><th class="num">Avg loss</th><th class="num">Deaths</th><th>Text</th></tr></thead><tbody>{hazard_table()}</tbody></table></div>

<h2>8 · Coverage</h2>
{coverage}

<h2>9 · Findings</h2>
{findings}

<h2>10 · Method and limits</h2>
{method}
<footer>Generated from <code>{e(RES)}</code> by <code>make_simulation_report.py</code>.</footer>
</main></body></html>
"""
open(OUT, "w", encoding="utf-8").write(page)
print("wrote", OUT, len(page) // 1024, "KB")
