"""Twenty-five years of the same fields: how the condition's method reads seasons whose cause is known, and when the
haor's Boro is really cut.

  amanRecord   Every Aman season since 2001 judged the way the condition is judged now: the upazila's cropland greenness
               from mid-September to October (Terra MODIS composites starting 14 September - 31 October) against its own
               25-year trend. A season is weak when it falls 0.03 NDVI or more below the trend and 1.5 robust standard
               deviations (1.4826 x the median absolute departure) or more. Where the usual greenness on those days is
               below 0.30 (bare or under water, as in the deep haor) there is no Aman to judge. CHECKS are seasons
               whose cause is on record, to show what the record catches and what it misses.
  boroHarvest  In the seven haor districts, the land that grows Boro only (a winter peak of NDVI 0.5 or more, and an
               August-October peak below 0.4, under water or bare, in most years): the day half of that Boro is cut in
               each spring (the smoothed NDVI past half way down from its peak, composites dated by their first day:
               with the maximum-value compositing a harvest inside a composite shows in the next one), its usual day in
               springs without a reported flash flood, the trend, and how many days early the crop went in FFWC's
               flash-flood years (research/floods/flash_flood_hindcast.csv; the engine's 100 mm series). A 16-day
               product places a date within about a week; the burst-by-burst share still standing is not resolvable.
"""
from __future__ import annotations

import warnings
from datetime import date

import numpy as np
import pandas as pd
from scipy import stats

from _grid import RESEARCH, Grid
from ndvi import BASE_YEARS, _eight_day, detrend

WINDOW = ((9, 14), (10, 31))
WEAK_Z, WEAK_DROP = -1.5, 0.03
AMAN_LEVEL = 0.30
CHECKS = [  # seasons whose cause is on record
    {"id": "ADM3_Koyra", "years": [2009, 2010, 2011],
     "event": {"en": "Cyclone Aila, May 2009, broke the embankments; salt water stood until 2011",
               "bn": "ঘূর্ণিঝড় আইলা, মে ২০০৯, বাঁধ ভেঙে দেয়; ২০১১ পর্যন্ত লোনা পানি ছিল"}},
    {"id": "ADM3_Chauhali", "years": [2020],
     "event": {"en": "the long 2020 monsoon flood on the Jamuna", "bn": "২০২০-এর যমুনার দীর্ঘ বন্যা"}},
    {"id": "ADM3_Chauddagram", "years": [2024],
     "event": {"en": "the August 2024 flood in the east", "bn": "আগস্ট ২০২৪-এর পূর্বাঞ্চলের বন্যা"}},
    {"id": "ADM3_Birganj", "years": [2017],
     "event": {"en": "the August 2017 flood in the north-west, replanted after the water left",
               "bn": "আগস্ট ২০১৭-এর উত্তর-পশ্চিমের বন্যা, পানি নামার পর আবার রোপণ"}},
]
WIDESPREAD = 0.2          # a weak season in a fifth of the upazilas is a national year

HAOR_DISTRICTS = {"Sunamganj", "Netrakona", "Kishoreganj", "Habiganj", "Sylhet", "Maulvibazar", "Brahamanbaria"}
BORO_PEAK, MONSOON_MAX = 0.5, 0.4
MIN_KM2, MIN_SHARE = 10, 0.15
HINDCAST = RESEARCH / "floods" / "flash_flood_hindcast.csv"


def _mmdd(doy: float) -> str:
    d = date.fromordinal(date(2025, 1, 1).toordinal() + int(round(doy)) - 1)
    return f"{d.month:02d}-{d.day:02d}"


# ---------- the Aman record ----------
def aman_greenness(m_dates: list[date], series: np.ndarray) -> np.ndarray:
    """(years of BASE_YEARS, columns): the mean of each year's composites in WINDOW."""
    years = list(BASE_YEARS)
    a = np.full((len(years), series.shape[1]), np.nan)
    for j, y in enumerate(years):
        k = [i for i, d in enumerate(m_dates) if date(y, *WINDOW[0]) <= d <= date(y, *WINDOW[1])]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            a[j] = np.nanmean(series[k], axis=0)
    return a


