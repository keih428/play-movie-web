"""田中(marom)の VSM を読む(P4 種類の表を作るため)。scouting-ai の data/vsm_raw から読むだけ。"""
import json

R = "/Users/keih428/Developer/UTokyo/UTVB/scouting-ai/data/vsm_raw"


def tanaka_matches():
    F = json.load(open(f"{R}/_files.json"))
    D = [json.load(open(f"{R}/{fid}.vsm")) for _, fid in F]
    D += json.load(open(f"{R}/latest.vsdb"))["matches"]
    D = [d for d in D if "marom" in ((d["scout"].get("video") or {}).get("path") or "")]
    seen = set()
    out = []
    for d in D:
        ids = [p["_id"] for s in d["scout"]["sets"] for e in s["events"] for p in (e.get("exchange") or {}).get("plays", [])]
        key = ids[0] if ids else None
        if key is None or key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def rallies(d):
    """(set, event, plays) を順に。"""
    for s in d["scout"]["sets"]:
        for e in s["events"]:
            ex = e.get("exchange")
            if ex:
                yield s, e, ex["plays"]
