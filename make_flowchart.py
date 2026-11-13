#!/usr/bin/env python3
"""Draws a book as a flowchart: the beginning at the top, every section a box, every option an arrow, in layers by how many choices it takes to get there.

Usage: python3 make_flowchart.py [book.v2.json] [out.html]

One self-contained page (no libraries, no network): pan, zoom, search, click a box to read the section and follow its exits,
hover to light up everything that leads to and from it, "route from the start", a focus mode, and a switch for the arrows that
lead back to an earlier layer (hidden at first: they are the "back to the menu" links and would hide the flow).
"""
import html
import json
import sys
from collections import deque

from book_graph import build_graph

SRC = sys.argv[1] if len(sys.argv) > 1 else "CURSE_OF_HOLLOWS_END.v2.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "book-flowchart.html"

book = json.load(open(SRC, encoding="utf-8"))
graph = build_graph(book)
nodes = {n["id"]: n for n in graph["nodes"]}
edges = graph["edges"]
start = graph["start"]

# ---------------------------------------------------------------------------------------------- layers
out_adj = {i: [] for i in nodes}
for e in edges:
    out_adj[e["s"]].append(e["t"])
layer = {start: 0}
queue = deque([start])
while queue:
    a = queue.popleft()
    for b in out_adj[a]:
        if b not in layer:
            layer[b] = layer[a] + 1
            queue.append(b)
unreached = [i for i in nodes if i not in layer]
for i in unreached:                                   # the introduction (nothing leads to it) sits above the start
    layer[i] = -1 if i == 0 else max(layer.values()) + 1
for e in edges:
    ls, lt = layer[e["s"]], layer[e["t"]]
    e["c"] = "fwd" if lt > ls else ("same" if lt == ls else "back")

levels = sorted(set(layer.values()))
by_layer = {L: [i for i in nodes if layer[i] == L] for L in levels}
# neighbours that give a box its place: everything that is not a link back
up = {i: [] for i in nodes}      # boxes in earlier layers that lead here
down = {i: [] for i in nodes}    # boxes in later layers it leads to
for e in edges:
    if e["c"] == "fwd":
        down[e["s"]].append(e["t"])
        up[e["t"]].append(e["s"])

# ---------------------------------------------------------------------------------------------- order inside a layer (fewer crossings)
order = {}
seen = set()
for L in levels:
    cur = by_layer[L]
    if L == levels[0]:
        cur.sort()
    else:
        def first_parent(i):
            ps = [order[p] for p in up[i] if p in order]
            return (sum(ps) / len(ps)) if ps else 1e9
        cur.sort(key=lambda i: (first_parent(i), i))
    for k, i in enumerate(cur):
        order[i] = k / max(1, len(cur) - 1)          # position 0..1 inside the layer
for sweep in range(24):
    seq = levels[1:] if sweep % 2 == 0 else list(reversed(levels[:-1]))
    for L in seq:
        nb = up if sweep % 2 == 0 else down
        cur = by_layer[L]
        def bary(i):
            ps = [order[p] for p in nb[i]]
            return (sum(ps) / len(ps)) if ps else order[i]
        cur.sort(key=lambda i: (bary(i), order[i]))
        for k, i in enumerate(cur):
            order[i] = k / max(1, len(cur) - 1)

# ---------------------------------------------------------------------------------------------- x positions: close to the neighbours, never overlapping
SEP = 96.0
x = {}
for L in levels:
    n = len(by_layer[L])
    for k, i in enumerate(by_layer[L]):
        x[i] = (k - (n - 1) / 2) * SEP


