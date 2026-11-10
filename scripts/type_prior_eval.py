"""P4 種類:鍵の取り方ごとの当たり方を比べる(試合で2つに分けて、片方で表を作り、もう片方で当てる)。"""
import collections, sys
sys.path.insert(0, "scripts")
from type_prior_common import tanaka_matches, rallies
M = tanaka_matches()

def side(team): return "away" if team == "a" else "home"

def role(lineup, team, shirt):
    lu = lineup[side(team)]
    pos = None
    for k, v in lu["positions"].items():
        try:
            if v is not None and int(v) == int(shirt): pos = int(k)
        except Exception: pass
    if pos is None: return "L", "L"
    row = "front" if pos in (2, 3, 4) else "back"
    off = (pos - int(lu["setterAt"])) % 6
    return row, str(off)

def samples():
    out = []
    for mi, d in enumerate(M):
        for s, e, P in rallies(d):
            lu = e["lineup"]
            for i, p in enumerate(P):
                prev = P[i-1] if i else None
                if p["skill"] == "A":
                    row, off = role(lu, p["team"], p["player"])
                    call = (prev or {}).get("combination") if prev and prev["skill"] == "E" and prev["team"] == p["team"] else None
                    eprev = P[i-2] if i >= 2 and prev and prev["skill"] == "E" else None
                    out.append(dict(m=mi, kind="A", y=p.get("combination") or "", call=call or "", row=row, off=off,
                                    sz=str(p.get("startZone")), player=f"{mi}|{p['team']}|{p['player']}",
                                    eff=p.get("effect"), nxt=(P[i+1]["skill"] if i+1 < len(P) else "end"),
                                    st=p.get("skillType") or "", bl=str(p.get("players")), eeff=(prev or {}).get("effect") or "",
                                    q=(eprev or {}).get("effect") or "", qs=(eprev or {}).get("skill") or ""))
                if p["skill"] == "E":
                    row, off = role(lu, p["team"], p["player"])
                    out.append(dict(m=mi, kind="E", y=p.get("combination") or "", ps=(prev or {}).get("skill") or "",
                                    pe=(prev or {}).get("effect") or "", row=row, off=off, team=p["team"],
                                    player=f"{mi}|{p['team']}|{p['player']}"))
                if p["skill"] == "S":
                    out.append(dict(m=mi, kind="S", y=p.get("hitType"), player=f"{mi}|{p['team']}|{p['player']}"))
    return out

S = samples()

def cv(kind, keyfuncs, y="y", minn=15, filt=None):
    rows = [r for r in S if r["kind"] == kind and (filt is None or filt(r))]
    ok = 0
    for fold in (0, 1):
        train = [r for r in rows if r["m"] % 2 != fold]
        test = [r for r in rows if r["m"] % 2 == fold]
        tabs = []
        for f in keyfuncs:
            t = collections.defaultdict(collections.Counter)
            for r in train: t[f(r)][r[y]] += 1
            tabs.append(t)
        allc = collections.Counter(r[y] for r in train)
        for r in test:
            pred = None
            for f, t in zip(keyfuncs, tabs):
                c = t.get(f(r))
                if c and sum(c.values()) >= minn:
                    pred = c.most_common(1)[0][0]; break
            if pred is None: pred = allc.most_common(1)[0][0]
            ok += pred == r[y]
    return round(ok / len(rows), 3), len(rows)

print("E call: all", cv("E", []))
print("E call: prev skill+effect", cv("E", [lambda r: (r["ps"], r["pe"])]))
print("E call: team+prev", cv("E", [lambda r: (r["team"], r["ps"], r["pe"]), lambda r: (r["ps"], r["pe"])]))
print("E call: prev+setter row", cv("E", [lambda r: (r["ps"], r["pe"], r["row"]), lambda r: (r["ps"], r["pe"])]))
print("A combo: all", cv("A", []))
print("A combo: row+off", cv("A", [lambda r: (r["row"], r["off"])]))
print("A combo: call+row+off", cv("A", [lambda r: (r["call"], r["row"], r["off"]), lambda r: (r["row"], r["off"])]))
print("A combo: call+row+off+q", cv("A", [lambda r: (r["call"], r["row"], r["off"], r["q"]), lambda r: (r["call"], r["row"], r["off"]), lambda r: (r["row"], r["off"])]))
print("A combo: sz+row", cv("A", [lambda r: (r["sz"], r["row"]), lambda r: (r["row"], r["off"])]))
print("A combo: sz+call+row+off", cv("A", [lambda r: (r["sz"], r["call"], r["row"], r["off"]), lambda r: (r["sz"], r["row"]), lambda r: (r["row"], r["off"])]))
print("A skillType: all", cv("A", [], y="st"))
print("A skillType: eff+next", cv("A", [lambda r: (r["eff"], r["nxt"])], y="st"))
print("A skillType: combo+eff+next", cv("A", [lambda r: (r["y"], r["eff"], r["nxt"]), lambda r: (r["eff"], r["nxt"])], y="st"))
print("A players: all", cv("A", [], y="bl"))
print("A players: combo", cv("A", [lambda r: r["y"]], y="bl"))
print("A players: combo+q", cv("A", [lambda r: (r["y"], r["q"]), lambda r: r["y"]], y="bl"))
print("A players: combo+call", cv("A", [lambda r: (r["y"], r["call"]), lambda r: r["y"]], y="bl"))
print("A players: combo+eff+next", cv("A", [lambda r: (r["y"], r["eff"], r["nxt"]), lambda r: r["y"]], y="bl"))
print("S hit: all", cv("S", []))

