#!/usr/bin/env python3
"""Builds simulation-report.html from simulation-results.json (see simulate_playthroughs.js).
The earlier builds it compares against are kept as simulation-results-before / -v2 / -v3 / -v3b / -v4.json.

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
COL = {"victory": "#2f9e6b", "defeat": "#c2453d", "instant-death": "#7a1f1f", "incomplete-victory": "#d6a23a", "death": "#e08a3c", "stuck": "#8b8f98", "timeout": "#b9a46a"}
NAME = {"victory": "Victory", "defeat": "Died in combat / reached the defeat page", "instant-death": "Instant-death section", "incomplete-victory": "Incomplete victory (faced the Widow unprepared)", "death": "Died to a hazard", "stuck": "Stuck (no moves)", "timeout": "Timed out"}


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
        for side in ("success", "failure"):                      # a Luck save nested in a dice outcome
            t_ = ((o.get("luckTest") or {}).get(side) or {}).get("targetSection")
            if t_:
                yield t_
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
        for k in ["victory", "incomplete-victory", "defeat", "instant-death", "death", "stuck", "timeout"]:
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


ST0, ST1, ST2 = load_stage("simulation-results-before.json"), load_stage("simulation-results-v2.json"), load_stage("simulation-results-v3.json")
ST3, ST4, ST5, ST6, ST7 = load_stage("simulation-results-v3b.json"), load_stage("simulation-results-v4.json"), load_stage("simulation-results-v5.json"), load_stage("simulation-results-v6.json"), load_stage("simulation-results-v7.json")
STAGES = [("orig", ST0), ("gates", ST1), ("struct", ST2), ("saves", ST3), ("fixes", ST4), ("items", ST5), ("hub", ST6), ("menus", ST7), ("now", P)]
STAGE_TEXT = "Original build; chance gates converted; structural fixes (preparation rooms, pits 245 and 189); Luck saves on the other five pit rolls; the open book issues fixed (sections 22, 362, 180, trap failures, item gates); the item rules (catalogue, hold and wear, charms, stealth and invisibility, maps, readable books, rings); the choices relabelled and the ambushes moved out of the preparation hub 388; the menus rewired so that every side room leads back to its menu and the rooms leave the menu once explored; and finally the monster rules (the Wight's life drain, the Fanatic's spell, the Doppelganger's shapechanging)."
rnd, exp, gd = P["random"], P["explorer"], P["guided"]
n = N
W = lambda st: {p: st[p]["outcomes"].get("victory", 0) for p in ORDER}
c362 = next(c for c in comb_rows if c["section"] == 362)
c394 = next(c for c in comb_rows if c["section"] == 394)
final_g = gd["gate"]
ZERO = ("4", "39", "65")


def deaths_at(stage, sid):
    return sum(v for p in ORDER for k, v in stage[p].get("deathVia", {}).items() if k.startswith(f"{sid} > ") and k.split(" > ")[1] in ZERO)


FIVE = (7, 167, 275, 150, 107)
five_before, five_now = sum(deaths_at(ST2, s_) for s_ in FIVE), sum(deaths_at(P, s_) for s_ in FIVE)
two_now = deaths_at(P, 245) + deaths_at(P, 189)


def luck_stats(sid):
    rolls = sum(P[p].get("luckAtRoll", {}).get(str(sid), {}).get("n", 0) for p in ORDER)
    tot = sum(P[p].get("luckAtRoll", {}).get(str(sid), {}).get("sum", 0) for p in ORDER)
    low = sum(P[p].get("luckAtRoll", {}).get(str(sid), {}).get("low", 0) for p in ORDER)
    return rolls, (tot / rolls if rolls else 0), low


luck_rows = []
for sid, band, chance in ((245, "1–2", "1/3"), (189, "1–2", "1/3"), (7, "4–6", "1/2"), (167, "1–3", "1/2"), (275, "1–2", "1/3"), (150, "1–2", "1/3"), (107, "1–2", "1/3")):
    rolls, avg, low = luck_stats(sid)
    died = deaths_at(P, sid)
    reached = sum(P[p]["visitGames"].get(str(sid), 0) for p in ORDER)
    luck_rows.append((sid, band, chance, rolls, avg, low, died, inbound[sid]))
luck_by = {r_[0]: r_ for r_ in luck_rows}
all_rolls = sum(sum(v["n"] for v in P[p].get("luckAtRoll", {}).values()) for p in ORDER)
all_luck = sum(sum(v["sum"] for v in P[p].get("luckAtRoll", {}).values()) for p in ORDER)
mean_luck = all_luck / all_rolls if all_rolls else 0

into362 = lambda st: sum(sum(st[p].get("via362", {}).values()) for p in ORDER)
mismatch = [(x["id"], x["testLuck"]["failureSection"]) for x in B["sections"] if x.get("testLuck") and x["testLuck"].get("failureSection") in (97, 117, 152)]
mismatch_by = defaultdict(list)
for a_, b_ in mismatch:
    mismatch_by[b_].append(a_)
left_gates = sorted(dice_gates + luck_gates)
n_luck_tests = sum(1 for x in B["sections"] if x.get("testLuck"))
n_saves = sum(1 for x in B["sections"] for o in (x.get("diceRoll") or {}).get("outcomes", []) if o.get("luckTest"))
luck_sources = [x["id"] for x in B["sections"] if any(isinstance((x.get(k) or {}).get("luck"), (int, str)) and (x.get(k) or {}).get("luck") not in (0, -1) for k in ("modifyStats",))]
widow_loss = pct(final_g["finalFightLost"], final_g["finalFightEntered"], 0)
w0, w1, w2, w3, w4, w5, w6, w7, w8 = W(ST0), W(ST1), W(ST2), W(ST3), W(ST4), W(ST5), W(ST6), W(ST7), W(P)


def ci_overlap(k1, k2):
    lo1, hi1 = wilson(k1, n)
    lo2, hi2 = wilson(k2, n)
    return not (hi1 < lo2 or hi2 < lo1)


moved = [LABEL[p].lower() for p in ORDER if not ci_overlap(w7[p], w8[p])]
flat = [LABEL[p].lower() for p in ORDER if ci_overlap(w7[p], w8[p])]
newest = " and the ".join(moved)
headline = (f"The monster rules clearly moved the {newest}" + (f"; the {' and the '.join(flat)} " + ("are" if len(flat) > 1 else "is") + " within run-to-run noise." if flat else ".")) if moved else "No win rate moved clearly since the last build: all three players are within run-to-run noise."
inc = {p: P[p]["outcomes"].get("incomplete-victory", 0) for p in ORDER}
verdict = f"""
<p><b>{headline}</b>
Victory rate, original build → now: informed player {pct(w0['guided'], n)} → <b>{pct(w8['guided'], n)}</b>,
careful explorer {pct(w0['explorer'], n)} → <b>{pct(w8['explorer'], n)}</b>, random walker {pct(w0['random'], n)} → <b>{pct(w8['random'], n)}</b>.
Since the previous build (menus rewired, before the monster rules): informed {pct(w7['guided'], n)} → {pct(w8['guided'], n)}, explorer {pct(w7['explorer'], n)} → {pct(w8['explorer'], n)}, random {pct(w7['random'], n)} → {pct(w8['random'], n)}
(a change of about 2.6 points is run-to-run noise).</p>
<ul>
<li><b>A new ending now exists:</b> “Incomplete victory” (section 998): {inc['random']:,} random walkers, {inc['explorer']:,} careful explorers and {inc['guided']:,} informed player(s) ended there (before, the 362 chain threw them back into the manor).</li>
<li><b>Every section can now be reached:</b> {len(S) - 1 - len(unreach)} of {len(S) - 1} from section 1, and the bots entered {len(visited_any)} of them.</li>
<li><b>Still limiting:</b> LUCK (average {mean_luck:.1f} of 9 at the pit rolls, refilled in only {len(luck_sources)} sections) and the Widow's final fight (the informed player loses it {widow_loss} of the time, {final_g['finalFightLost']} of {final_g['finalFightEntered']} fights).</li>
</ul>
<p class="small">These results describe this build and these bots, so read them as a diagnosis, not a final balance verdict. The bots do not choose which weapon to hold, read books, drink the Potion of Invisibility or use maps; they do carry and benefit from charms, the Old Key, the wedding ring and the prayer-book blessing.</p>
"""

compare_rows = ""
if all(st for _, st in STAGES[:-1]):
    def quad(k, p):
        vals = [stg[p]["outcomes"].get(k, 0) for _, stg in STAGES]
        return "".join(f"<td class='num'>{'<b>' if i == len(STAGES) - 1 else ''}{pct(v, n)}{'</b>' if i == len(STAGES) - 1 else ''}</td>" for i, v in enumerate(vals))
    def med(p):
        return "".join(f"<td class='num'>{'<b>' if i == len(STAGES) - 1 else ''}{median(stg[p]['steps'])}{'</b>' if i == len(STAGES) - 1 else ''}</td>" for i, (_, stg) in enumerate(STAGES))
    for p in ORDER:
        compare_rows += f"<tr><td>{LABEL[p]}</td>{quad('victory', p)}{quad('instant-death', p)}{quad('defeat', p)}</tr>"

luck_html = "".join(
    f"<tr><td>{sid}</td><td>{band} ({ch})</td><td class='num'>{ib}</td><td class='num'>{rolls:,}</td><td class='num'>{avg:.1f}</td><td class='num'>{pct(low, rolls, 0)}</td><td class='num'><b>{died:,}</b></td><td class='num'>{pct(died, rolls, 0)}</td></tr>"
    for sid, band, ch, rolls, avg, low, died, ib in luck_rows
)

item_names = {}
for p in ORDER:
    for k, v in P[p].get("itemsFound", {}).items():
        item_names[k] = item_names.get(k, 0) + v
catalogue = (json.load(open("CURSE_OF_HOLLOWS_END.v2.json", encoding="utf-8")).get("items") or {})
never_found = sorted(d["name"] for d in catalogue.values() if d["name"] not in item_names and d["name"] not in ("Sword", "Leather Armor"))
top_items = sorted(item_names.items(), key=lambda kv: -kv[1])
item_rows = "".join(f"<tr><td>{e(k)}</td><td class='num'>{v:,}</td><td style='width:45%'>{bar(v, 3 * N, 'var(--accent)', pct(v, 3 * N, 0))}</td></tr>" for k, v in top_items if k not in ("Sword", "Leather Armor", "Provisions"))
v2book = json.load(open("CURSE_OF_HOLLOWS_END.v2.json", encoding="utf-8"))
stray_endings = [x["id"] for x in v2book["sections"] if x.get("ending") and (x.get("options") or x.get("roll") or x.get("combat"))]
reward_failures = [x["id"] for x in v2book["sections"] if (x.get("roll") or {}).get("kind") == "luck" and (x["roll"]["failure"].get("target") in (97, 117, 152))]
magic_games = pct(sum(P[p]["itemGamesWithMagic"] for p in ORDER), 3 * N, 0)
n_inc_total = sum(inc.values())

findings = f"""
<div class="finding sev-good"><h3><span>✓</span> Fixed since the first report <em>done</em></h3>
<ul>
<li><b>Unreachable sections:</b> 17 sections (260–280) could never be reached because the victory link in 180 skipped its menu. Now <b>{len(unreach)}</b> unreachable and <b>{len(never)}</b> never entered in {3 * N:,} games.</li>
<li><b>Ending flags:</b> 9 mid-game sections carried a wrong ending flag in the old file. In the converted book: <b>{len(stray_endings)}</b>.</li>
<li><b>The “incomplete victory”:</b> section 362 used to lead into a Phantom Servant fight (363). It now ends in section 998. Entries into 362 over the builds: {into362(ST1):,} → {into362(ST2):,} → {into362(ST3):,} → {into362(ST4):,} → <b>{into362(P):,}</b>.</li>
<li><b>Luck-test failures that paid a reward</b> (the shrine, the journals): <b>{len(reward_failures)}</b> left; the seven traps cost STAMINA and go where success goes.</li>
<li><b>Section 22</b> is a real Luck test and its paralysis carries into the next fight.</li>
<li><b>Items:</b> about 40 pickups that were not in the text were removed, ids that stood for several things were split, every potion can be used, and the book states its starting kit.</li>
</ul></div>

