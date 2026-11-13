"""The graph of a book in format v2: one node per section, one link per way out of it.

Shared by make_book_map.py (the network) and make_flowchart.py (the flowchart).
"""
import re



def build_graph(book):
    """{'title', 'start', 'nodes': [...], 'edges': [...]} for a v2 book."""
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


    def enemy_rules(e):
        """(key, label) for every special rule of one enemy; the keys are what the 'highlight a rule' menu offers."""
        out = []
        if isinstance(e.get("effectiveWeapons"), list):
            w = " or ".join(e["effectiveWeapons"])
            out.append(("immune" if e.get("normalWeaponDamage") == 0 else "resists", f"Immune to any weapon that is not {w}" if e.get("normalWeaponDamage") == 0 else f"Weapons that are not {w} deal only {e.get('normalWeaponDamage', 2)} damage"))
        if e.get("weakTo"):
            out.append(("weakness", f"{e['weakTo']['property']} weapons deal {e['weakTo']['damage']} damage"))
        if e.get("reviveOn"):
            out.append(("revives", f"Rises again on a {'/'.join(map(str, e['reviveOn']))} when reduced to 0"))
        ow = e.get("onWound") or {}
        if ow.get("luckTest"):
            out.append(("wound-luck", f"Each wound: Test Luck or lose {ow.get('skillLoss', 1)} SKILL for the fight"))
        elif ow.get("permanent"):
            out.append(("wound-skill", f"Each wound permanently drains {ow.get('skillLoss', 1)} SKILL"))
        if ow.get("maxStaminaLoss"):
            out.append(("life-drain", f"Each wound lowers your maximum STAMINA by {ow['maxStaminaLoss']} for good"))
        if ow.get("staminaLoss"):
            out.append(("poison", f"Each wound is poisoned: {ow['staminaLoss']} more STAMINA"))
        if ow.get("luckLoss"):
            out.append(("unnerves", f"Each wound costs {ow['luckLoss']} LUCK"))
        os_ = e.get("onStart")
        if os_:
            out.append(("start-effect", f"At the start: {'Test Luck or lose ' + str(os_.get('skillLoss', 1)) + ' SKILL' if os_.get('luckTest') else '-' + str(os_.get('skillLoss', 1)) + ' SKILL'}"))
        if e.get("damage") and e["damage"] != 2:
            out.append(("heavy-damage", f"Each wound does {e['damage']} STAMINA"))
        if e.get("attackDice") == 3:
            out.append(("three-dice", "Rolls three dice for its attack"))
        if e.get("strikesFirst"):
            out.append(("strikes-first", "Strikes first: you can only parry in round 1"))
        if e.get("tiesWound"):
            out.append(("ties-wound", "Wins a tied round"))
        if e.get("ignoresArmor"):
            out.append(("ignores-armor", "Ignores your armour"))
        if e.get("regenerates"):
            out.append(("regenerates", f"Regenerates {e['regenerates']} STAMINA every round"))
        if e.get("spell"):
            out.append(("spell", "Casts a spell once per fight: you may lose your attack for a round"))
        if (e.get("onHurt") or {}).get("luckTest"):
            out.append(("shapechanger", "Shapechanger: when wounded it may confuse you (-" + str(e["onHurt"].get("attackPenalty", 2)) + " to your next attack)"))
        if e.get("maxRounds"):
            out.append(("time-limit", f"You must win within {e['maxRounds']} rounds"))
        return out


    def section_rules(s):
        c = s.get("combat")
        out = []
        for e in (c if isinstance(c, list) else [c] if c else []):
            for k, l in enemy_rules(e):
                out.append({"k": k, "l": l, "who": e["enemyName"]})
        if is_group(s):
            out.append({"k": "group", "l": "They attack at the same time", "who": "all"})
        return out


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
            "stealth": bool(r and r.get("stealth")), "zone": zone.get(sid, 0), "group": is_group(s), "rules": section_rules(s),
        })

    return {"title": book["title"], "start": start, "nodes": nodes, "edges": edges}