def spread(ids, desired):
    """Keep the order of ids, keep them SEP apart, and stay as near to desired as possible (pool adjacent violators)."""
    vals = [desired[i] - k * SEP for k, i in enumerate(ids)]
    blocks = []                                           # [sum, count]
    for v in vals:
        blocks.append([v, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            b = blocks.pop(); blocks[-1][0] += b[0]; blocks[-1][1] += b[1]
    out, k = {}, 0
    for s_, c in blocks:
        m = s_ / c
        for _ in range(c):
            out[ids[k]] = m + k * SEP
            k += 1
    return out


for it in range(40):
    seq = levels[1:] if it % 2 == 0 else list(reversed(levels[:-1]))
    for L in seq:
        ids = by_layer[L]
        want = {}
        for i in ids:
            nb = (up[i] if it % 2 == 0 else down[i]) or (down[i] if it % 2 == 0 else up[i])
            want[i] = (sum(x[p] for p in nb) / len(nb)) if nb else x[i]
        x.update(spread(ids, want))
# centre the whole drawing on the start
shift = x[start]
for i in x:
    x[i] -= shift

GAP = 170
for i, n in nodes.items():
    n["x"] = round(x[i], 1)
    n["y"] = layer[i] * GAP
    n["layer"] = layer[i]
    n["ord"] = round(order[i], 4)

data = {"title": graph["title"], "start": start, "gap": GAP,
        "nodes": list(nodes.values()), "edges": edges, "layers": {str(L): len(by_layer[L]) for L in levels}}
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__ — flowchart</title>
<style>
:root{--bg:#0b0d14;--panel:#12151f;--line:#232838;--fg:#e6e9f2;--muted:#9aa3b8;--accent:#8ab4ff}
*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
svg{position:fixed;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;background:radial-gradient(ellipse at 50% 0%,#141a2c 0%,#07080d 70%)}
svg.drag{cursor:grabbing}
.bar{position:fixed;left:12px;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;pointer-events:none}.bar>*{pointer-events:auto}
.box{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:10px;padding:8px 12px;backdrop-filter:blur(6px)}
h1{font-size:15px;margin:0;font-weight:650}#stats{color:var(--muted);font-size:12px}
input[type=search]{background:#0b0d14;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;min-width:190px}
button,select{background:#171b28;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;min-height:34px}
button:hover{border-color:var(--accent)}button[aria-pressed=true]{background:#1f2a4a;border-color:var(--accent)}
label.chk{display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:var(--muted)}
.searchwrap{position:relative}#results{position:absolute;top:100%;left:0;right:0;margin-top:4px;max-height:260px;overflow:auto;display:none;z-index:6}
#results button{display:block;width:100%;text-align:left;border:0;border-radius:0;background:transparent}
#legend{position:fixed;left:12px;bottom:12px;max-width:270px;font-size:12px}
#legend div{display:flex;align-items:center;gap:8px;margin:3px 0;color:var(--muted)}#legend svg{position:static;width:22px;height:14px;background:none;flex:none;cursor:default}
#legend .edges{display:block;margin-top:6px;line-height:1.7}
#panel{position:fixed;right:12px;top:64px;bottom:12px;width:min(360px,calc(100vw - 24px));overflow:auto;display:none}
#panel h2{margin:0 0 2px;font-size:18px}#panel .sub{color:var(--muted);margin-bottom:8px}#panel p{margin:.5em 0}
#panel .exits button{display:block;width:100%;text-align:left;margin:3px 0;font-size:13px}#panel small{color:var(--muted)}
#panel h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 4px}
#tip{position:fixed;pointer-events:none;display:none;max-width:300px;z-index:5;font-size:12.5px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
/* the drawing */
.edge{fill:none;stroke-width:1.1;opacity:.32;vector-effect:non-scaling-stroke}
.edge.back{stroke-dasharray:5 4;opacity:.2}
.dimmed .edge{opacity:.05}.dimmed .node{opacity:.28}
.dimmed .edge.hi{opacity:.95;stroke-width:2}.dimmed .node.hi{opacity:1}
.node rect,.node path,.node polygon{fill:#12151f;stroke-width:1.6}
.node text{fill:#e6e9f2;text-anchor:middle;pointer-events:none}
.node .id{font:700 13px system-ui,sans-serif}.node .sub{font:10.5px system-ui,sans-serif;fill:#9aa3b8}
.node.sel rect,.node.sel path,.node.sel polygon{stroke:#fff!important;stroke-width:3}
.node{cursor:pointer}
.layerlabel{fill:#5d6784;font:12px system-ui,sans-serif}.layerline{stroke:#1b2033;stroke-width:1;stroke-dasharray:2 6;vector-effect:non-scaling-stroke}
svg:not(.zoomed) .sub{display:none}
@media (max-width:700px){#legend{display:none}#panel{top:auto;height:46vh}}
</style></head><body>
<svg id="chart" role="img" aria-label="Flowchart of the book: sections as boxes, options as arrows, from the beginning at the top. Use the search box to find a section.">
  <defs></defs><g id="world"><g id="layers"></g><g id="edges"></g><g id="nodes"></g></g>
</svg>
<div class="bar">
  <div class="box"><h1>__TITLE__</h1><div id="stats"></div></div>
  <div class="box searchwrap"><input id="q" type="search" placeholder="Find a section (number or words)" aria-label="Find a section" autocomplete="off"><div id="results" class="box" role="listbox"></div></div>
  <div class="box">
    <label class="chk"><input type="checkbox" id="back"> links that go back</label>
    <label class="chk"><input type="checkbox" id="hideEnd" checked> hide links into endings</label>
  </div>
  <div class="box"><button id="fit">Fit</button> <button id="top">Start</button> <button id="route" aria-pressed="false" title="Highlight the shortest route from the start to the selected section">Route from start</button>
    <label class="chk">Focus <select id="focus" aria-label="Show only the neighbourhood of the selection"><option value="0">off</option><option value="1">1 step</option><option value="2">2 steps</option><option value="3">3 steps</option></select></label></div>
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
  combat:{c:'#ff8f5a',n:'Fight'}, luck:{c:'#6ec1ff',n:'Luck test'}, dice:{c:'#a78bfa',n:'Dice roll'}, hub:{c:'#f2f4fa',n:'Menu (many choices)'}, item:{c:'#c792ea',n:'Finds something'}, story:{c:'#6f819e',n:'Story'}
};
const EDGE = { option:'#7f8ba8', success:'#3ddc97', failure:'#ff9f5a', dice:'#a78bfa', win:'#ffd166', lose:'#ff5d73', flee:'#6ec1ff' };
const NS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = $('chart'), world = $('world');
const N = DATA.nodes, byId = new Map(N.map(n => [n.id, n]));
const E = DATA.edges.map(e => ({ s: byId.get(e.s), t: byId.get(e.t), k: e.k, l: e.l, c: e.c }));
const outs = new Map(N.map(n => [n.id, []])), ins = new Map(N.map(n => [n.id, []]));
E.forEach(e => { outs.get(e.s.id).push(e); ins.get(e.t.id).push(e); });
const isEnd = n => n.kind.startsWith('end-');

// ---- sizes and shapes
const size = n => n.kind === 'luck' || n.kind === 'dice' ? [84, 46] : n.kind === 'combat' ? [82, 36] : n.kind === 'hub' ? [92, 34] : isEnd(n) || n.kind === 'start' ? [78, 30] : [76, 32];
function shape(n, parent) {
  const [w, h] = size(n), c = KIND[n.kind].c, hw = w / 2, hh = h / 2;
  const a = { stroke: c };
  if (n.kind === 'luck' || n.kind === 'dice') return el('polygon', Object.assign(a, { points: `0,${-hh} ${hw},0 0,${hh} ${-hw},0` }), parent);
  if (n.kind === 'combat') return el('polygon', Object.assign(a, { points: `${-hw + 10},${-hh} ${hw - 10},${-hh} ${hw},0 ${hw - 10},${hh} ${-hw + 10},${hh} ${-hw},0` }), parent);
  if (isEnd(n) || n.kind === 'start') return el('rect', Object.assign(a, { x: -hw, y: -hh, width: w, height: h, rx: hh }), parent);
  return el('rect', Object.assign(a, { x: -hw, y: -hh, width: w, height: h, rx: n.kind === 'hub' ? 4 : 7, 'stroke-width': n.kind === 'hub' ? 2.4 : 1.6 }), parent);
}

// ---- draw
const gLayers = $('layers'), gEdges = $('edges'), gNodes = $('nodes');
const ys = [...new Set(N.map(n => n.layer))].sort((a, b) => a - b);
const minX = Math.min(...N.map(n => n.x)) - 160, maxX = Math.max(...N.map(n => n.x)) + 160;
for (const L of ys) {
  const y = L * DATA.gap;
  el('line', { class: 'layerline', x1: minX, x2: maxX, y1: y, y2: y }, gLayers);
  const t = el('text', { class: 'layerlabel', x: minX + 6, y: y - 22 }, gLayers);
  t.textContent = L < 0 ? 'Introduction' : L === 0 ? 'The beginning' : `${L} choice${L > 1 ? 's' : ''} in`;
}
for (const n of N) n.g = null;
function edgePath(e) {
  const [sw, sh] = size(e.s), [tw, th] = size(e.t), s = e.s, t = e.t;
  if (e.c === 'fwd') {
    const x1 = s.x, y1 = s.y + sh / 2, x2 = t.x, y2 = t.y - th / 2, dy = Math.max(40, (y2 - y1) * 0.5);
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
  }
  if (e.c === 'same') {
    const x1 = s.x, y1 = s.y - sh / 2, x2 = t.x, y2 = t.y - th / 2, lift = 34 + Math.min(60, Math.abs(x2 - x1) / 6);
    return `M${x1},${y1} C${x1},${y1 - lift} ${x2},${y2 - lift} ${x2},${y2}`;
  }
  const side = (s.x + t.x) / 2 >= 0 ? 1 : -1, bulge = 70 + Math.min(240, Math.abs(s.y - t.y) / 5), x1 = s.x + side * sw / 2, y1 = s.y, x2 = t.x + side * tw / 2, y2 = t.y;
  const bx = Math.max(x1, x2) * (side > 0 ? 1 : 0) + Math.min(x1, x2) * (side > 0 ? 0 : 1) + side * bulge;
  return `M${x1},${y1} C${bx},${y1} ${bx},${y2} ${x2},${y2}`;
}
const defs = svg.querySelector('defs');
for (const k of Object.keys(EDGE)) el('path', { d: 'M0,0 L8,3.5 L0,7 z', fill: EDGE[k] }, el('marker', { id: 'ar-' + k, viewBox: '0 0 8 7', refX: 8, refY: 3.5, markerWidth: 7, markerHeight: 6, orient: 'auto', markerUnits: 'userSpaceOnUse' }, defs));
for (const e of E) { e.el = el('path', { class: 'edge ' + (e.c === 'back' ? 'back' : ''), d: edgePath(e), stroke: EDGE[e.k], 'marker-end': `url(#ar-${e.k})` }, gEdges); const tt = el('title', {}, e.el); tt.textContent = `${e.s.id} → ${e.t.id}: ${e.l}`; }
for (const n of N) {
  const g = el('g', { class: 'node', transform: `translate(${n.x},${n.y})`, tabindex: 0, role: 'button', 'aria-label': `Section ${n.id}, ${KIND[n.kind].n}` }, gNodes);
  const shp = shape(n, g); const [w, h] = size(n);
  if (n.group) { const hw = w / 2 + 5, hh = h / 2 + 5; el('rect', { x: -hw, y: -hh, width: hw * 2, height: hh * 2, rx: 12, fill: 'none', stroke: KIND.combat.c, 'stroke-dasharray': '3 3', 'stroke-width': 1.4 }, g); }
  if (n.rules && n.rules.length) { const st = el('polygon', { points: '0,-6 1.8,-1.8 6,0 1.8,1.8 0,6 -1.8,1.8 -6,0 -1.8,-1.8', fill: '#ffd166', stroke: '#0b0d14', 'stroke-width': 1, transform: `translate(${w / 2 - 4},${-h / 2 + 2})` }, g); }
  const id = el('text', { class: 'id', y: 5 }, g); id.textContent = n.id;
  const sub = el('text', { class: 'sub', y: h / 2 + 13 }, g); const lab = n.title || n.text; sub.textContent = lab.slice(0, 15) + (lab.length > 15 ? '…' : '');
  n.g = g; g.__n = n;
  if (n.kind === 'hub') shp.setAttribute('fill', '#1a1f30');
}

// ---- view: pan and zoom
let zoom = 1, ox = 0, oy = 0, W = innerWidth, H = innerHeight;
function apply() { world.setAttribute('transform', `translate(${ox},${oy}) scale(${zoom})`); svg.classList.toggle('zoomed', zoom > 1.25); }
function fit() { const w = maxX - minX, h = Math.max(...ys) * DATA.gap + 200; zoom = Math.min(W / w, (H - 80) / h); ox = W / 2 - ((minX + maxX) / 2) * zoom; oy = 70 + 100 * zoom - Math.min(...ys) * DATA.gap * zoom; apply(); }
function goTop() { zoom = Math.max(0.5, Math.min(0.9, W / 1500)); ox = W / 2; oy = 120; apply(); }
function zoomAt(px, py, f) { const nz = Math.max(0.05, Math.min(3, zoom * f)); ox = px - (px - ox) * (nz / zoom); oy = py - (py - oy) * (nz / zoom); zoom = nz; apply(); }
let panning = false, moved = 0, lx = 0, ly = 0, downNode = null; const pts = new Map(); let pinch = 0;
svg.addEventListener('pointerdown', e => {
  svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; lx = e.clientX; ly = e.clientY;
  downNode = e.target.closest && e.target.closest('.node');
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); panning = false; return; }
  panning = true; svg.classList.add('drag');
});
svg.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; return; }
  if (panning) { const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy); ox += dx; oy += dy; apply(); }
});
svg.addEventListener('pointerup', e => {
  pts.delete(e.pointerId); pinch = 0;
  if (panning && moved < 5) select(downNode ? downNode.__n : null);
  panning = false; svg.classList.remove('drag');
});
svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
addEventListener('resize', () => { W = innerWidth; H = innerHeight; });

// ---- what is shown: filters, focus, route
let sel = null, hov = null, routeOn = false, focusN = 0, showBack = false, hideEnd = true;
const parent = new Map(); { const seen = new Set([DATA.start]), q = [DATA.start]; while (q.length) { const a = q.shift(); for (const e of outs.get(a)) if (e.c !== 'back' && !seen.has(e.t.id)) { seen.add(e.t.id); parent.set(e.t.id, { from: a, e }); q.push(e.t.id); } } }
let routeSet = new Set(), routeEdges = new Set(), focusSet = null;
function neighbourhood(n, hops) { const s = new Set([n.id]); let f = [n.id]; for (let h = 0; h < hops; h++) { const nx = []; for (const id of f) { for (const e of outs.get(id)) if (!s.has(e.t.id)) { s.add(e.t.id); nx.push(e.t.id); } for (const e of ins.get(id)) if (!s.has(e.s.id)) { s.add(e.s.id); nx.push(e.s.id); } } f = nx; } return s; }
function recompute() {
  routeSet = new Set(); routeEdges = new Set();
  if (routeOn && sel && (parent.has(sel.id) || sel.id === DATA.start)) { let cur = sel.id; routeSet.add(cur); while (parent.has(cur)) { const p = parent.get(cur); routeEdges.add(p.e); routeSet.add(p.from); cur = p.from; } }
  focusSet = (focusN > 0 && sel) ? neighbourhood(sel, focusN) : null;
  refresh();
}
function refresh() {
  const hl = sel || hov; const near = new Set(), nearE = new Set();
  if (hl) { near.add(hl.id); outs.get(hl.id).forEach(e => { near.add(e.t.id); nearE.add(e); }); ins.get(hl.id).forEach(e => { near.add(e.s.id); nearE.add(e); }); }
  const dim = !!hl || routeSet.size > 0;
  world.classList.toggle('dimmed', dim);
  for (const e of E) {
    const hide = (e.c === 'back' && !showBack && !routeEdges.has(e) && !(hl && nearE.has(e))) || (hideEnd && isEnd(e.t) && !(hl && nearE.has(e))) || (focusSet && !(focusSet.has(e.s.id) && focusSet.has(e.t.id)));
    e.el.style.display = hide ? 'none' : '';
    e.el.classList.toggle('hi', routeEdges.has(e) || (!!hl && nearE.has(e)));
  }
  for (const n of N) { n.g.style.display = (focusSet && !focusSet.has(n.id)) ? 'none' : ''; n.g.classList.toggle('hi', near.has(n.id) || routeSet.has(n.id)); n.g.classList.toggle('sel', n === sel); }
}
gNodes.addEventListener('pointerover', e => { const g = e.target.closest('.node'); const n = g ? g.__n : null; if (n !== hov) { hov = n; refresh(); showTip(n, e); } else if (n) moveTip(e); });
gNodes.addEventListener('pointerleave', () => { hov = null; hideTip(); refresh(); });
gNodes.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(e.target.closest('.node').__n); } });

// ---- tooltip and panel
const tip = $('tip'), panel = $('panel');
function showTip(n, e) { if (!n) return hideTip(); tip.innerHTML = `<b>${n.id}</b> · ${KIND[n.kind].n}${n.group ? ' (group)' : ''}${n.rules && n.rules.length ? ` · ✦ ${n.rules.length} rule${n.rules.length > 1 ? 's' : ''}` : ''}${n.title ? `<br>${esc(n.title)}` : ''}<br><span style="color:var(--muted)">${esc(n.text.slice(0, 140))}…</span>`; tip.style.display = 'block'; moveTip(e); }
function moveTip(e) { tip.style.left = Math.min(e.clientX + 14, innerWidth - 320) + 'px'; tip.style.top = Math.min(e.clientY + 14, innerHeight - 120) + 'px'; }
function hideTip() { tip.style.display = 'none'; }
function select(n) {
  sel = n; recompute();
  if (!n) { panel.style.display = 'none'; return; }
  const exits = outs.get(n.id).map(e => `<button data-go="${e.t.id}"><b>${e.t.id}</b> <small>${esc(e.k === 'option' ? '' : e.k + ' · ')}${esc(e.l)}${e.c === 'back' ? ' · goes back' : ''}</small></button>`).join('') || '<small>No way out (an ending).</small>';
  const from = [...new Set(ins.get(n.id).map(e => e.s.id))].sort((a, b) => a - b);
  panel.innerHTML = `<h2>Section ${n.id}</h2><div class="sub">${KIND[n.kind].n} · ${n.layer < 0 ? 'the introduction' : n.layer === 0 ? 'the beginning' : `${n.layer} choice${n.layer > 1 ? 's' : ''} from the start`}${n.area ? ` · ${esc(n.area)}` : ''}</div>
  ${n.title ? `<p><b>${esc(n.title)}</b></p>` : ''}<p>${esc(n.text)}${n.text.length >= 420 ? '…' : ''}</p>
  ${n.rules && n.rules.length ? `<h3>Special rules</h3><ul style="margin:0;padding-left:1.1em">${n.rules.filter(q => q.k !== 'group').map(q => `<li>${esc(n.foes.length > 1 ? q.who + ': ' : '')}${esc(q.l)}</li>`).join('')}</ul>` : ''}
  ${n.foes.length ? `<h3>${n.group ? 'Group fight' : 'Fight'}</h3><p>${esc(n.foes.join(', '))}</p>` : ''}${n.gives.length ? `<h3>You find</h3><p>${esc(n.gives.join(', '))}</p>` : ''}
  <h3>Leads to (${outs.get(n.id).length})</h3><div class="exits">${exits}</div>
  <h3>Reached from (${from.length})</h3><p>${from.map(f => `<a href="#" data-go="${f}" style="color:var(--accent)">${f}</a>`).join(', ') || '<small>nothing</small>'}</p>`;
  panel.style.display = 'block';
}
panel.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); goTo(byId.get(+b.dataset.go)); } });
function goTo(n) { if (!n) return; select(n); const z = Math.max(zoom, 0.9); ox += (W - (innerWidth > 700 && panel.style.display === 'block' ? 380 : 0)) / 2 - (n.x * zoom + ox) - (z - zoom) * 0; oy += H / 2 - (n.y * zoom + oy); zoom = z; ox = (W - (innerWidth > 700 ? 380 : 0)) / 2 - n.x * zoom; oy = H / 2 - n.y * zoom; apply(); }