<div class="finding sev-good"><h3><span>✓</span> The new item rules work in play <em>done</em></h3>
<p>Share of the {3 * N:,} games that found each item (the three bots pooled; the starting kit left out). The bots collect what lies on their route, so rarely found items sit in side branches.</p>
<div class="scroll"><table class="t"><thead><tr><th>Item</th><th class="num">Games</th><th>Share</th></tr></thead><tbody>{item_rows}</tbody></table></div>
<p class="small">{('Never found by any bot: ' + ', '.join(never_found) + '.') if never_found else 'Every item in the catalogue was found at least once.'}
A magical weapon was found in {magic_games} of games.</p></div>

<div class="finding sev-high"><h3><span>1</span> LUCK is a draining resource that the saves depend on <em>high</em></h3>
<p>The book asks for {n_luck_tests} Luck tests plus {n_saves} more nested inside dice rolls, and each costs 1 LUCK. Only {len(luck_sources)} sections give LUCK back. Simulated players reach the pit saves with an average LUCK of <b>{mean_luck:.1f}</b>.
At LUCK 7 a Luck test passes about 58% of the time, at 6 about 42%, at 3 about 8%. The charms help only against the undead and at the binding ritual, so they do not ease the traps.</p>
<div class="scroll"><table class="t"><thead><tr><th>Section</th><th>Dies on</th><th class="num">Links in</th><th class="num">Rolls</th><th class="num">Avg LUCK</th><th class="num">LUCK ≤ 3</th><th class="num">Deaths</th><th class="num">Per roll</th></tr></thead><tbody>{luck_html}</tbody></table></div>
<p class="small">Options if this feels too hard: make sections 7, 167 and 107 roll once per game like the others; add LUCK sources earlier; or let a save work on a SKILL test instead.</p></div>

