#!/usr/bin/env python3
"""Draws a book as a network: every section a node, every choice, roll result and fight outcome a link.

Usage: python3 make_book_map.py [book.v2.json] [out.html]

Writes one self-contained HTML page (no libraries, no network): a force-directed graph you can pan, zoom, drag and search,
coloured by what happens in a section (or by area), with a click-to-read panel, a "route from the start" and a
neighbourhood focus. Works for any book in format v2.
"""
import html
import json
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "CURSE_OF_HOLLOWS_END.v2.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "book-map.html"

book = json.load(open(SRC, encoding="utf-8"))
catalogue = book.get("items") or {}
sections = {s["id"]: s for s in book["sections"]}


def item_name(ref):
    iid = ref if isinstance(ref, str) else ref["id"]
    qty = 1 if isinstance(ref, str) else ref.get("qty", 1)
    name = (catalogue.get(iid) or {}).get("name") or (ref.get("name") if isinstance(ref, dict) else None) or iid
    return f"{name} ×{qty}" if qty > 1 else name


def enemies(s):
    c = s.get("combat")
    return [e["enemyName"] for e in (c if isinstance(c, list) else [c] if c else [])]


def is_group(s):
    c = s.get("combat")
    return isinstance(c, list) and len(c) > 1 and all(e.get("together") for e in c)


def effects_of(s):
    out = [s.get("effects")]
    return [e for e in out if e]


def links_of(s):
    """(target, kind, label) for everything that can lead out of a section."""
    out = []
    for o in s.get("options") or []:
        out.append((o["target"], "option", o["label"]))
    r = s.get("roll")
    if r:
        for side in ("success", "failure"):
            t = (r.get(side) or {}).get("target")
            if t is not None:
                out.append((t, side, (r.get("label") or "Test your Luck") + (": lucky" if side == "success" else ": unlucky")))
        for oc in r.get("outcomes") or []:
            rng = f"{oc['min']}" if oc["min"] == oc["max"] else f"{oc['min']}–{oc['max']}"
            if oc.get("target") is not None:
                out.append((oc["target"], "dice", f"Roll {rng}"))
            for side in ("success", "failure"):
                t = ((oc.get("luck") or {}).get(side) or {}).get("target")
                if t is not None:
                    out.append((t, side, f"Roll {rng}, then a Luck save: " + ("lucky" if side == "success" else "unlucky")))
    c = s.get("combat")
    for e in (c if isinstance(c, list) else [c] if c else []):
        if e.get("onVictorySection") is not None:
            out.append((e["onVictorySection"], "win", f"Win against {e['enemyName']}"))
        if e.get("onDefeatSection") is not None:
            out.append((e["onDefeatSection"], "lose", f"Lose to {e['enemyName']}"))
        if e.get("fleeSection") is not None:
            out.append((e["fleeSection"], "flee", f"Flee from {e['enemyName']}"))
        if e.get("onTimeoutSection") is not None:
            out.append((e["onTimeoutSection"], "lose", f"Out of time against {e['enemyName']}"))
    return out


nodes, edges, seen_edges = [], [], set()
for sid, s in sections.items():
    for t, kind, label in links_of(s):
        if t not in sections or t == sid:
            continue
        key = (sid, t, kind)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        edges.append({"s": sid, "t": t, "k": kind, "l": label})
out_deg = {sid: 0 for sid in sections}
in_deg = {sid: 0 for sid in sections}
for ed in edges:
    out_deg[ed["s"]] += 1
    in_deg[ed["t"]] += 1

start = book["startingSection"]
# a "zone" for every section: the hub (a section with many choices) it lies closest to; used to colour and group when the book has no areas
from collections import deque
adj = {sid: set() for sid in sections}
for ed in edges:
    adj[ed["s"]].add(ed["t"])
    adj[ed["t"]].add(ed["s"])
hubs = sorted((sid for sid in sections if out_deg[sid] >= 8), key=lambda i: -out_deg[i])
zone = {}
q = deque()
for h in hubs:
    zone[h] = h
    q.append(h)
while q:
    a = q.popleft()
    for b in sorted(adj[a]):
        if b not in zone and not (out_deg[b] >= 8):
            zone[b] = zone[a]
            q.append(b)
