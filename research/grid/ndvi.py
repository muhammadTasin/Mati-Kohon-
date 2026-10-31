"""Greenness (NDVI) on the cropland grid: how this season's crops compare with 25 years, how many crops a year the land
carries, and when it stands empty.

Sources (NASA AppEEARS, 1 km, 16-day composites, lon/lat):
  MOD13A2.061  Terra MODIS, 2001 to today: the 25-season baseline. A pixel counts when its pixel reliability is
               0 (good) or 1 (marginal), as in the pilots (MODLAND QA bits of VI_Quality if reliability is missing).
  VJ113A2.002  NOAA-20 VIIRS, 2023 to today (composites every 8 days): MODIS's successor, which carries the record on
               as Terra ends. Reliability 0-3 (excellent to marginal) counts. Each upazila's VIIRS values are put on
               the MODIS scale by a straight line fitted on the dates both sensors share (2023-2026); where an upazila
               has too few shared dates, or the fit is poor, the line fitted on all upazilas together is used.

Everything is a cropland-weighted mean over the upazila's 1 km cells (_grid.py), so towns, rivers and homestead trees
no longer pull the numbers about as the old single pixel at the upazila's centre did.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import rasterio
from scipy import signal

from _grid import Grid, cache_dir, doy_date, src_dir

BASE_YEARS = range(2001, 2026)          # the baseline the season is compared with (its 25-year trend taken out)
CYCLE_YEARS = range(2001, 2025)         # complete agricultural years, November 2001 to October 2025
EARLY, RECENT = range(2001, 2006), range(2020, 2025)   # 2001-02 to 2005-06 against 2020-21 to 2024-25
GAP_YEARS = range(2016, 2026)           # the last ten summers, for the empty-field window
GAP_WINDOW = ((3, 1), (7, 15))          # after the winter crop's harvest, before Aman is transplanted
BARE_NDVI = 0.35                        # below this the land is bare, flooded or just planted (glossary)
WINTER_CROP_NDVI = 0.50
MIN_SEEN = 0.25                         # an upazila value needs a quarter of its cropland seen through the clouds


# ---------- reading ----------
def _files(folder: str, band: str) -> dict[date, str]:
    return {doy_date(p.name): str(p) for p in (src_dir() / folder).glob(f"*/*{band}_doy*.tif")}


def load_cube(grid: Grid, product: str) -> tuple[list[date], np.ndarray]:
    """(dates, NDVI) for the grid's cropland cells; NaN where the pixel is cloudy, snow or missing."""
    cache = cache_dir() / f"ndvi_{product}_v1.npz"
    if product == "modis":
        nd = _files("mod13a2_ndvi", "_1_km_16_days_NDVI")
        rel = _files("mod13a2_ndvi", "_1_km_16_days_pixel_reliability")
        vq = _files("mod13a2_ndvi", "_1_km_16_days_VI_Quality")
        ok_rel, fill = (0, 1), -3000
    else:
        nd = _files("viirs_vj113a2_ndvi", "1_km_16_days_NDVI")
        rel = _files("viirs_vj113a2_ndvi", "1_km_16_days_pixel_reliability")
        vq, ok_rel, fill = {}, (0, 1, 2, 3), -15000
    dates = sorted(d for d in nd if d in rel or d in vq)
    if cache.exists():
        z = np.load(cache)
        if len(z["dates"]) == len(dates):
            raw = z["ndvi"]
            return [date.fromisoformat(s) for s in z["dates"]], np.where(raw == -32768, np.nan, raw.astype(np.float32) / 10000)
    rows, cols = np.divmod(grid.cells, 565)
    out = np.full((len(dates), len(grid.cells)), -32768, np.int16)
    for i, d in enumerate(dates):
        with rasterio.open(nd[d]) as r:
            v = r.read(1)[rows, cols]
        if d in rel:
            with rasterio.open(rel[d]) as r:
                q = r.read(1)[rows, cols]
            good = np.isin(q, ok_rel)
        else:  # MODLAND QA, bits 0-1: 00 good, 01 check other QA
            with rasterio.open(vq[d]) as r:
                q = r.read(1)[rows, cols].astype(np.int32)
            good = (q & 3) <= 1
        good &= (v != fill) & (v >= -2000) & (v <= 10000)
        out[i] = np.where(good, v, -32768)
    np.savez(cache, dates=np.array([d.isoformat() for d in dates]), ndvi=out)
    print(product, len(dates), "composites,", dates[0], "to", dates[-1])
    return dates, np.where(out == -32768, np.nan, out.astype(np.float32) / 10000)


