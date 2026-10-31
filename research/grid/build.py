"""Field conditions for every upazila, from one 1 km grid of its cropland (research/grid/).

What it answers, for the farmer and the officer:
  condition    How green the fields are in the latest 16 days against what the 2001-2025 record expects for these
               days this year (NOAA-20 VIIRS on the MODIS scale; each year's MODIS value on the same days, the 25-year
               greening trend taken out). A percentile, a plain level, how much cropland was seen through the clouds,
               and Terra MODIS's own percentile as a second opinion (confidence() below). Where the fields are
               normally bare or under water on these days there is no crop to judge: noCrop.
  emptyField   The summer gap: in how many of the last ten years 15% or more of the cropland stood bare for 40 days or
               more after the winter harvest and before Aman (1 March - 15 July), from when to when (MODIS, smoothed).
  boroThirst   Green fields short of water in March-April (ECOSTRESS evaporative stress index, daytime passes).
  soil         Texture and the water the top 30 cm holds for a crop (SoilGrids, Saxton & Rawls).
  cropsByYear  Crops in each agricultural year since 2001-02 over the whole cropland (the map's time slider).
  greenness    Crops a year and the winter peak, early 2000s against now, over the whole cropland rather than one
               pixel at the upazila's centre: rewrites greenness_upazila.json in its old shape for the advice.

Outputs (packages/rotation-engine/src/data/):
  field_conditions.json         one compact row per upazila: the map, the advice and the officer's check list
  field_conditions_curves.json  the last 12 months' greenness against the band the trend expects, for the chart
  greenness_upazila.json        rewritten (same fields); its source and method say how it was made

Usage: python research/grid/build.py        (EDEN_GRID_DIR=<downloads> if they are not in research/data/grid)
"""
from __future__ import annotations

import json
from datetime import date, timedelta

import numpy as np

import esi
import ndvi
import soil
from _grid import ENGINE_DATA, load_grid

OUT = ENGINE_DATA / "field_conditions.json"
OUT_CURVES = ENGINE_DATA / "field_conditions_curves.json"
OUT_GREEN = ENGINE_DATA / "greenness_upazila.json"
GAP_DAYS, GAP_SHARE, GAP_MIN_YEARS = 40, 0.15, 3
YEARS = np.array(list(ndvi.BASE_YEARS), float)


def fin(x) -> bool:
    return x is not None and bool(np.isfinite(x))


def r(x, nd=2):
    return round(float(x), nd) if fin(x) else None


def level(pct: float) -> str:
    return ("wellBelow" if pct <= 10 else "below" if pct <= 25 else "wellAbove" if pct >= 90
            else "above" if pct >= 75 else "normal")


def rank(resid: np.ndarray, value: float) -> float | None:
    """Where `value` falls among the years' departures from the trend, 0-100."""
    v = resid[np.isfinite(resid)]
    if len(v) < 15 or not fin(value):
        return None
    return float(100 * ((v < value).sum() + 0.5 * (v == value).sum()) / len(v))


def band_of(pct: float) -> int:
    return -1 if pct <= 25 else 1 if pct >= 75 else 0


def confidence(seen: float | None, pct: float, modis_pct: float | None) -> str:
    """High when half the cropland was seen and Terra MODIS, where it still flies, puts the season on the same side
    (below a quarter, the middle half, above three quarters); low otherwise."""
    if (seen or 0) < 0.5:
        return "low"
    return "high" if modis_pct is None or band_of(modis_pct) == band_of(pct) else "low"


def mmdd(doy: float) -> str | None:
    if not fin(doy):
        return None
    d = date(2025, 1, 1) + timedelta(days=int(round(doy)) - 1)
    return f"{d.month:02d}-{d.day:02d}"


def expected_band(m_dates, m_series, day: date):
    """What the trend expects on this calendar day this year, and the years' spread around it: (expected, resid)."""
    vals = ndvi.year_values_at(m_dates, m_series, day)
    return ndvi.detrend(vals, YEARS, day.year)