for sid, s in sections.items():
    r = s.get("roll")
    if s.get("ending"):
        kind = "end-" + s["ending"]["type"]
    elif sid == start:
        kind = "start"
    elif s.get("combat"):
        kind = "combat"
    elif r:
        kind = "luck" if r.get("kind") == "luck" else "dice"
    elif out_deg[sid] >= 8:
        kind = "hub"
    elif (s.get("effects") or {}).get("addItems") or (s.get("effects") or {}).get("gold"):
        kind = "item"
    else:
        kind = "story"
    text = re.sub(r"\{\{(opt:[a-z0-9-]+|roll)\}\}", "", s["text"])
    text = re.sub(r"\s+", " ", text).strip()
    fx = s.get("effects") or {}
    gives = [item_name(i) for i in fx.get("addItems") or []] + ([f"{fx['gold']} gold"] if fx.get("gold") else [])
    nodes.append({
        "id": sid, "kind": kind, "title": s.get("title") or "", "text": text[:420], "out": out_deg[sid], "in": in_deg[sid],
        "area": s.get("area") or "", "tags": s.get("tags") or [], "gives": gives, "foes": enemies(s),
        "stealth": bool(r and r.get("stealth")), "zone": zone.get(sid, 0), "group": is_group(s),
    })

data = {"title": book["title"], "start": start, "nodes": nodes, "edges": edges}
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__ — map</title>
<style>
:root{--bg:#0b0d14;--panel:#12151f;--line:#232838;--fg:#e6e9f2;--muted:#9aa3b8;--accent:#8ab4ff}
*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
#stage{position:fixed;inset:0}canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}canvas.drag{cursor:grabbing}
.bar{position:fixed;left:12px;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;pointer-events:none}
.bar>*{pointer-events:auto}
.box{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:10px;padding:8px 12px;backdrop-filter:blur(6px)}
h1{font-size:15px;margin:0;font-weight:650}
input[type=search]{background:#0b0d14;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;min-width:200px}
button,select{background:#171b28;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;min-height:34px}
button:hover{border-color:var(--accent)}button[aria-pressed=true]{background:#1f2a4a;border-color:var(--accent)}
label.chk{display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:var(--muted)}
#legend{position:fixed;left:12px;bottom:12px;max-width:260px;font-size:12px}
#legend div{display:flex;align-items:center;gap:8px;margin:2px 0;color:var(--muted)}#legend i{width:11px;height:11px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor}
#panel{position:fixed;right:12px;top:64px;bottom:12px;width:min(360px,calc(100vw - 24px));overflow:auto;display:none}
#panel h2{margin:0 0 2px;font-size:18px}#panel .sub{color:var(--muted);margin-bottom:8px}
#panel p{margin:.5em 0}#panel .exits button{display:block;width:100%;text-align:left;margin:3px 0;font-size:13px}
#panel .exits small{color:var(--muted)}#panel h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 4px}
#tip{position:fixed;pointer-events:none;display:none;max-width:300px;z-index:5;font-size:12.5px}
#results{position:absolute;top:100%;left:0;right:0;margin-top:4px;max-height:260px;overflow:auto;display:none;z-index:6}
#results button{display:block;width:100%;text-align:left;border:0;border-radius:0;background:transparent}
.searchwrap{position:relative}
#stats{color:var(--muted);font-size:12px}
@media (max-width:700px){#legend{display:none}#panel{top:auto;height:46vh}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style></head><body>
<div id="stage"><canvas id="c" role="img" aria-label="Network map of the book: sections as nodes, choices as links. Use the search box to find a section."></canvas></div>
<div class="bar">
  <div class="box"><h1>__TITLE__</h1><div id="stats"></div></div>
  <div class="box searchwrap"><input id="q" type="search" placeholder="Find a section (number or words)" aria-label="Find a section" autocomplete="off"><div id="results" class="box" role="listbox"></div></div>
  <div class="box"><label class="chk">Colour <select id="mode" aria-label="Colour nodes by"><option value="kind">by what happens</option><option value="area">by area</option><option value="zone">by nearest hub</option></select></label></div>
  <div class="box">
    <label class="chk"><input type="checkbox" id="hideDeath"> hide links into endings</label>
    <label class="chk"><input type="checkbox" id="labels"> always show numbers</label>
    <label class="chk"><input type="checkbox" id="cluster"> group by area or hub</label>
  </div>
  <div class="box"><button id="fit">Fit</button> <button id="reheat" title="Shake the layout">Re-layout</button> <button id="route" aria-pressed="false" title="Show the shortest route from the start to the selected section">Route from start</button> <label class="chk">Focus <select id="focus" aria-label="Show only the neighbourhood of the selection"><option value="0">off</option><option value="1">1 step</option><option value="2">2 steps</option><option value="3">3 steps</option></select></label></div>
</div>
<div id="legend" class="box"></div>
<aside id="panel" class="box" aria-live="polite"></aside>
<div id="tip" class="box"></div>
<p class="sr" id="summary"></p>
<script>
const DATA = __DATA__;
(() => {
'use strict';
const KIND = {
  start:{c:'#ffd166',n:'Start'}, 'end-victory':{c:'#3ddc97',n:'Ending: victory'}, 'end-defeat':{c:'#ff5d73',n:'Ending: defeat'}, 'end-neutral':{c:'#f4a259',n:'Ending: other'},
  combat:{c:'#ff8f5a',n:'Fight'}, luck:{c:'#6ec1ff',n:'Luck test'}, dice:{c:'#a78bfa',n:'Dice roll'}, hub:{c:'#f2f4fa',n:'Hub (many choices)'}, item:{c:'#c792ea',n:'Finds something'}, story:{c:'#6f819e',n:'Story'}
};
const EDGE = { option:'#7f8ba8', success:'#3ddc97', failure:'#ff9f5a', dice:'#a78bfa', win:'#ffd166', lose:'#ff5d73', flee:'#6ec1ff' };
const AREAS = [...new Set(DATA.nodes.map(n => n.area).filter(Boolean))].sort();
const AREA_COL = ['#6ec1ff','#ffd166','#3ddc97','#ff8f5a','#c792ea','#ff5d73','#9ad1d4','#f4a259'];
const areaColor = a => a ? AREA_COL[AREAS.indexOf(a) % AREA_COL.length] : '#6f819e';
const ZONES = [...new Set(DATA.nodes.map(n => n.zone).filter(Boolean))];
const zoneColor = z => z ? AREA_COL[ZONES.indexOf(z) % AREA_COL.length] : '#6f819e';

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const N = DATA.nodes.map((n, i) => Object.assign({ i, x: 0, y: 0, vx: 0, vy: 0, fixed: false }, n));
const byId = new Map(N.map(n => [n.id, n]));
const E = DATA.edges.map(e => ({ s: byId.get(e.s), t: byId.get(e.t), k: e.k, l: e.l }));
const outs = new Map(N.map(n => [n.id, []])), ins = new Map(N.map(n => [n.id, []]));
E.forEach(e => { outs.get(e.s.id).push(e); ins.get(e.t.id).push(e); });
const radius = n => 3 + Math.min(14, Math.sqrt(n.out + n.in) * 1.5) + (n.kind === 'start' ? 4 : 0);
N.forEach(n => n.r = radius(n));

// ---- initial positions: rings by distance from the start, so the layout begins sensible
const dist = new Map([[DATA.start, 0]]); const q = [DATA.start];
while (q.length) { const a = q.shift(); for (const e of outs.get(a)) if (!dist.has(e.t.id)) { dist.set(e.t.id, dist.get(a) + 1); q.push(e.t.id); } }
const parent = new Map(); { const seen = new Set([DATA.start]); const qq = [DATA.start]; while (qq.length) { const a = qq.shift(); for (const e of outs.get(a)) if (!seen.has(e.t.id)) { seen.add(e.t.id); parent.set(e.t.id, { from: a, edge: e }); qq.push(e.t.id); } } }
N.forEach((n, i) => { const d = dist.has(n.id) ? dist.get(n.id) : 8; const a = i * 2.399963; n.x = Math.cos(a) * (60 + d * 70); n.y = Math.sin(a) * (60 + d * 70); });

// ---- forces
const groupOf = n => n.area || (n.zone ? 'z' + n.zone : '');
const GROUPS = [...new Set(DATA.nodes.map(groupOf).filter(Boolean))];
const areaCentre = new Map(GROUPS.map((a, i) => [a, { x: Math.cos(i / GROUPS.length * 6.2832) * 620, y: Math.sin(i / GROUPS.length * 6.2832) * 620 }]));
let alpha = 1, hideDeath = false, cluster = false;
const isEnd = n => n.kind.startsWith('end-');
function tick() {
  const k = alpha;
  for (let i = 0; i < N.length; i++) {
    const a = N[i];
    for (let j = i + 1; j < N.length; j++) {
      const b = N[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 > 490000) continue;
      if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
      const d = Math.sqrt(d2), f = (1500 * k) / d2, fx = dx / d * f, fy = dy / d * f;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }
  for (const e of E) {
    if (hideDeath && isEnd(e.t)) continue;
    const a = e.s, b = e.t; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const hubby = (a.out > 12 || b.in > 12) ? 0.25 : 1;                // the big hubs pull weakly, so they do not crush the layout
    const f = (d - 46) * 0.018 * hubby * k, fx = dx / d * f, fy = dy / d * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  for (const n of N) {
    n.vx -= n.x * 0.0009 * k; n.vy -= n.y * 0.0009 * k;
    if (cluster && groupOf(n)) { const c = areaCentre.get(groupOf(n)); n.vx += (c.x - n.x) * 0.006 * k; n.vy += (c.y - n.y) * 0.006 * k; }
    if (n.fixed) { n.vx = n.vy = 0; continue; }
    n.vx *= 0.78; n.vy *= 0.78; n.x += n.vx; n.y += n.vy;
  }
  alpha = Math.max(0.012, alpha * 0.992);
}

// ---- view
let W = 0, H = 0, dpr = 1, zoom = 1, ox = 0, oy = 0;
function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
const toScreen = n => [n.x * zoom + ox, n.y * zoom + oy];
function fit() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of N) { if ((!dist.has(n.id) && n.out + n.in === 0) || (hideDeath && isEnd(n))) continue; x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  zoom = Math.min(W / (x1 - x0 + 160), (H - 90) / (y1 - y0 + 160)); ox = W / 2 - (x0 + x1) / 2 * zoom; oy = H / 2 + 30 - (y0 + y1) / 2 * zoom;
}

// ---- state: selection, hover, route, focus
let sel = null, hov = null, routeOn = false, focusN = 0, mode = 'kind', showLabels = false;
let routeSet = new Set(), routeEdges = new Set(), focusSet = null;
function neighbourhood(n, hops) {
  const s = new Set([n.id]); let frontier = [n.id];
  for (let h = 0; h < hops; h++) { const next = []; for (const id of frontier) { for (const e of outs.get(id)) if (!s.has(e.t.id)) { s.add(e.t.id); next.push(e.t.id); } for (const e of ins.get(id)) if (!s.has(e.s.id)) { s.add(e.s.id); next.push(e.s.id); } } frontier = next; }
  return s;
}
function recompute() {
  routeSet = new Set(); routeEdges = new Set();
  if (routeOn && sel && parent.has(sel.id) || (routeOn && sel && sel.id === DATA.start)) {
    let cur = sel.id; routeSet.add(cur);
    while (parent.has(cur)) { const p = parent.get(cur); routeEdges.add(p.edge); routeSet.add(p.from); cur = p.from; }
  }
  focusSet = (focusN > 0 && sel) ? neighbourhood(sel, focusN) : null;
}
const visible = n => !focusSet || focusSet.has(n.id);
const colour = n => mode === 'area' ? areaColor(n.area) : mode === 'zone' ? zoneColor(n.zone) : KIND[n.kind].c;

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, '#10131f'); g.addColorStop(1, '#07080d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const hl = sel || hov; const near = new Set(); if (hl) { near.add(hl.id); outs.get(hl.id).forEach(e => near.add(e.t.id)); ins.get(hl.id).forEach(e => near.add(e.s.id)); }
  const dim = !!hl || routeSet.size > 0;
  // links
  for (const e of E) {
    if (!visible(e.s) || !visible(e.t) || (hideDeath && isEnd(e.t))) continue;
    const [x1, y1] = toScreen(e.s), [x2, y2] = toScreen(e.t);
    if ((x1 < -50 && x2 < -50) || (x1 > W + 50 && x2 > W + 50) || (y1 < -50 && y2 < -50) || (y1 > H + 50 && y2 > H + 50)) continue;
    const onRoute = routeEdges.has(e), touches = hl && (e.s === hl || e.t === hl);
    const col = EDGE[e.k];
    ctx.strokeStyle = col; ctx.globalAlpha = onRoute ? 1 : touches ? 0.95 : dim ? 0.05 : (e.k === 'option' ? 0.16 : 0.34);
    ctx.lineWidth = onRoute ? 3 : touches ? 1.6 : 0.8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if ((touches || onRoute || zoom > 1.6) && ctx.globalAlpha > 0.2) {                // arrow heads when it is readable
      const a = Math.atan2(y2 - y1, x2 - x1), r = e.t.r * zoom + 2, ax = x2 - Math.cos(a) * r, ay = y2 - Math.sin(a) * r, s = 5 + (touches ? 2 : 0);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - Math.cos(a - .45) * s, ay - Math.sin(a - .45) * s); ctx.lineTo(ax - Math.cos(a + .45) * s, ay - Math.sin(a + .45) * s); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // nodes
  for (const n of N) {
    if (!visible(n)) continue;
    const [x, y] = toScreen(n); if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
    const lit = !dim || near.has(n.id) || routeSet.has(n.id), c = colour(n), r = Math.max(2.2, n.r * zoom * 0.8);
    ctx.globalAlpha = lit ? 1 : 0.16;
    if (lit) { ctx.shadowColor = c; ctx.shadowBlur = n === sel ? 26 : n.kind === 'hub' || n.kind === 'start' ? 16 : 9; }
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
    if (n.group) {                                       // a group fight: a dashed outer ring
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    }
    if (n.stealth) { ctx.strokeStyle = '#0b0d14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * .45, 0, 6.2832); ctx.stroke(); }
    if (n === sel || n === hov) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 6.2832); ctx.stroke(); }
    if (lit && (showLabels ? zoom > 0.55 : (zoom > 1.5 || n === sel || n === hov || (hl && near.has(n.id)) || routeSet.has(n.id) || n.kind === 'start' || (n.kind === 'hub' && zoom > 0.7)))) {
      ctx.globalAlpha = lit ? 0.95 : 0.2; ctx.fillStyle = '#e6e9f2'; ctx.font = `${Math.max(10, Math.min(14, 9 + zoom * 2))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(String(n.id), x, y - r - 5);
    }
    ctx.globalAlpha = 1;
  }
}

// ---- loop
let running = true;
function frame() { if (alpha > 0.013 || dragging) for (let i = 0; i < 2; i++) tick(); draw(); requestAnimationFrame(frame); }
function hit(px, py) { let best = null, bd = 1e9; for (const n of N) { if (!visible(n)) continue; const [x, y] = toScreen(n); const d = Math.hypot(x - px, y - py); if (d < Math.max(9, n.r * zoom) && d < bd) { best = n; bd = d; } } return best; }

// ---- pointer: pan, drag a node, zoom, select
let dragging = null, panning = false, moved = 0, lastX = 0, lastY = 0; const pts = new Map(); let pinch = 0;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; lastX = e.clientX; lastY = e.clientY;
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); dragging = null; panning = false; return; }
  const n = hit(e.clientX, e.clientY); if (n) { dragging = n; n.fixed = true; } else { panning = true; cv.classList.add('drag'); }
});
cv.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; return; }
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  if (dragging) { dragging.x += dx / zoom; dragging.y += dy / zoom; alpha = Math.max(alpha, 0.3); }
  else if (panning) { ox += dx; oy += dy; }
  else { const n = hit(e.clientX, e.clientY); if (n !== hov) { hov = n; cv.style.cursor = n ? 'pointer' : 'grab'; showTip(n, e); } else if (n) moveTip(e); }
});
cv.addEventListener('pointerup', e => {
  pts.delete(e.pointerId); pinch = 0;
  if (dragging) { dragging.fixed = false; if (moved < 5) select(dragging); dragging = null; }
  else if (panning && moved < 5) select(null);
  panning = false; cv.classList.remove('drag');
});
cv.addEventListener('pointerleave', () => { hov = null; hideTip(); });
function zoomAt(px, py, f) { const nz = Math.max(0.12, Math.min(8, zoom * f)); ox = px - (px - ox) * (nz / zoom); oy = py - (py - oy) * (nz / zoom); zoom = nz; }
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

// ---- tooltip and panel
const tip = $('tip'), panel = $('panel');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function showTip(n, e) { if (!n) return hideTip(); tip.innerHTML = `<b>${n.id}</b> · ${KIND[n.kind].n}${n.group ? ' (group: they attack together)' : ''}${n.title ? `<br>${esc(n.title)}` : ''}<br><span style="color:var(--muted)">${esc(n.text.slice(0, 140))}…</span>`; tip.style.display = 'block'; moveTip(e); }
function moveTip(e) { tip.style.left = Math.min(e.clientX + 14, innerWidth - 320) + 'px'; tip.style.top = Math.min(e.clientY + 14, innerHeight - 120) + 'px'; }
function hideTip() { tip.style.display = 'none'; }
function select(n) {
  sel = n; recompute();
  if (!n) { panel.style.display = 'none'; return; }
  const exits = outs.get(n.id).map(e => `<button data-go="${e.t.id}"><b>${e.t.id}</b> <small>${esc(e.k === 'option' ? '' : e.k + ' · ')}${esc(e.l)}</small></button>`).join('') || '<small>No way out (an ending).</small>';
  const from = [...new Set(ins.get(n.id).map(e => e.s.id))].sort((a, b) => a - b);
  panel.innerHTML = `<h2>Section ${n.id}</h2><div class="sub">${KIND[n.kind].n}${n.area ? ` · ${esc(n.area)}` : ''}${n.tags.length ? ` · ${esc(n.tags.join(', '))}` : ''}${dist.has(n.id) ? ` · ${dist.get(n.id)} step${dist.get(n.id) === 1 ? '' : 's'} from the start` : ' · not reachable from the start'}</div>
  ${n.title ? `<p><b>${esc(n.title)}</b></p>` : ''}<p>${esc(n.text)}${n.text.length >= 420 ? '…' : ''}</p>
  ${n.foes.length ? `<h3>${n.group ? 'Group fight' : 'Fight'}</h3><p>${esc(n.foes.join(', '))}${n.group ? '<br><small>They attack at the same time: you choose whom to strike, the others keep attacking you.</small>' : ''}</p>` : ''}${n.gives.length ? `<h3>You find</h3><p>${esc(n.gives.join(', '))}</p>` : ''}
  <h3>Leads to (${outs.get(n.id).length})</h3><div class="exits">${exits}</div>
  <h3>Reached from (${from.length})</h3><p>${from.map(f => `<a href="#" data-go="${f}" style="color:var(--accent)">${f}</a>`).join(', ') || '<small>nothing</small>'}</p>`;
  panel.style.display = 'block';
}
panel.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); goTo(byId.get(+b.dataset.go)); } });
function goTo(n) { if (!n) return; select(n); const [x, y] = toScreen(n); ox += W / 2 - x - (panel.style.display === 'block' && innerWidth > 700 ? 180 : 0); oy += H / 2 - y; if (zoom < 1) zoom = 1; }

// ---- search
const qEl = $('q'), res = $('results');
qEl.addEventListener('input', () => {
  const t = qEl.value.trim().toLowerCase(); if (!t) { res.style.display = 'none'; return; }
  const hits = N.filter(n => String(n.id) === t || String(n.id).startsWith(t) && /^\d+$/.test(t) || (n.title + ' ' + n.text + ' ' + n.gives.join(' ') + ' ' + n.foes.join(' ')).toLowerCase().includes(t)).slice(0, 14);
  res.innerHTML = hits.map(n => `<button data-go="${n.id}"><b>${n.id}</b> <small>${esc((n.title || n.text).slice(0, 60))}</small></button>`).join('') || '<button disabled>Nothing found</button>';
  res.style.display = 'block';
});
res.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { goTo(byId.get(+b.dataset.go)); res.style.display = 'none'; qEl.value = ''; } });
qEl.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = res.querySelector('[data-go]'); if (b) b.click(); } if (e.key === 'Escape') { res.style.display = 'none'; } });
document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== qEl) { e.preventDefault(); qEl.focus(); } if (e.key === 'Escape' && document.activeElement !== qEl) select(null); });

// ---- controls
$('fit').onclick = fit;
$('reheat').onclick = () => { N.forEach(n => { n.x += (Math.random() - .5) * 60; n.y += (Math.random() - .5) * 60; }); alpha = 1; };
$('route').onclick = e => { routeOn = !routeOn; e.target.setAttribute('aria-pressed', routeOn); recompute(); };
$('focus').onchange = e => { focusN = +e.target.value; recompute(); };
$('mode').onchange = e => { mode = e.target.value; legend(); };
$('hideDeath').onchange = e => { hideDeath = e.target.checked; alpha = Math.max(alpha, .4); fit(); };
$('labels').onchange = e => { showLabels = e.target.checked; };
$('cluster').onchange = e => { cluster = e.target.checked; alpha = 1; };
function legend() {
  const used = [...new Set(N.map(n => n.kind))];
  const rows = mode === 'kind' ? used.map(k => `<div><i style="color:${KIND[k].c};background:${KIND[k].c}"></i>${KIND[k].n} <span>(${N.filter(n => n.kind === k).length})</span></div>`)
    : mode === 'zone' ? ZONES.map(z => `<div><i style="color:${zoneColor(z)};background:${zoneColor(z)}"></i>around section ${z} <span>(${N.filter(n => n.zone === z).length})</span></div>`)
    : AREAS.map(a => `<div><i style="color:${areaColor(a)};background:${areaColor(a)}"></i>${esc(a)} <span>(${N.filter(n => n.area === a).length})</span></div>`).concat(`<div><i style="color:#6f819e;background:#6f819e"></i>no area</div>`);
  const edges = Object.entries({ option: 'choice', success: 'lucky', failure: 'unlucky', dice: 'dice result', win: 'win a fight', lose: 'lose a fight', flee: 'flee' }).map(([k, v]) => `<span style="color:${EDGE[k]}">━ ${v}</span>`).join(' ');
  const groups = N.filter(n => n.group).length;
  if (groups && mode === 'kind') rows.push(`<div><i style="background:transparent;border:2px dashed ${KIND.combat.c};color:${KIND.combat.c};box-shadow:none"></i>Group fight, they attack together <span>(${groups})</span></div>`);
  $('legend').innerHTML = rows.join('') + `<div style="display:block;margin-top:6px;line-height:1.7">${edges}</div>`;
}
$('stats').textContent = `${N.length} sections · ${E.length} links · ${N.filter(n => !dist.has(n.id)).length} unreachable${N.some(n => n.group) ? ` · ${N.filter(n => n.group).length} group fights` : ''}`;
$('summary').textContent = `A network of ${N.length} sections and ${E.length} links. Use the search box to find a section by number or words; selecting one lists where it leads and where it is reached from.`;
legend(); resize(); for (let i = 0; i < 420; i++) tick(); fit(); addEventListener('resize', () => { resize(); });
window.__map = { nodes: N.length, edges: E.length, select: id => goTo(byId.get(id)), state: () => ({ zoom, sel: sel && sel.id, route: routeSet.size, focus: focusSet && focusSet.size }) };
frame();
})();
</script></body></html>
"""

page = PAGE.replace("__TITLE__", html.escape(book["title"])).replace("__DATA__", payload)
open(OUT, "w", encoding="utf-8").write(page)
kinds = {}
for n in nodes:
    kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1
print(f"wrote {OUT}: {len(nodes)} sections, {len(edges)} links, {len(page) // 1024} KB", kinds)