def aman_record(m_dates: list[date], m_up: np.ndarray, ids: list[str], crop_km2: np.ndarray) -> tuple[dict, dict]:
    years = np.array(list(BASE_YEARS))
    a = aman_greenness(m_dates, m_up)
    _, resid = detrend(a, years.astype(float), float(years[-1]))
    with np.errstate(all="ignore"):
        mad = np.nanmedian(np.abs(resid - np.nanmedian(resid, axis=0)), axis=0) * 1.4826
        z = resid / np.maximum(mad, 0.005)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        level = np.nanmean(a, axis=0)
    weak = (z <= WEAK_Z) & (resid <= -WEAK_DROP) & (level >= AMAN_LEVEL)
    rows = {}
    for i, uid in enumerate(ids, start=1):
        if np.isfinite(z[:, i]).sum() < 20 or not level[i] >= AMAN_LEVEL:
            continue
        w = sorted((float(z[j, i]), int(years[j]), float(resid[j, i])) for j in np.where(weak[:, i])[0])
        rows[uid] = {"seasons": int(np.isfinite(z[:, i]).sum()),
                     "weak": [[y, round(zz, 1), round(dd, 3)] for zz, y, dd in w]}
    farm = (np.asarray(crop_km2) >= 20) & (level >= AMAN_LEVEL)    # farm upazilas that grow Aman
    share = {int(y): round(float(weak[j, farm].mean()), 2) for j, y in enumerate(years)}
    checks = []
    for c in CHECKS:
        i = ids.index(c["id"]) + 1
        got = {str(y): round(float(z[list(years).index(y), i]), 1) for y in c["years"]}
        checks.append({**c, "name": c["id"].replace("ADM3_", ""), "z": got,
                       "caught": all(bool(weak[list(years).index(y), i]) for y in c["years"])})
    summary = {"seasons": f"{years[0]}-{years[-1]}", "window": "%02d-%02d to %02d-%02d" % (*WINDOW[0], *WINDOW[1]),
               "weakZ": WEAK_Z, "weakDrop": WEAK_DROP, "minLevel": AMAN_LEVEL, "weakShareByYear": share,
               "widespread": [y for y, s in share.items() if s >= WIDESPREAD], "checks": checks}
    return rows, summary


# ---------- the haor's Boro ----------
def _cells_in(grid: Grid, districts: set[str]) -> np.ndarray:
    dist = np.array([""] + [p["district"] for p in grid.places])
    return np.unique(grid.pair_k[np.isin(dist[grid.pair_u], list(districts))])


