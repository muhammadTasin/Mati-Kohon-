"""The field-conditions grid: one 1 km grid over Bangladesh that every satellite product is brought onto, and where the
cropland is, so that each upazila is described by its fields and not by its towns, rivers or homestead trees.

  1 km grid  : the MODIS/VIIRS 1 km sinusoidal products as NASA AppEEARS delivers them in lon/lat (1/120 degree,
               565 x 733 cells from 88.0 E, 26.7083 N); every product is read on, or resampled to, this grid.
  100 m grid : ten by ten inside each 1 km cell (1/1200 degree), where ESA WorldCover 2021 (10 m) is counted:
               the share of each 100 m pixel that is cropland (class 40), open water (80) and built-up land (50).
  upazilas   : the dashboard's own 544 upazila outlines (apps/saao-dashboard/public/data/bd_upazilas.geojson),
               burnt into the 100 m grid, so a 1 km cell on a border is shared by its upazilas by their cropland.

Each upazila is then a list of (1 km cell, weight) pairs, the weight being the cropland inside the cell that belongs to
the upazila (in 100 m pixels' worth, 0-100). Every upazila figure in field_conditions.json is a weighted mean over
those pairs. Built once and cached in <src>/cache/ (a few hundred MB of WorldCover reading, a minute or two).

The downloads live outside git: research/acquire/grid_downloads.py writes them to research/data/grid/ (or point
EDEN_GRID_DIR at another copy).
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import rasterio
from rasterio import features
from rasterio.transform import Affine

RESEARCH = Path(__file__).resolve().parents[1]
REPO = RESEARCH.parent
GEOJSON = REPO / "apps" / "saao-dashboard" / "public" / "data" / "bd_upazilas.geojson"
ENGINE_DATA = REPO / "packages" / "rotation-engine" / "src" / "data"

RES = 1 / 120            # the 1 km grid, degrees
FINE = 10                # 100 m pixels per 1 km cell, each way
LON0, LAT0 = 88.0, 26.708333333333332
W, H = 565, 733
T1 = Affine(RES, 0, LON0, 0, -RES, LAT0)
T100 = Affine(RES / FINE, 0, LON0, 0, -RES / FINE, LAT0)

WC_CROP, WC_WATER, WC_BUILT = 40, 80, 50


def src_dir() -> Path:
    return Path(os.environ.get("EDEN_GRID_DIR", RESEARCH / "data" / "grid"))


def cache_dir() -> Path:
    p = src_dir() / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p


def doy_date(name: str) -> date:
    """The composite's first day from an AppEEARS file name ('..._doy2026281000000_aid0001.tif' -> 2026-10-08)."""
    m = re.search(r"doy(\d{4})(\d{3})", name)
    return date(int(m.group(1)), 1, 1) + timedelta(days=int(m.group(2)) - 1)


def upazilas() -> list[dict]:
    g = json.loads(GEOJSON.read_text(encoding="utf-8"))
    return [{"id": f["properties"]["id"], "name": f["properties"]["name"], "district": f["properties"]["district"],
             "geometry": f["geometry"]} for f in g["features"]]