# サーブ:そのセッションの、その選手のこれまでのサーブから(順に当てる)
prior = collections.Counter(r["y"] for r in S if r["kind"] == "S")
tot = sum(prior.values()); prior = {k: v / tot for k, v in prior.items()}
for alpha in (0.5, 1, 2, 3):
    hist = collections.defaultdict(collections.Counter)
    ok = n = 0
    calib = collections.defaultdict(lambda: [0, 0])
    for r in S:
        if r["kind"] != "S": continue
        h = hist[r["player"]]; hn = sum(h.values())
        probs = {k: (h[k] + alpha * prior.get(k, 0)) / (hn + alpha) for k in set(prior) | set(h)}
        top = max(probs, key=probs.get); pt = probs[top]
        ok += top == r["y"]; n += 1
        b = "≥0.95" if pt >= 0.95 else "0.9-0.95" if pt >= 0.9 else "0.8-0.9" if pt >= 0.8 else "<0.8"
        calib[b][0] += top == r["y"]; calib[b][1] += 1
        h[r["y"]] += 1
    print("S hit history alpha", alpha, round(ok / n, 3), {k: (round(a / b, 3), b) for k, (a, b) in sorted(calib.items())})

# アタッカーの、そのセッションでのこれまでのコンビ(履歴)と、役割の表を混ぜる
for alpha in (1, 3, 5, 10):
    rows = [r for r in S if r["kind"] == "A"]
    ok = 0
    calib = collections.defaultdict(lambda: [0, 0])
    for fold in (0, 1):
        train = [r for r in rows if r["m"] % 2 != fold]
        t = collections.defaultdict(collections.Counter)
        for r in train: t[(r["call"], r["row"], r["off"])][r["y"]] += 1
        t2 = collections.defaultdict(collections.Counter)
        for r in train: t2[(r["row"], r["off"])][r["y"]] += 1
        hist = collections.defaultdict(collections.Counter)
        for r in [r for r in rows if r["m"] % 2 == fold]:
            c = t.get((r["call"], r["row"], r["off"]))
            if not c or sum(c.values()) < 15: c = t2[(r["row"], r["off"])]
            cn = sum(c.values()) or 1
            pr = {k: v / cn for k, v in c.items()}
            hk = (r["player"], r["row"])
            h = hist[hk]; hn = sum(h.values())
            probs = {k: (h[k] + alpha * pr.get(k, 0)) / (hn + alpha) for k in set(pr) | set(h)}
            top = max(probs, key=probs.get); pt = probs[top]
            ok += top == r["y"]
            b = "≥0.95" if pt >= 0.95 else "0.8-0.95" if pt >= 0.8 else "0.5-0.8" if pt >= 0.5 else "<0.5"
            calib[b][0] += top == r["y"]; calib[b][1] += 1
            h[r["y"]] += 1
    print("A combo history+role alpha", alpha, round(ok / len(rows), 3), {k: (round(a / b, 3), b) for k, (a, b) in sorted(calib.items())})

# トス:次のアタックのコンビが分かっているとき
nextc = {}
for mi, d in enumerate(M):
    for s, e, P in rallies(d):
        for i, p in enumerate(P):
            if p["skill"] == "E":
                n = P[i+1] if i+1 < len(P) else None
                nextc[p["_id"]] = (n.get("combination") or "") if n and n["skill"] == "A" and n["team"] == p["team"] else "-"
Ei = [r for r in S if r["kind"] == "E"]
k = 0
for mi, d in enumerate(M):
    for s, e, P in rallies(d):
        for p in P:
            if p["skill"] == "E":
                Ei[k]["nc"] = nextc[p["_id"]]; k += 1
print("E call: nextCombo+prev", cv("E", [lambda r: (r["nc"], r["ps"], r["pe"]), lambda r: r["nc"], lambda r: (r["ps"], r["pe"])]))
print("E call: nextCombo", cv("E", [lambda r: r["nc"], lambda r: (r["ps"], r["pe"])]))

# ブロックの人数:同じセッションの、同じコンビの履歴を混ぜる
rows = [r for r in S if r["kind"] == "A"]
for alpha in (2, 5, 10, 20):
    ok = 0
    for fold in (0, 1):
        t = collections.defaultdict(collections.Counter)
        for r in rows:
            if r["m"] % 2 != fold: t[r["y"]][r["bl"]] += 1
        hist = collections.defaultdict(collections.Counter)
        for r in [r for r in rows if r["m"] % 2 == fold]:
            c = t[r["y"]] if sum(t[r["y"]].values()) >= 15 else collections.Counter(x["bl"] for x in rows); cn = sum(c.values()) or 1
            pr = {kk: v / cn for kk, v in c.items()}
            h = hist[(r["m"], r["player"].split("|")[1], r["y"])]; hn = sum(h.values())
            probs = {kk: (h[kk] + alpha * pr.get(kk, 0)) / (hn + alpha) for kk in set(pr) | set(h)}
            ok += max(probs, key=probs.get) == r["bl"]
            h[r["bl"]] += 1
    print("A players combo+session history alpha", alpha, round(ok / len(rows), 3))