def main() -> None:
    g = load_grid()
    ids = [p["id"] for p in g.places]
    m_dates, m_cube = ndvi.load_cube(g, "modis")
    v_dates, v_cube = ndvi.load_cube(g, "viirs")
    m_up, _ = ndvi.upazila_series(g, m_cube)
    v_raw, v_seen = ndvi.upazila_series(g, v_cube)
    v_up, fit = ndvi.harmonise(m_dates, m_up, v_dates, v_raw)

    # ---------- condition now: each upazila's latest VIIRS composite seen through the clouds (of the last three) ----------
    pick = np.full(len(ids) + 1, -1)
    for k in range(len(v_dates) - 3, len(v_dates)):
        pick = np.where(np.isfinite(v_up[k]), k, pick)
    band = {k: expected_band(m_dates, m_up, v_dates[k] + timedelta(days=8)) for k in sorted(set(pick[pick >= 0]))}
    # Terra MODIS on the same days, where it still delivers: a second opinion on its own scale
    modis_check = {}
    for k in set(pick[pick >= 0]):
        j = next((j for j in range(len(m_dates) - 1, len(m_dates) - 4, -1) if abs((m_dates[j] - v_dates[k]).days) <= 8), None)
        if j is not None:
            modis_check[k] = (j, expected_band(m_dates, m_up, m_dates[j] + timedelta(days=8)))

    # ---------- per-cell phenology: crops a year, winter peak, the summer's empty fields ----------
    ph = ndvi.cell_phenology(m_dates, m_cube)
    stack = np.stack([ph["cyclesEarly"], ph["cyclesRecent"], ph["peakEarly"], ph["peakRecent"],
                      (ph["peakRecent"] >= ndvi.WINTER_CROP_NDVI).astype(np.float32)])
    stack[4][~np.isfinite(ph["peakRecent"])] = np.nan
    green, green_seen = g.per_upazila(stack)
    by_year, _ = g.per_upazila(ph["cyclesByYear"])                                     # (years, upazilas)
    gap_has = (ph["gapDays"] >= GAP_DAYS).astype(np.float32)
    gap_share, _ = g.per_upazila(gap_has)                                              # (years, upazilas)
    gap_start, _ = g.per_upazila(np.where(gap_has > 0, ph["gapStart"], np.nan))
    gap_len, _ = g.per_upazila(np.where(gap_has > 0, ph["gapDays"], np.nan))

    thirst, esi_summary = esi.boro_thirst(g, [(v_dates, v_cube), (m_dates, m_cube)])
    soils = soil.soils(g)

    # ---------- the last 12 months against what the trend expects, for the chart ----------
    last = v_dates[-1]
    keep = [k for k, d in enumerate(v_dates) if (last - d).days <= 365]
    curve_band = []
    for k in keep:
        exp, res = expected_band(m_dates, m_up, v_dates[k] + timedelta(days=8))
        with np.errstate(all="ignore"):
            q = np.nanpercentile(res, [10, 90], axis=0)
        curve_band.append((exp, exp + q[0], exp + q[1]))

    rows, curves = {}, {}
    for i, uid in enumerate(ids, start=1):
        if g.crop_km2[i] < 1:
            continue
        row: dict = {"cropland": {"km2": round(float(g.crop_km2[i])), "share": r(g.crop_km2[i] / g.area_km2[i])}}
        k = int(pick[i])
        if k >= 0:
            exp, res = band[k][0][i], band[k][1][:, i]
            val = float(v_up[k, i])
            pct = rank(res, val - exp)
            if pct is not None:
                with np.errstate(all="ignore"):
                    lo, hi = np.nanpercentile(res, [10, 90])
                cond = {"date": v_dates[k].isoformat(), "ndvi": r(val), "expected": r(exp), "low": r(exp + lo),
                        "high": r(exp + hi), "percentile": round(pct), "level": level(pct), "seen": r(v_seen[k, i]),
                        "modis": None}
                if k in modis_check and fin(m_up[modis_check[k][0], i]):
                    j, (m_exp, m_res) = modis_check[k]
                    mp = rank(m_res[:, i], float(m_up[j, i]) - m_exp[i])
                    if mp is not None:
                        cond["modis"] = {"date": m_dates[j].isoformat(), "percentile": round(mp)}
                disagree = bool(cond["modis"]) and ((pct <= 25 and cond["modis"]["percentile"] >= 75)
                                                    or (pct >= 75 and cond["modis"]["percentile"] <= 25))
                if exp < ndvi.BARE_NDVI:
                    cond["level"] = "noCrop"        # bare or under water on these days in most years
                elif disagree:
                    cond["level"] = "unclear"
                cond["confidence"] = confidence(cond["seen"], pct, cond["modis"]["percentile"] if cond["modis"] else None)
                row["condition"] = cond
        shares = gap_share[:, i]
        good = np.isfinite(shares) & (shares >= GAP_SHARE)
        if good.sum() >= GAP_MIN_YEARS:
            days = int(round(np.nanmedian(gap_len[good, i]) / 8) * 8)
            start = np.nanmedian(gap_start[good, i])
            row["emptyField"] = {"share": r(np.nanmedian(shares[good])), "years": int(good.sum()),
                                 "of": len(ndvi.GAP_YEARS), "from": mmdd(start), "to": mmdd(start + days), "days": days}
        if np.isfinite(by_year[:, i]).sum() >= 20:
            row["cropsByYear"] = [r(x, 1) for x in by_year[:, i]]
        if uid in thirst:
            row["boroThirst"] = thirst[uid]
        if uid in soils:
            row["soil"] = soils[uid]
        rows[uid] = row
        curves[uid] = {"ndvi": [r(v_up[k, i]) for k in keep],
                       "expected": [r(c[0][i]) for c in curve_band],
                       "low": [r(c[1][i]) for c in curve_band],
                       "high": [r(c[2][i]) for c in curve_band]}

    sources = {
        "cropland": "ESA WorldCover 2021 v200, 10 m (cropland, water and built-up shares on a 100 m grid)",
        "ndviBaseline": "NASA MOD13A2.061 Terra MODIS 1 km 16-day NDVI, pixel reliability 0-1, "
                        f"{m_dates[0].isoformat()} to {m_dates[-1].isoformat()}",
        "ndviNow": "NASA VJ113A2.002 NOAA-20 VIIRS 1 km 16-day NDVI, reliability 0-3, "
                   f"{v_dates[0].isoformat()} to {v_dates[-1].isoformat()}, on the MODIS scale",
        "stress": "NASA ECOSTRESS ECO_L4T_ESI.002 evaporative stress index, 70 m, daytime passes, March-April 2025 and 2026",
        "soil": "ISRIC SoilGrids 2.0, 250 m: sand, clay, organic carbon 0-30 cm; Saxton & Rawls (2006) available water",
        "upazilas": "the dashboard's 544 upazila outlines (bd_upazilas.geojson)",
    }
    out = {
        "generatedOn": date.today().isoformat(),
        "method": "Every figure is a mean over the upazila's cropland on a 1 km grid, each cell weighted by the "
                  "cropland inside it (research/grid/build.py). Context beside the 25-season replay, not a score.",
        "sources": sources,
        "harmonisation": fit,
        "now": {"composite": v_dates[-1].isoformat(), "to": (v_dates[-1] + timedelta(days=15)).isoformat(),
                "sensor": "NOAA-20 VIIRS", "baselineYears": f"{ndvi.BASE_YEARS[0]}-{ndvi.BASE_YEARS[-1]}",
                "trend": "each year's value on these days, a straight-line trend through the 25 years taken out"},
        "cropsByYear": {"years": list(ndvi.CYCLE_YEARS),
                        "note": "agricultural years November-October, each labelled by the year it starts"},
        "emptyField": {"years": f"{ndvi.GAP_YEARS[0]}-{ndvi.GAP_YEARS[-1]}", "bareNdvi": ndvi.BARE_NDVI,
                       "minDays": GAP_DAYS, "minShare": GAP_SHARE, "minYears": GAP_MIN_YEARS,
                       "window": "%02d-%02d to %02d-%02d" % (*ndvi.GAP_WINDOW[0], *ndvi.GAP_WINDOW[1])},
        "boroThirst": {**esi_summary, "thirstyEsi": esi.THIRSTY, "greenNdvi": esi.GREEN},
        "upazilas": rows,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    OUT_CURVES.write_text(json.dumps({"dates": [v_dates[k].isoformat() for k in keep], "upazilas": curves},
                                     separators=(",", ":")) + "\n", encoding="utf-8")

    # greenness_upazila.json in its old shape, now over the cropland (kept as before where an upazila has none)
    old = json.loads(OUT_GREEN.read_text(encoding="utf-8"))
    product = ("MODIS MOD13A2 NDVI, 1 km, over the upazila's cropland (ESA WorldCover 2021), each cell weighted by "
               "its cropland")
    early = f"{ndvi.EARLY[0]}-{str(ndvi.EARLY[0] + 1)[2:]} to {ndvi.EARLY[-1]}-{str(ndvi.EARLY[-1] + 1)[2:]}"
    recent = f"{ndvi.RECENT[0]}-{str(ndvi.RECENT[0] + 1)[2:]} to {ndvi.RECENT[-1]}-{str(ndvi.RECENT[-1] + 1)[2:]}"
    replaced = 0
    for i, uid in enumerate(ids, start=1):
        if g.crop_km2[i] < 1 or not np.isfinite(green[1, i]) or green_seen[1, i] < 0.5:
            continue
        old["upazilas"][uid] = {
            "product": product,
            "early": {"years": early, "peakNdvi": r(green[2, i]), "cyclesPerYear": r(green[0, i])},
            "recent": {"years": recent, "peakNdvi": r(green[3, i]), "cyclesPerYear": r(green[1, i])},
            "winterCropShareRecent": r(green[4, i]),
        }
        replaced += 1
    old["generatedOn"] = date.today().isoformat()
    old["source"] = "NASA MODIS MOD13A2 v061 via AppEEARS, over ESA WorldCover 2021 cropland (research/grid/build.py)"
    old["method"] = ("Every 1 km cropland cell's 8-day, Savitzky-Golay-smoothed NDVI (the pilots' method: growth peaks "
                     "of height 0.35, prominence 0.08, 48 days apart, agricultural year November-October; the winter "
                     "peak is the highest NDVI from 15 January to 15 March), then the upazila's cropland-weighted "
                     "mean; upazilas with no cropland keep the MOD13Q1 pixel at their centre "
                     "(research/explore/national_greenness.py).")
    OUT_GREEN.write_text(json.dumps(old, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"field conditions: {len(rows)} upazilas; greenness rewritten for {replaced}; harmonisation {fit}")


if __name__ == "__main__":
    main()
