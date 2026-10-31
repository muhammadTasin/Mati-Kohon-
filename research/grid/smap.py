"""NASA SMAP enhanced 9 km soil moisture (SPL3SMP_E) over each upazila's cropland, read to test whether SMAP can say
"the topsoil is wetter or drier than usual this week" before the winter sowing. It cannot yet; the tests are in
research/grid/checks.py (smapCheck in research/pilots/field_grid_checks.json), and the app does not use this reading.

  Source : SPL3SMP_E.006 through NASA AppEEARS (research/acquire/grid_downloads.py, three date ranges from April 2015),
           the 6 am (descending) and 6 pm (ascending) passes on a 0.08 degree lon/lat grid (EASE-Grid 2.0 9 km).
           A retrieval counts when NASA's quality flag says it succeeded (bit 2 clear); "recommended quality" (bit 0)
           also drops every pixel with dense vegetation or open water, which in the monsoon is most of Bangladesh.
  Upazila: each 1 km cropland cell of the grid (_grid.py) falls in one SMAP pixel, so an upazila's day is the mean of
           its SMAP pixels weighted by the cropland it has in each, taken when half of that cropland was seen.
"""
from __future__ import annotations

from datetime import date

import numpy as np
import rasterio

from _grid import RES, LAT0, LON0, W, Grid, cache_dir, doy_date, src_dir

FOLDERS = ("smap_spl3smp_e_2015", "smap_spl3smp_e_2019", "smap_spl3smp_e_2023")
PASSES = {"am": ("AM_soil_moisture", "AM_retrieval_qual_flag"), "pm": ("PM_soil_moisture_pm", "PM_retrieval_qual_flag_pm")}
MIN_SEEN = 0.5
MIN_PASSES = 3


def _files(layer: str) -> dict[date, str]:
    out = {}
    for folder in FOLDERS:
        for p in (src_dir() / folder).glob(f"*/*_{layer}_doy*.tif"):
            out[doy_date(p.name)] = str(p)
    return out


def _weights(grid: Grid, transform, shape) -> np.ndarray:
    """(545, SMAP pixels): the cropland weight each upazila has in each SMAP pixel."""
    row, col = np.divmod(grid.cells, W)
    lon, lat = LON0 + (col + 0.5) * RES, LAT0 - (row + 0.5) * RES
    c, r = ~transform * (lon, lat)
    pix = np.floor(r).astype(int) * shape[1] + np.floor(c).astype(int)
    m = np.zeros((len(grid.places) + 1, shape[0] * shape[1]))
    np.add.at(m, (grid.pair_u, pix[grid.pair_k]), grid.pair_w)
    return m


def load(grid: Grid) -> tuple[list[date], dict[str, np.ndarray]]:
    """Every day with a SMAP file: (dates, {pass: (days, 545) m3/m3, NaN where under half the cropland was seen})."""
    sm = {k: _files(v[0]) for k, v in PASSES.items()}
    qf = {k: _files(v[1]) for k, v in PASSES.items()}
    dates = sorted(set(sm["am"]) | set(sm["pm"]))
    cache = cache_dir() / "smap_v1.npz"
    if cache.exists():
        z = np.load(cache)
        if list(z["dates"]) == [d.isoformat() for d in dates]:
            return dates, {k: z[f"v_{k}"] for k in PASSES}
    with rasterio.open(next(iter(sm["am"].values()))) as r:
        m = _weights(grid, r.transform, r.shape)
    total = m.sum(1)
    val = {k: np.full((len(dates), m.shape[0]), np.nan, np.float32) for k in PASSES}
    for i, d in enumerate(dates):
        for k in PASSES:
            if d not in sm[k] or d not in qf[k]:
                continue
            with rasterio.open(sm[k][d]) as r:
                v = r.read(1).ravel().astype(np.float64)
            with rasterio.open(qf[k][d]) as r:
                q = r.read(1).ravel()
            ok = (v >= 0) & (v <= 0.7) & ((q & 4) == 0) & (q != 65534)
            num, den = m @ np.where(ok, v, 0.0), m @ ok.astype(np.float64)
            with np.errstate(invalid="ignore", divide="ignore"):
                val[k][i] = np.where(den / total >= MIN_SEEN, num / den, np.nan)
    np.savez(cache, dates=np.array([d.isoformat() for d in dates]), **{f"v_{k}": val[k] for k in PASSES})
    print("smap", len(dates), "days,", dates[0], "to", dates[-1])
    return dates, val


def window(dates: list[date], val: dict[str, np.ndarray], start: date, end: date) -> np.ndarray:
    """Mean of every pass from `start` to `end` per upazila; NaN where fewer than MIN_PASSES."""
    sel = np.array([start <= d <= end for d in dates])
    stack = np.concatenate([val[k][sel] for k in PASSES])
    n = np.isfinite(stack).sum(0)
    with np.errstate(all="ignore"):
        return np.where(n >= MIN_PASSES, np.nanmean(stack, 0), np.nan)