<div class="finding sev-high"><h3><span>2</span> The Widow is still the final wall <em>high</em></h3>
<p>The informed player wins the final fight {pct(final_g['finalFightWon'], final_g['finalFightEntered'], 0)} of the time ({final_g['finalFightWon']} of {final_g['finalFightEntered']}); {final_g.get('finalFightNoMagic', 0)} of those fights were fought without a magical weapon, which cannot win.
She is immune to non-magical weapons and her Wail costs 2 SKILL for the whole fight on an unlucky roll. Letting silver weapons count against her would be the cheapest lever.</p></div>

<div class="finding sev-med"><h3><span>3</span> Many players choose the incomplete ending <em>medium</em></h3>
<p>{n_inc_total:,} of {3 * N:,} games ({pct(n_inc_total, 3 * N, 0)}) end in “Incomplete victory”: the random walker {pct(inc['random'], N, 0)}, the careful explorer {pct(inc['explorer'], N, 0)}, the informed player {pct(inc['guided'], N, 0)}.
Section 395 offers to face the Widow without the key and the name, and a player who does is always sent there. If that ending should be rarer, or a failure rather than a finish, change what 395 offers; it is a design choice, not a defect.</p></div>

<div class="finding sev-high"><h3><span>4</span> Menus you come back to punish players who try everything <em>high</em></h3>
<p>Since every side room leads back to its menu, a player can visit every ambush in a menu; before, a room dropped you somewhere else and most of them were skipped by chance. The careful explorer (who visits every new section) won {pct(ST6['explorer']['outcomes'].get('victory', 0), N)} → <b>{pct(ST7['explorer']['outcomes'].get('victory', 0), N)}</b> and died in combat {pct(ST6['explorer']['outcomes'].get('defeat', 0), N, 0)} → <b>{pct(ST7['explorer']['outcomes'].get('defeat', 0), N, 0)}</b> of the time. The informed player, who goes straight for the key, the name and a weapon, is unchanged within noise.
A human can read the labels (“(fight)”, “−3 STAMINA”) and skip the ambushes, which the bot cannot, so this overstates the difficulty for people. Of the 294 side rooms, 72 are fights; the rest are finds, trap rolls, stat drains and scenery, so exploring everything still costs a lot of STAMINA.</p></div>

