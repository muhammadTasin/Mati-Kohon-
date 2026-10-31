"""Boro-season water stress from NASA ECOSTRESS: where green fields were short of water.

Source: ECO_L4T_ESI.002, the evaporative stress index (actual / potential evapotranspiration, PT-JPL), 70 m, every
ECOSTRESS pass over Bangladesh in January-April 2025 and 2026 (NASA AppEEARS, lon/lat).

ESI near 1 means a field evaporates as much as the weather asks (a flooded Boro field, a well-watered crop); a low ESI
on a field that is green means the crop is thirsty: its roots cannot find the water the air is pulling. Bare land is
always "dry", so only green cropland counts:
  cropland : the 70 m pixel's 100 m WorldCover cell is half or more cropland (_grid.py)
  green    : the 1 km cell's NDVI in the 16-day composite covering the pass is 0.50 or more (VIIRS, else MODIS)
  thirsty  : ESI below 0.40 (the crop evaporates under 40% of what it could)
Only daytime passes count (9:00 to 15:30 local solar time, UTC + 6 h): ECOSTRESS crosses at every hour, and in the
early morning or the evening the air asks for so little water that the index says little. Exact zeros are dropped
(ECOSTRESS writes them where the retrieval failed).

ECOSTRESS sees a place on only a few clear daytime passes a season, so the figure pools March and April, when Boro is
heading and the groundwater is lowest, over both seasons: the share of green cropland pixels that were thirsty, with
the passes and the green area it rests on. Each season's own share is kept beside it when that season saw enough.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, timedelta

import numpy as np
import rasterio

from _grid import FINE, LAT0, LON0, RES, W, Grid, src_dir

GREEN, THIRSTY = 0.50, 0.40
MONTHS = (3, 4)            # the hot, dry end of the Boro season
DAYTIME = (9.0, 15.5)       # local solar hours
PX_KM2 = 0.0045             # one 70 m pixel
MIN_PASS_PX = 50            # a pass counts for an upazila when it saw this much of its green cropland
MIN_PX = 1000               # about 4.5 km2 of green cropland seen, or no figure


def _pass_time(name: str) -> tuple[date, float]:
    """The pass's date and local solar hour ('..._doy2025020082004_...': 20 Jan 2025, 08:20 UTC, 14.3 h)."""
    m = re.search(r"doy(\d{4})(\d{3})(\d{2})(\d{2})", name)
    d = date(int(m.group(1)), 1, 1) + timedelta(days=int(m.group(2)) - 1)
    return d, (int(m.group(3)) + int(m.group(4)) / 60 + 6) % 24


def boro_thirst(grid: Grid, ndvi_sources: list[tuple[list[date], np.ndarray]]) -> tuple[dict, dict]:
    """{upazila id: {share, esi, greenKm2, passes (dates), years}}, and a summary of what was read. `ndvi_sources` in
    order of preference."""
    files = sorted((src_dir()).glob("ecostress_esi_*/*/*_ESI_doy*.tif"))
    n_up = len(grid.places) + 1
    acc = defaultdict(lambda: np.zeros((3, n_up)))      # year -> [green px, thirsty px, sum ESI on green]
    pass_dates = defaultdict(list)                       # upazila number -> dates of the passes that saw it
    scenes = defaultdict(set)
    used = 0
    for tif in files:
        d, hour = _pass_time(tif.name)
        if d.month not in MONTHS or not DAYTIME[0] <= hour < DAYTIME[1]:
            continue
        with rasterio.open(tif) as r:
            a = r.read(1)
            t = r.transform
        ok = np.isfinite(a) & (a > 0) & (a <= 1)
        if not ok.any():
            continue
        ii, jj = np.nonzero(ok)
        lon = t.c + (jj + 0.5) * t.a
        lat = t.f + (ii + 0.5) * t.e
        c100 = np.floor((lon - LON0) / (RES / FINE)).astype(np.int64)
        r100 = np.floor((LAT0 - lat) / (RES / FINE)).astype(np.int64)
        inside = (c100 >= 0) & (c100 < W * FINE) & (r100 >= 0) & (r100 < grid.crop100.shape[0])
        c100, r100, esi = c100[inside], r100[inside], a[ii[inside], jj[inside]]
        crop = grid.crop100[r100, c100] >= 50
        upz = grid.upz100[r100, c100]
        keep = crop & (upz > 0)
        c100, r100, esi, upz = c100[keep], r100[keep], esi[keep], upz[keep]
        if not len(esi):
            continue
        cell = (r100 // FINE) * W + (c100 // FINE)
        pos = np.searchsorted(grid.cells, cell)
        pos = np.clip(pos, 0, len(grid.cells) - 1)
        has_cell = grid.cells[pos] == cell
        nd = np.full(len(esi), np.nan, np.float32)
        for dates, cube in ndvi_sources:  # the composite whose 16 days hold the pass, latest start first
            cands = [k for k, s in enumerate(dates) if s <= d <= s + timedelta(days=15)]
            if not cands:
                continue
            v = cube[cands[-1]][pos]
            fill = np.isnan(nd) & has_cell
            nd[fill] = v[fill]
        green = nd >= GREEN
        if not green.any():
            continue
        u = upz[green].astype(np.int64)
        e = esi[green]
        seen = np.bincount(u, minlength=n_up)
        acc[d.year][0] += seen
        acc[d.year][1] += np.bincount(u, weights=(e < THIRSTY).astype(float), minlength=n_up)
        acc[d.year][2] += np.bincount(u, weights=e, minlength=n_up)
        for u_seen in np.nonzero(seen >= MIN_PASS_PX)[0]:
            pass_dates[int(u_seen)].append(d.isoformat())
        scenes[f"{d.year}-{d.month:02d}"].add(tif.name.split("_aid")[0])
        used += 1
    out: dict[str, dict] = {}
    years = sorted(acc)
    pooled = sum(acc.values())
    for i, p in enumerate(grid.places, start=1):
        if pooled[0, i] < MIN_PX:
            continue
        out[p["id"]] = {
            "share": round(float(pooled[1, i] / pooled[0, i]), 3),
            "esi": round(float(pooled[2, i] / pooled[0, i]), 2),
            "greenKm2": round(float(pooled[0, i] * PX_KM2), 1),
            "passes": sorted(set(pass_dates[i])),
            "years": {str(y): round(float(acc[y][1, i] / acc[y][0, i]), 3) for y in years if acc[y][0, i] >= MIN_PX},
        }
    summary = {"passes": used, "years": years, "months": list(MONTHS),
               "passesByMonth": {k: len(v) for k, v in sorted(scenes.items())}}
    return out, summary
