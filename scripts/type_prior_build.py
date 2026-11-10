"""P4 種類の候補の表(lib/domain/input-assist/type-prior.json)を、田中(marom)の VSM から作る。
使い方:scouting-ai の venv の python で、play-movie-web のフォルダから
  python scripts/type_prior_build.py
数が 15 未満の組み合わせは入れない(そのときは、より粗い表を使う)。"""
import collections, json, sys
sys.path.insert(0, "scripts")
from type_prior_common import tanaka_matches, rallies

MIN_N = 15
M = tanaka_matches()
combos = {}
for d in M:
    for c in d.get("attackCombinations") or []:
        combos.setdefault(c["code"], c)


def side(team):
    return "away" if team == "a" else "home"


def role(lineup, team, shirt):
    lu = lineup[side(team)]
    for k, v in lu["positions"].items():
        try:
            if v is not None and int(v) == int(shirt):
                pos = int(k)
                return ("front" if pos in (2, 3, 4) else "back"), str((pos - int(lu["setterAt"])) % 6)
        except (TypeError, ValueError):
            pass
    return "L", "L"


def nxt_key(p, n):
    if n is None:
        return "end"
    return ("same" if n["team"] == p["team"] else "other") + ":" + n["skill"]


T = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
copy = collections.defaultdict(collections.Counter)
plays_n = 0
for d in M:
    for s, e, P in rallies(d):
        lu = e["lineup"]
        for i, p in enumerate(P):
            plays_n += 1
            prev = P[i - 1] if i else None
            n = P[i + 1] if i + 1 < len(P) else None
            k = p["skill"]
            ht = p.get("hitType")
            if ht:
                T["hit_by_skill"][k][ht] += 1
                T["hit_by_context"][f"{k}|{prev['skill'] if prev else '-'}|{nxt_key(p, n)}"][ht] += 1
                if k == "A" and not p.get("combination"):
                    T["hit_by_context"]["A|none"][ht] += 1
            # つなぎ(写す)の当たり方
            if k == "R" and prev and prev["skill"] == "S":
                copy["R<S"][ht == prev.get("hitType")] += 1
            if k == "E" and n and n["skill"] == "A" and n["team"] == p["team"] and n.get("hitType"):
                copy["E<A"][ht == n.get("hitType")] += 1
                c = combos.get(n.get("combination") or "")
                if c and c.get("targetAttacker"):
                    copy["target<combo"][p.get("targetAttacker") == c["targetAttacker"]] += 1
            if k == "A" and p.get("combination") in combos:
                copy["A<combo"][ht == combos[p["combination"]].get("hitType")] += 1
            if k == "B" and prev and prev["skill"] == "A":
                copy["B<A"][ht == prev.get("hitType")] += 1
                if p.get("players") is not None and prev.get("players") is not None:
                    copy["Bplayers<A"][p.get("players") == prev.get("players")] += 1
            if k == "D" and prev and prev["skill"] == "A":
                copy["D<A"][ht == prev.get("hitType")] += 1
            if k == "S":
                T["serve"]["all"][ht] += 1
            if k == "E":
                call = p.get("combination") or ""
                ps = prev["skill"] if prev else "-"
                pe = (prev or {}).get("effect") or ""
                T["call_by_prev"][f"{ps}|{pe}"][call] += 1
                T["call_all"]["all"][call] += 1
                if n and n["skill"] == "A" and n["team"] == p["team"]:
                    nc = n.get("combination") or ""
                    T["call_by_next"][f"{nc}|{ps}|{pe}"][call] += 1
                    T["call_by_next_combo"][nc][call] += 1
                T["target_by_call"][call][p.get("targetAttacker") or ""] += 1
                T["target_all"]["all"][p.get("targetAttacker") or ""] += 1
            if k == "A":
                y = p.get("combination") or ""
                row, off = role(lu, p["team"], p["player"])
                call = prev.get("combination") or "" if prev and prev["skill"] == "E" and prev["team"] == p["team"] else ""
                q = (P[i - 2].get("effect") or "") if i >= 2 and prev and prev["skill"] == "E" else ""
                sz = p.get("startZone")
                if sz is not None:
                    T["combo_by_zone"][f"{sz}|{call}|{row}|{off}"][y] += 1
                    T["combo_by_zone_row"][f"{sz}|{row}"][y] += 1
                T["combo_by_quality"][f"{call}|{row}|{off}|{q}"][y] += 1
                T["combo_by_role"][f"{call}|{row}|{off}"][y] += 1
                T["combo_by_row"][f"{row}|{off}"][y] += 1
                T["combo_all"]["all"][y] += 1
                st = p.get("skillType")
                if st:
                    T["skill_type_by_context"][f"{p.get('effect') or ''}|{n['skill'] if n else 'end'}"][st] += 1
                    T["skill_type_all"]["all"][st] += 1
                bl = p.get("players")
                if bl is not None:
                    T["blockers_by_context"][f"{y}|{n['skill'] if n else 'end'}"][str(bl)] += 1
                    T["blockers_by_combo"][y][str(bl)] += 1
                    T["blockers_all"]["all"][str(bl)] += 1
            if k == "B" and p.get("players") is not None:
                T["block_players_all"]["all"][str(p["players"])] += 1


def table(counter_map, min_n=MIN_N):
    out = {}
    for key, c in counter_map.items():
        n = sum(c.values())
        if n >= min_n:
            out[key] = {"n": n, "p": {v: round(x / n, 3) for v, x in c.most_common()}}
    return out


def single(counter_map):
    return table(counter_map, 1)["all"]


out = {
    "matches": len(M),
    "plays": plays_n,
    "copy": {k: round(c[True] / (c[True] + c[False]), 3) for k, c in copy.items()},
    "copy_n": {k: c[True] + c[False] for k, c in copy.items()},
    "serve": single(T["serve"]),
    "serve_history": {"alpha": 1, "team_beta": 5},
    "hit_by_context": table(T["hit_by_context"]),
    "hit_by_skill": table(T["hit_by_skill"], 1),
    "call_by_next": table(T["call_by_next"]),
    "call_by_next_combo": table(T["call_by_next_combo"]),
    "call_by_prev": table(T["call_by_prev"]),
    "call_all": single(T["call_all"]),
    "target_by_call": table(T["target_by_call"]),
    "target_all": single(T["target_all"]),
    "combo_by_zone": table(T["combo_by_zone"]),
    "combo_by_zone_row": table(T["combo_by_zone_row"]),
    "combo_by_quality": table(T["combo_by_quality"]),
    "combo_by_role": table(T["combo_by_role"]),
    "combo_by_row": table(T["combo_by_row"]),
    "combo_all": single(T["combo_all"]),
    "skill_type_by_context": table(T["skill_type_by_context"]),
    "skill_type_all": single(T["skill_type_all"]),
    "blockers_by_context": table(T["blockers_by_context"]),
    "blockers_by_combo": table(T["blockers_by_combo"]),
    "blockers_all": single(T["blockers_all"]),
    "blockers_history": {"alpha": 5},
    "block_players_all": single(T["block_players_all"]),
}
json.dump(out, open("lib/domain/input-assist/type-prior.json", "w"), ensure_ascii=False, indent=1)
print("matches", len(M), "plays", plays_n)
print("copy", out["copy"], out["copy_n"])
for k, v in out.items():
    if isinstance(v, dict) and all(isinstance(x, dict) and "n" in x for x in v.values()):
        print(k, len(v))