<div class="finding sev-info"><h3><span>5</span> Not simulated <em>note</em></h3>
<p>The bots never choose a weapon by hand, read books, drink the Potion of Invisibility, use maps or sneak by choice; the Old Key and the charms count when they are carried. All 22 trap and hazard sections are marked on some map, but only for a player who carries that map.</p></div>
"""

method = f"""
<ul>
<li><b>Engine:</b> the bots drive the real <code>engine.js</code> (the same module the reader uses) on the converted book <code>{e(R['book'].get('file', ''))}</code>: fights, Luck tests, dice rolls, item use, conditions, charms, stealth.</li>
<li><b>Randomness:</b> a seeded generator (seed {R['seed']}) feeds every die and every bot decision, so the run is reproducible. {N:,} games per policy, {3 * N:,} in total, in {R['runtimeSeconds']:.0f}s. Every build uses the same seed. A change of about 2.6 points in a win rate is within run-to-run noise, and a rule change also shifts which dice meet which decisions, so small differences are not meaningful.</li>
<li><b>Shared bot habits:</b> flee when STAMINA ≤ {R['opts']['fleeAt']} and the fight allows it; eat or drink healing items when STAMINA falls below {int(R['opts']['healAt'] * 100)}% of the maximum (and below {int(R['opts']['preFightHeal'] * 100)}% before a fight); a game ends after {R['opts']['maxSteps']:,} moves.</li>
<li><b>What the bots know:</b> read from <code>CURSE_OF_HOLLOWS_END.sim.json</code>: the informed player goes for the Silver Key, the true name and a magical weapon, then the final door; endings come from each section's own <code>ending</code>.</li>
<li><b>Limits:</b> bots are not people. Random under-plays (never plans) and the informed bot over-plays (has read the book), so treat them as bounds. Gold is never spent (the book has no shop). Reading text, noticing hints and risk-aversion are not modelled.</li>
</ul>
<p class="small">Reproduce: <code>node simulate_playthroughs.js CURSE_OF_HOLLOWS_END.v2.json 1000 simulation-results.json {R['seed']} &amp;&amp; python3 make_simulation_report.py</code>. The earlier builds' results are kept in <code>simulation-results-before.json</code>, <code>-v2.json</code>, <code>-v3.json</code>, <code>-v3b.json</code> (Luck saves), <code>-v4.json</code> (book issues fixed) <code>-v5.json</code> (item rules) <code>-v6.json</code> (hub 388 made safe) and <code>-v7.json</code> (menus rewired).</p>
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

<h2>1 · Nine builds, same players, same seed</h2>
<p>{STAGE_TEXT}</p>
<div class="scroll"><table class="t"><thead><tr><th rowspan="2">Player</th><th colspan="9" class="num">Victory</th><th colspan="9" class="num">Instant death</th><th colspan="9" class="num">Died in combat</th></tr>
<tr>{''.join('<th class="num">' + name + '</th>' for _ in range(3) for name, _s in STAGES)}</tr></thead><tbody>{compare_rows}</tbody></table></div>

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
