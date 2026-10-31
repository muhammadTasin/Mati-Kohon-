"""The fields' soil texture and how much water the topsoil holds for a crop, from ISRIC SoilGrids 2.0.

Source: SoilGrids 250 m (WCS, lon/lat): clay and sand (g/kg) and organic carbon (dg/kg) at 0-5, 5-15 and 15-30 cm,
averaged onto the 1 km grid and then over the upazila's cropland, 0-30 cm weighted by layer thickness.

Plant-available water (field capacity minus wilting point) is the Saxton & Rawls (2006) pedotransfer function from
sand, clay and organic matter (organic carbon x 1.724). It says how long a crop sown on stored moisture (lentil,
grass pea or mustard after Aman) can go without rain or irrigation. SoilGrids is a global model, so this is context
beside the SRDI soil tests (which stay the source of pH, organic matter classes and fertilizer), not a test result.
"""
from __future__ import annotations

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

from _grid import H, T1, W, Grid, src_dir

DEPTHS = (("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15))


def _layer(prop: str) -> np.ndarray:
    """The property's 0-30 cm thickness-weighted mean on the 1 km grid (NaN where SoilGrids has no soil)."""
    total = np.zeros((H, W))
    weight = np.zeros((H, W))
    for depth, cm in DEPTHS:
        with rasterio.open(src_dir() / "soilgrids" / f"{prop}_{depth}_mean.tif") as r:
            dst = np.zeros((H, W), np.float32)
            reproject(r.read(1).astype(np.float32), dst, src_transform=r.transform, src_crs=r.crs, src_nodata=0,
                      dst_transform=T1, dst_crs="EPSG:4326", dst_nodata=0, resampling=Resampling.average)
        ok = dst > 0
        total[ok] += dst[ok] * cm
        weight[ok] += cm
    with np.errstate(invalid="ignore"):
        return np.where(weight > 0, total / weight, np.nan)


def saxton_rawls_awc(sand: np.ndarray, clay: np.ndarray, om: np.ndarray) -> np.ndarray:
    """Plant-available water (m3/m3) from sand and clay (fractions) and organic matter (% by weight)."""
    s, c = sand, clay
    t1500 = -0.024 * s + 0.487 * c + 0.006 * om + 0.005 * s * om - 0.013 * c * om + 0.068 * s * c + 0.031
    w1500 = t1500 + (0.14 * t1500 - 0.02)
    t33 = -0.251 * s + 0.195 * c + 0.011 * om + 0.006 * s * om - 0.027 * c * om + 0.452 * s * c + 0.299
    w33 = t33 + (1.283 * t33 ** 2 - 0.374 * t33 - 0.015)
    return np.clip(w33 - w1500, 0.02, 0.35)


def usda_texture(sand: float, silt: float, clay: float) -> str:
    if silt + 1.5 * clay < 15:
        return "sand"
    if silt + 2 * clay < 30:
        return "loamy sand"
    if clay >= 40:
        return "silty clay" if silt >= 40 else ("sandy clay" if sand > 45 else "clay")
    if clay >= 35 and sand > 45:
        return "sandy clay"
    if clay >= 27:
        return "clay loam" if sand > 20 else "silty clay loam"
    if clay >= 20 and silt < 28 and sand > 45:
        return "sandy clay loam"
    if silt >= 80 and clay < 12:
        return "silt"
    if silt >= 50:
        return "silt loam"
    if clay >= 7 and silt >= 28 and sand <= 52:
        return "loam"
    return "sandy loam"


def soils(grid: Grid) -> dict:
    rows, cols = np.divmod(grid.cells, W)
    sand = _layer("sand")[rows, cols] / 10            # %
    clay = _layer("clay")[rows, cols] / 10
    soc = _layer("soc")[rows, cols] / 10              # g/kg
    om = soc * 1.724 / 10                             # %
    awc = saxton_rawls_awc(sand / 100, clay / 100, om)
    stack = np.stack([sand, clay, soc, awc])
    mean, seen = grid.per_upazila(stack)
    out = {}
    for i, p in enumerate(grid.places, start=1):
        if not np.isfinite(mean[0, i]) or seen[0, i] < 0.5:
            continue
        sa, cl = float(mean[0, i]), float(mean[1, i])
        si = max(0.0, 100 - sa - cl)
        out[p["id"]] = {"sand": round(sa), "silt": round(si), "clay": round(cl),
                        "texture": usda_texture(sa, si, cl),
                        "awcMm30": round(float(mean[3, i]) * 300),     # mm held in the top 30 cm
                        "socGkg": round(float(mean[2, i]), 1)}
    return out