def _worldcover_fractions() -> dict[str, np.ndarray]:
    """Share (0-100) of each 100 m pixel that is cropland, water and built-up land, from the 10 m WorldCover tiles."""
    out = {k: np.zeros((H * FINE, W * FINE), np.uint8) for k in ("crop", "water", "built")}
    tiles = sorted((src_dir() / "worldcover").glob("ESA_WorldCover_10m_2021_v200_*_Map.tif"))
    if not tiles:
        raise SystemExit(f"No WorldCover tiles in {src_dir() / 'worldcover'} (run research/acquire/grid_downloads.py)")
    for tif in tiles:
        with rasterio.open(tif) as r:
            # the tile's 10 m pixels that fall inside the 100 m grid, in whole 100 m blocks (both grids share corners)
            west, north = r.transform.c, r.transform.f
            c0 = round((LON0 - west) / r.transform.a)          # 10 m column of the grid's west edge in this tile
            r0 = round((north - LAT0) / -r.transform.e)         # 10 m row of the grid's north edge in this tile
            gc0, gr0 = max(0, -c0) // 10, max(0, -r0) // 10     # where the tile starts in the 100 m grid
            tc0, tr0 = max(0, c0), max(0, r0)                   # where the grid starts in the tile
            ncols = min(r.width - tc0, (W * FINE - gc0) * 10) // 10 * 10
            nrows = min(r.height - tr0, (H * FINE - gr0) * 10) // 10 * 10
            if ncols <= 0 or nrows <= 0:
                continue
            step = 2000  # 10 m rows per read (200 rows of 100 m)
            for y in range(0, nrows, step):
                rows = min(step, nrows - y)
                a = r.read(1, window=((tr0 + y, tr0 + y + rows), (tc0, tc0 + ncols)))
                for key, cls in (("crop", WC_CROP), ("water", WC_WATER), ("built", WC_BUILT)):
                    frac = (a == cls).reshape(rows // 10, 10, ncols // 10, 10).sum(axis=(1, 3), dtype=np.uint16)
                    out[key][gr0 + y // 10: gr0 + (y + rows) // 10, gc0: gc0 + ncols // 10] = frac.astype(np.uint8)
        print("worldcover", tif.name)
    return out


def _upazila_raster(places: list[dict]) -> np.ndarray:
    """Upazila number (1-544, 0 outside) of every 100 m pixel, by its centre."""
    shapes = [(p["geometry"], i + 1) for i, p in enumerate(places)]
    return features.rasterize(shapes, out_shape=(H * FINE, W * FINE), transform=T100, fill=0, dtype="int16")


@dataclass
class Grid:
    places: list[dict]
    crop100: np.ndarray          # (H*10, W*10) uint8, % cropland of each 100 m pixel
    water100: np.ndarray
    built100: np.ndarray
    upz100: np.ndarray           # (H*10, W*10) int16, upazila number
    cells: np.ndarray            # 1 km cells holding cropland (flat index row*W+col), sorted
    pair_u: np.ndarray           # (n,) upazila number of each (upazila, cell) pair
    pair_k: np.ndarray           # (n,) position of the pair's cell in `cells`
    pair_w: np.ndarray           # (n,) cropland weight (in 100 m pixels' worth)
    area_km2: np.ndarray         # (544+1,) upazila area
    crop_km2: np.ndarray         # (544+1,) upazila cropland

    def per_upazila(self, values: np.ndarray, valid: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Cropland-weighted mean of a per-cell value (shape (..., len(cells))) for every upazila, and the share of the
        upazila's cropland that had a valid value. Returns arrays of shape (..., 545); index 0 is unused."""
        v = values[..., self.pair_k]
        ok = np.isfinite(v) if valid is None else (valid[..., self.pair_k] & np.isfinite(v))
        w = np.where(ok, self.pair_w, 0.0)
        n = len(self.places) + 1
        flat_w = w.reshape(-1, w.shape[-1])
        flat_v = np.where(ok, v, 0.0).reshape(-1, v.shape[-1])
        num = np.zeros((flat_w.shape[0], n))
        den = np.zeros((flat_w.shape[0], n))
        total = np.bincount(self.pair_u, weights=self.pair_w, minlength=n)
        for i in range(flat_w.shape[0]):
            num[i] = np.bincount(self.pair_u, weights=flat_w[i] * flat_v[i], minlength=n)
            den[i] = np.bincount(self.pair_u, weights=flat_w[i], minlength=n)
        with np.errstate(invalid="ignore", divide="ignore"):
            mean = num / den
            seen = den / np.where(total > 0, total, np.nan)
        shape = values.shape[:-1] + (n,)
        return mean.reshape(shape), seen.reshape(shape)


def load_grid() -> Grid:
    path = cache_dir() / "grid_v1.npz"
    places = upazilas()
    if path.exists():
        z = np.load(path)
        return Grid(places, *(z[k] for k in ("crop100", "water100", "built100", "upz100", "cells", "pair_u", "pair_k",
                                               "pair_w", "area_km2", "crop_km2")))
    frac = _worldcover_fractions()
    upz = _upazila_raster(places)
    # the (upazila, 1 km cell) pairs and their cropland
    rr, cc = np.nonzero((frac["crop"] > 0) & (upz > 0))
    keys = upz[rr, cc].astype(np.int64) * (W * H) + (rr // FINE) * W + (cc // FINE)
    uniq, inv = np.unique(keys, return_inverse=True)
    weight = np.bincount(inv, weights=frac["crop"][rr, cc] / 100.0)
    pair_u = (uniq // (W * H)).astype(np.int32)
    cell = (uniq % (W * H)).astype(np.int64)
    cells, pair_k = np.unique(cell, return_inverse=True)
    # areas: a 100 m pixel is (1/1200 degree)^2, narrower to the north
    lat = LAT0 - (np.arange(H * FINE) + 0.5) * RES / FINE
    px_km2 = (111.32 * np.cos(np.radians(lat)) / 1200) * (110.57 / 1200)
    n = len(places) + 1
    area = np.bincount(upz.ravel(), weights=np.broadcast_to(px_km2[:, None], upz.shape).ravel(), minlength=n)
    crop = np.bincount(upz.ravel(), weights=(frac["crop"] / 100.0 * px_km2[:, None]).ravel(), minlength=n)
    np.savez_compressed(path, crop100=frac["crop"], water100=frac["water"], built100=frac["built"], upz100=upz,
                        cells=cells, pair_u=pair_u, pair_k=pair_k.astype(np.int32), pair_w=weight,
                        area_km2=area, crop_km2=crop)
    return load_grid()