def boro_harvest(grid: Grid, m_dates: list[date], m_cube: np.ndarray) -> tuple[dict, dict]:
    years = list(BASE_YEARS)
    cells = _cells_in(grid, HAOR_DISTRICTS)
    peak = np.full((len(years), len(cells)), np.nan, np.float32)
    cut = np.full_like(peak, np.nan)
    monsoon = np.full_like(peak, np.nan)
    for c0, idx, sm in _eight_day(m_dates, m_cube[:, cells]):
        n = sm.shape[1]
        cols = np.arange(n)
        for j, y in enumerate(years):
            lo, hi = idx.searchsorted(pd.Timestamp(y, 1, 15)), idx.searchsorted(pd.Timestamp(y, 6, 30))
            if hi >= len(idx):
                continue
            seg = sm[lo:hi + 1]
            top = idx.searchsorted(pd.Timestamp(y, 4, 15)) - lo          # the Boro peak comes by mid-April
            a = np.where(np.isnan(seg[:top + 1]), -9, seg[:top + 1])
            pk, p = a.argmax(0), a.max(0)
            segf = np.where(np.isnan(seg), 9, seg)
            steps = np.arange(seg.shape[0])[:, None]
            after = (steps > pk) & (steps <= pk + 10)
            trough = np.where(after, segf, 9).min(0)
            ok = (p >= BORO_PEAK) & (p - trough >= 0.15)
            half = p - 0.5 * (p - trough)
            below = after & (segf <= half)
            s = np.where(below.any(0), below.argmax(0), -1)
            prev, cur = seg[np.clip(s - 1, 0, None), cols], seg[np.clip(s, 0, None), cols]
            with np.errstate(all="ignore"):
                f = np.clip((prev - half) / (prev - cur), 0, 1)
            day = (idx[lo] - pd.Timestamp(y, 1, 1)).days + 1 + (s - 1 + f) * 8
            peak[j, c0:c0 + n] = np.where(ok, p, np.nan)
            cut[j, c0:c0 + n] = np.where(ok & (s > 0), day, np.nan)
            m = (idx >= pd.Timestamp(y, 8, 1)) & (idx <= pd.Timestamp(y, 10, 31))
            with np.errstate(all="ignore"), warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                monsoon[j, c0:c0 + n] = np.nanmax(np.where(m[:, None], sm, np.nan), axis=0)
    with np.errstate(all="ignore"):
        seen = np.isfinite(peak) | np.isfinite(monsoon)
        boro_only = ((np.nansum(peak >= BORO_PEAK, 0) >= 0.5 * seen.sum(0))
                     & (np.nansum(monsoon < MONSOON_MAX, 0) >= 0.5 * np.isfinite(monsoon).sum(0)) & (seen.sum(0) >= 15))

    hind = pd.read_csv(HINDCAST)
    burst = {int(r.year): r.first_burst_100mm[5:10] for r in hind.itertuples() if isinstance(r.first_burst_100mm, str)}
    flood_years = [int(y) for y in hind.loc[hind.flash_flood == 1, "year"]]
    normal = [j for j, y in enumerate(years) if y not in flood_years]

    pos = {c: k for k, c in enumerate(cells)}
    dist = np.array([""] + [p["district"] for p in grid.places])
    rows = {}
    for u in np.unique(grid.pair_u[np.isin(dist[grid.pair_u], list(HAOR_DISTRICTS))]):
        sel = grid.pair_u == u
        ks = np.array([pos[c] for c in grid.pair_k[sel]])
        w = grid.pair_w[sel] * boro_only[ks]
        share = float(w.sum() / grid.pair_w[sel].sum())
        km2 = share * float(grid.crop_km2[u])
        if km2 < MIN_KM2 or share < MIN_SHARE:
            continue
        by_year = {}
        for j, y in enumerate(years):
            v = cut[j, ks]
            ok = np.isfinite(v) & (w > 0)
            if w[ok].sum() >= 0.25 * w.sum():
                by_year[y] = float(np.average(v[ok], weights=w[ok]))
        usual = [by_year[years[j]] for j in normal if years[j] in by_year]
        if len(usual) < 12:
            continue
        half = float(np.median(usual))
        ys = np.array([y for y in by_year if y not in flood_years], float)
        vs = np.array([by_year[int(y)] for y in ys])
        slope = stats.theilslopes(vs, ys)[0] * 10
        p = stats.kendalltau(ys, vs).pvalue
        floods = []
        for y in flood_years:
            if y in by_year:
                floods.append({"year": y, "burst": burst.get(y), "early": int(round(half - by_year[y]))})
        rows[grid.places[u - 1]["id"]] = {
            "km2": round(km2), "share": round(share, 2), "half": _mmdd(half),
            "byYear": {str(y): _mmdd(d) for y, d in by_year.items()},
            "trend": {"daysPerDecade": round(float(slope), 1), "p": round(float(p), 3)}, "floods": floods}
    summary = {"districts": sorted(HAOR_DISTRICTS), "boroPeak": BORO_PEAK, "monsoonMax": MONSOON_MAX,
               "minKm2": MIN_KM2, "minShare": MIN_SHARE, "floodYears": flood_years, "burstMm": 100,
               "upazilas": len(rows)}
    return rows, summary