# ---------- per upazila ----------
def upazila_series(grid: Grid, cube: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mean, seen = grid.per_upazila(cube)
    mean[seen < MIN_SEEN] = np.nan
    return mean, seen


def harmonise(m_dates, m_up, v_dates, v_up) -> tuple[np.ndarray, dict]:
    """VIIRS upazila values put on the MODIS scale: per upazila where 20+ shared dates fit with r >= 0.8, else pooled."""
    shared = [(m_dates.index(d), i) for i, d in enumerate(v_dates) if d in m_dates]
    mi, vi = np.array([s[0] for s in shared]), np.array([s[1] for s in shared])
    x, y = v_up[vi], m_up[mi]
    ok = np.isfinite(x) & np.isfinite(y)
    pooled = np.polyfit(x[ok], y[ok], 1)
    out = np.full_like(v_up, np.nan)
    own = 0
    for u in range(v_up.shape[1]):
        k = ok[:, u]
        a, b = pooled
        if k.sum() >= 20 and np.corrcoef(x[k, u], y[k, u])[0, 1] >= 0.8:
            a, b = np.polyfit(x[k, u], y[k, u], 1)
            own += 1
        out[:, u] = a * v_up[:, u] + b
    resid = (pooled[0] * x[ok] + pooled[1]) - y[ok]
    return out, {"sharedComposites": int(len(shared)), "pooledSlope": round(float(pooled[0]), 3),
                 "pooledIntercept": round(float(pooled[1]), 3), "pooledRmse": round(float(np.sqrt(np.mean(resid ** 2))), 3),
                 "upazilasWithOwnFit": own}


def _mid(d: date) -> date:
    return d + timedelta(days=8)


def year_values_at(m_dates: list[date], m_up: np.ndarray, day: date, years=BASE_YEARS) -> np.ndarray:
    """Each baseline year's value on this calendar day (linear between composites' middles): (years, upazilas)."""
    t = np.array([_mid(d).toordinal() for d in m_dates], float)
    out = np.full((len(years), m_up.shape[1]), np.nan)
    for j, y in enumerate(years):
        try:
            target = date(y, day.month, min(day.day, 28)).toordinal()
        except ValueError:
            continue
        hi = np.searchsorted(t, target)
        if hi == 0 or hi >= len(t) or t[hi] - t[hi - 1] > 40:
            continue
        f = (target - t[hi - 1]) / (t[hi] - t[hi - 1])
        out[j] = (1 - f) * m_up[hi - 1] + f * m_up[hi]
    return out


def detrend(vals: np.ndarray, years: np.ndarray, target: float) -> tuple[np.ndarray, np.ndarray]:
    """A straight-line trend through each column's years (NaN-aware least squares, 15 years or more): the value it
    expects in `target`, and each year's departure from the line. Fields have greened for 25 years, so a season is
    judged against what the trend expects now, not against the early 2000s."""
    ok = np.isfinite(vals)
    x = np.where(ok, years[:, None], 0.0)
    y = np.where(ok, vals, 0.0)
    n = ok.sum(0)
    sx, sy, sxx, sxy = x.sum(0), y.sum(0), (x * x).sum(0), (x * y).sum(0)
    with np.errstate(all="ignore"):
        slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
        icept = (sy - slope * sx) / n
    slope[n < 15] = np.nan
    expected = icept + slope * target
    resid = vals - (icept + slope * years[:, None])
    return expected, resid


# ---------- per cell: crops a year, winter greenness, the summer's empty fields ----------
def _eight_day(dates: list[date], cube: np.ndarray, chunk: int = 20000):
    """The 16-day series on an 8-day step, gaps up to 64 days filled, Savitzky-Golay smoothed (7, 2), in chunks."""
    idx = pd.date_range(dates[0], dates[-1], freq="8D")
    for c0 in range(0, cube.shape[1], chunk):
        df = pd.DataFrame(cube[:, c0:c0 + chunk], index=pd.DatetimeIndex(dates))
        s = df.reindex(df.index.union(idx)).interpolate(method="time", limit=8, limit_area="inside").reindex(idx)
        a = s.to_numpy(np.float32)
        filled = np.nan_to_num(pd.DataFrame(a).bfill().ffill().to_numpy(np.float32), nan=0.0)  # cells never seen
        sm = signal.savgol_filter(filled, 7, 2, axis=0).astype(np.float32)
        sm[np.isnan(a)] = np.nan
        yield c0, idx, sm


def cell_phenology(dates: list[date], cube: np.ndarray) -> dict[str, np.ndarray]:
    """For every cropland cell: crops in each agricultural year of BASE_YEARS and their early and recent means, the
    winter peak (early, recent), and per summer of GAP_YEARS the longest run of bare 8-day steps in GAP_WINDOW
    (start day, length in days)."""
    k = cube.shape[1]
    res = {key: np.full(k, np.nan, np.float32) for key in ("cyclesEarly", "cyclesRecent", "peakEarly", "peakRecent")}
    by_year = np.full((len(CYCLE_YEARS), k), np.nan, np.float32)
    gap_start = np.full((len(GAP_YEARS), k), np.nan, np.float32)
    gap_days = np.zeros((len(GAP_YEARS), k), np.float32)
    for c0, idx, sm in _eight_day(dates, cube):
        ag_year = np.where(idx.month >= 11, idx.year, idx.year - 1)
        winter = ((idx.month == 1) & (idx.day >= 15)) | (idx.month == 2) | ((idx.month == 3) & (idx.day <= 15))
        n = sm.shape[1]
        counts = np.full((len(CYCLE_YEARS), n), np.nan, np.float32)
        for j in range(n):
            col = sm[:, j]
            if np.isnan(col).mean() > 0.3:
                continue
            p, _ = signal.find_peaks(np.nan_to_num(col, nan=0.0), height=0.35, prominence=0.08, distance=6)
            yrs = ag_year[p] - CYCLE_YEARS[0]
            counts[:, j] = np.bincount(yrs[(yrs >= 0) & (yrs < len(CYCLE_YEARS))], minlength=len(CYCLE_YEARS))
        by_year[:, c0:c0 + n] = counts
        with np.errstate(all="ignore"):
            res["cyclesEarly"][c0:c0 + n] = np.nanmean(counts[[y - CYCLE_YEARS[0] for y in EARLY]], axis=0)
            res["cyclesRecent"][c0:c0 + n] = np.nanmean(counts[[y - CYCLE_YEARS[0] for y in RECENT]], axis=0)
        for key, years in (("peakEarly", EARLY), ("peakRecent", RECENT)):
            vals = []
            for y in years:  # the winter of agricultural year y is January-March of y+1
                m = winter & (idx.year == y + 1)
                with np.errstate(all="ignore"):
                    vals.append(np.nanmax(np.where(m[:, None], sm, np.nan), axis=0) if m.any() else np.full(n, np.nan))
            with np.errstate(all="ignore"):
                res[key][c0:c0 + n] = np.nanmean(vals, axis=0)
        for g, y in enumerate(GAP_YEARS):
            (m0, d0), (m1, d1) = GAP_WINDOW
            m = (idx >= pd.Timestamp(y, m0, d0)) & (idx <= pd.Timestamp(y, m1, d1))
            seg = sm[m]                      # (steps, n)
            days = idx[m]
            bare = seg < BARE_NDVI
            # the longest run of bare steps, per cell
            run = np.zeros(n, np.int32)
            best = np.zeros(n, np.int32)
            best_end = np.full(n, -1, np.int32)
            for s in range(bare.shape[0]):
                run = np.where(bare[s], run + 1, 0)
                better = run > best
                best = np.where(better, run, best)
                best_end = np.where(better, s, best_end)
            has = best >= 2
            start_step = np.where(has, best_end - best + 1, 0)
            doy = np.array([d.dayofyear for d in days])
            gap_start[g, c0:c0 + n] = np.where(has, doy[start_step], np.nan)
            gap_days[g, c0:c0 + n] = np.where(has, best * 8, 0)
        print("phenology", c0 + n, "of", k)
    res["gapStart"], res["gapDays"], res["cyclesByYear"] = gap_start, gap_days, by_year
    return res
