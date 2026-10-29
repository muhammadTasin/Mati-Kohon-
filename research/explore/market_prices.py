"""How each crop's market price has moved since the BBS harvest prices the income score is built on.

The income score starts from BBS 2024-25 harvest prices and yields (and census costs). DAM's own report pages return
empty tables (research/acquire/wfp_prices.py), but DAM's market prices reach us through WFP's monthly Bangladesh food
price file (HDX, CC BY-IGO): retail prices in about a hundred district markets, to a few months ago.

For each crop with a market series this script compares the mean price of the latest twelve months the file holds
with the mean of the year the crop's value in the income score is priced in, market by market, and keeps the median
ratio: July 2024-June 2025 (the BBS 2024-25 crop year) for crops valued at BBS 2024-25 harvest prices, and 2019 for
crops valued from the Agriculture Census 2019 (rice, wheat, maize, potato, jute; before 2020 the file holds division
series, so fewer markets).
Costs rise with prices in general (labour, fuel, fertilizer), so the income score uses each crop's move *relative* to
the median move of all well-covered foods: a crop whose price rose faster than food in general earns more, one that
fell behind earns less, and general inflation changes nothing. Retail prices stand in for farm-gate prices (their
moves, not their level); mustard oil stands in for mustard seed and coarse rice for paddy.

Output: packages/rotation-engine/src/data/market_prices.json
Usage : python research/acquire/wfp_prices.py (refresh), then python research/explore/market_prices.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "acquire"))
from _common import DATA, RESEARCH  # noqa: E402

RAW = DATA / "wfp" / "wfp_food_prices_bgd.csv"
OUT = RESEARCH.parent / "packages" / "rotation-engine" / "src" / "data" / "market_prices.json"
BASES = {"bbs2025": ("2024-07-01", "2025-06-30", "BBS 2024-25 crop year"), "census2019": ("2019-01-01", "2019-12-31", "Agriculture Census 2019")}
MIN_MARKETS_GENERAL = {"bbs2025": 40, "census2019": 5}  # a food counts in the general move with this many markets in both periods
STALE_MONTHS = 9  # a series whose last price is older than this is left out

# engine crop id -> WFP commodity (retail); 'proxy' marks a processed product standing in for the crop
CROPS = {
    "aman": ("Rice (coarse)", "paddy, as coarse rice"), "boro": ("Rice (coarse)", "paddy, as coarse rice"),
    "boro_early": ("Rice (coarse)", "paddy, as coarse rice"), "boro_late": ("Rice (coarse)", "paddy, as coarse rice"),
    "aus": ("Rice (coarse)", "paddy, as coarse rice"),
    "wheat": ("Wheat", "wheat grain"), "lentil": ("Lentils (masur)", "lentil"), "potato": ("Potatoes (Holland, white)", "potato"),
    "mustard": ("Oil (mustard)", "mustard seed, as mustard oil"), "chickpea": ("Chickpeas", "chickpea"),
    "mungbean": ("Beans (mung, large grain)", "mungbean"), "mungbean_k2": ("Beans (mung, large grain)", "mungbean"),
}


def ratio(d: pd.DataFrame, commodity: str, last: pd.Timestamp, ref: tuple[str, str]) -> dict | None:
    c = d[(d["commodity"] == commodity) & (d["pricetype"] == "Retail")]
    if c.empty:
        return None
    end = c["date"].max()
    if (last - end).days > STALE_MONTHS * 31:
        return None
    start = end - pd.DateOffset(months=11)
    then = c[c["date"].between(*ref)].groupby("market")["price"].mean()
    now = c[c["date"].between(start, end)].groupby("market")["price"].mean()
    both = pd.concat([then.rename("ref"), now.rename("now")], axis=1).dropna()
    if len(both) >= 3:
        r, ref_tk, now_tk, n, matched = (both["now"] / both["ref"]).median(), both["ref"].median(), both["now"].median(), len(both), True
    elif len(then) >= 3 and len(now) >= 3:
        # Before 2020 the file holds division series and after it district markets: compare the national medians
        r, ref_tk, now_tk, n, matched = now.median() / then.median(), then.median(), now.median(), min(len(then), len(now)), False
    else:
        return None
    return {"commodity": commodity, "markets": int(n), "matched": matched, "refTk": round(float(ref_tk), 1), "nowTk": round(float(now_tk), 1),
            "unit": str(c["unit"].iloc[0]), "ratio": round(float(r), 3), "from": start.strftime("%Y-%m"), "to": end.strftime("%Y-%m")}


def main() -> None:
    d = pd.read_csv(RAW, skiprows=[1], low_memory=False)  # row 2 holds HXL tags
    d["date"] = pd.to_datetime(d["date"])
    last = d["date"].max()
    foods = d[(d["category"] != "non-food") & (d["pricetype"] == "Retail")]["commodity"].unique()
    general, crops = {}, {}
    for base, (r0, r1, label) in BASES.items():
        moves = [x for x in (ratio(d, f, last, (r0, r1)) for f in foods) if x and x["markets"] >= MIN_MARKETS_GENERAL[base]]
        gen = float(pd.Series([g["ratio"] for g in moves]).median())
        general[base] = {"label": label, "from": r0[:7], "to": r1[:7], "ratio": round(gen, 3), "foods": len(moves), "minMarkets": MIN_MARKETS_GENERAL[base]}
        for cid, (commodity, stands) in CROPS.items():
            r = ratio(d, commodity, last, (r0, r1))
            if r:
                crops.setdefault(cid, {"commodity": commodity, "standsFor": stands})[base] = {**r, "relative": round(r["ratio"] / gen, 3)}
    OUT.write_text(json.dumps({
        "generatedOn": date.today().isoformat(),
        "source": "WFP Bangladesh food prices (HDX, CC BY-IGO), republishing DAM's market prices; retail, district markets",
        "fileUpdated": json.loads((RAW.parent / (RAW.name + ".provenance.json")).read_text(encoding="utf-8")).get("updated"),
        "method": __doc__.split("\n\n")[2].strip(),
        "general": general,
        "crops": crops,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    for base, g in general.items():
        print(f"{base}: general food prices x{g['ratio']:.3f} ({g['foods']} foods with {g['minMarkets']}+ markets)")
        for cid, c in crops.items():
            if base in c:
                x = c[base]
                print(f"  {cid:<12} {c['commodity']:<28} {x['markets']:>3} markets {x['refTk']:>7} -> {x['nowTk']:>7} Tk/{x['unit']}  x{x['ratio']:.3f}  relative x{x['relative']:.3f}  (now {x['from']} to {x['to']})")
    print(f"wrote {OUT.relative_to(RESEARCH.parent)}")


if __name__ == "__main__":
    main()