// ---- search and controls
const qEl = $('q'), res = $('results');
qEl.addEventListener('input', () => {
  const t = qEl.value.trim().toLowerCase(); if (!t) { res.style.display = 'none'; return; }
  const hits = N.filter(n => String(n.id) === t || (/^\d+$/.test(t) && String(n.id).startsWith(t)) || (n.title + ' ' + n.text + ' ' + n.gives.join(' ') + ' ' + n.foes.join(' ')).toLowerCase().includes(t)).slice(0, 14);
  res.innerHTML = hits.map(n => `<button data-go="${n.id}"><b>${n.id}</b> <small>${esc((n.title || n.text).slice(0, 60))}</small></button>`).join('') || '<button disabled>Nothing found</button>'; res.style.display = 'block';
});
res.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { goTo(byId.get(+b.dataset.go)); res.style.display = 'none'; qEl.value = ''; } });
qEl.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = res.querySelector('[data-go]'); if (b) b.click(); } if (e.key === 'Escape') res.style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== qEl) { e.preventDefault(); qEl.focus(); } if (e.key === 'Escape' && document.activeElement !== qEl) select(null); });
$('fit').onclick = fit; $('top').onclick = goTop;
$('route').onclick = e => { routeOn = !routeOn; e.target.setAttribute('aria-pressed', routeOn); recompute(); };
$('focus').onchange = e => { focusN = +e.target.value; recompute(); };
$('back').onchange = e => { showBack = e.target.checked; refresh(); };
$('hideEnd').onchange = e => { hideEnd = e.target.checked; refresh(); };
// legend with the real shapes
{
  const shapeSvg = k => { const c = KIND[k].c; const inner = k === 'luck' || k === 'dice' ? `<polygon points="11,1 21,7 11,13 1,7" fill="none" stroke="${c}" stroke-width="1.6"/>` : k === 'combat' ? `<polygon points="5,1 17,1 21,7 17,13 5,13 1,7" fill="none" stroke="${c}" stroke-width="1.6"/>` : (k.startsWith('end-') || k === 'start') ? `<rect x="1" y="1" width="20" height="12" rx="6" fill="none" stroke="${c}" stroke-width="1.6"/>` : `<rect x="1" y="1" width="20" height="12" rx="${k === 'hub' ? 2 : 4}" fill="none" stroke="${c}" stroke-width="${k === 'hub' ? 2.4 : 1.6}"/>`; return `<svg viewBox="0 0 22 14" aria-hidden="true">${inner}</svg>`; };
  const used = [...new Set(N.map(n => n.kind))];
  const edges = Object.entries({ option: 'choice', success: 'lucky', failure: 'unlucky', dice: 'dice result', win: 'win a fight', lose: 'lose a fight', flee: 'flee' }).map(([k, v]) => `<span style="color:${EDGE[k]}">━ ${v}</span>`).join(' ');
  $('legend').innerHTML = used.map(k => `<div>${shapeSvg(k)}${KIND[k].n} <span>(${N.filter(n => n.kind === k).length})</span></div>`).join('')
    + (N.some(n => n.group) ? `<div><svg viewBox="0 0 22 14" aria-hidden="true"><rect x="1" y="1" width="20" height="12" rx="4" fill="none" stroke="${KIND.combat.c}" stroke-dasharray="3 3"/></svg>Group fight</div>` : '')
    + (N.some(n => n.rules && n.rules.length) ? `<div><svg viewBox="0 0 22 14" aria-hidden="true"><polygon points="11,1 12.8,5.2 17,7 12.8,8.8 11,13 9.2,8.8 5,7 9.2,5.2" fill="#ffd166"/></svg>Fight with special rules</div>` : '')
    + `<div class="edges">${edges}<br><span style="color:#7f8ba8">╌╌ a link back to an earlier layer (off by default)</span></div>`;
}
const nBack = E.filter(e => e.c === 'back').length;
$('stats').textContent = `${N.length} sections · ${E.length} links (${nBack} go back) · ${ys.length} layers`;
$('summary').textContent = `A flowchart of ${N.length} sections and ${E.length} links, laid out in layers by the number of choices from the beginning. Use the search box to find a section; selecting one lists where it leads and where it is reached from.`;
window.__chart = { nodes: N.length, edges: E.length, layers: ys.length, select: id => goTo(byId.get(id)), state: () => ({ zoom, sel: sel && sel.id, route: routeSet.size }) };
refresh(); goTop();
})();
</script></body></html>
"""

page = PAGE.replace("__TITLE__", html.escape(book["title"])).replace("__DATA__", payload)
open(OUT, "w", encoding="utf-8").write(page)
widths = {L: len(v) for L, v in by_layer.items()}
print(f"wrote {OUT}: {len(nodes)} sections, {len(edges)} links ({sum(1 for e in edges if e['c'] == 'back')} go back), {len(levels)} layers, widest layer {max(widths.values())} boxes, {len(page) // 1024} KB")
