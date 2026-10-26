"""Land under flood water now from NASA-ISRO NISAR L-band radar, which sees through monsoon cloud, and how fast it drains.

NISAR's Level-2 geocoded backscatter (GCOV, PROVISIONAL release, ASF DAAC) is read on its frequency-B grid (80 m).
HH backscatter below -9 dB is open water. That threshold was set against OPERA DSWx-HLS on nearly the same days
(research/explore/nisar_calibration.py: 18 pairs at Khaliajuri, Itna, Tanore, Paikgachha and Batiaghata, 29 September
to 23 October 2026, within 2 days): the two agree on 83% of 1.6 million pixels (kappa 0.67), and on haor water the
shares match within 2 points. Ponds smaller than the 80 m grid and water under a standing crop read as land, so on the
coast NISAR counts about 13 points less water than OPERA. Frames without HH (VV modes) are skipped.

Flood is defined as in flood_now.py: water now on land that is not lasting water (water in both December 2025 and
February 2026 in OPERA DSWx-HLS), as a share of the land seen now and in both months. Each upazila takes the newest
pass that saw at least half of its land, so the API can use whichever of the OPERA and NISAR readings is newer.

Drainage: every reading (OPERA and NISAR) goes into services/api/data/live/water_history.json. From October, an
upazila whose flood share has fallen since its peak gets a pace (points a week) and, when it is under 45 days away,
the date its land would be free of the extra water at that pace, so low land need not wait on last year's drain date
(research/explore/opera_water.py). One sensor's readings are used where there are enough; on the coast (south of
23 N) a pace never mixes the two, since NISAR counts less water there.

The files are paged HDF5 (4 MB pages, 2-8 GB each); only Bangladesh's rows and columns of HH and the mask are fetched
over HTTPS, about 25 MB a frame, cached in research/data/nisar_water/ (git-ignored) for 30 days.

Output: services/api/data/live/nisar_water.json, services/api/data/live/water_history.json
Needs : EARTHDATA_USERNAME / EARTHDATA_PASSWORD, earthaccess, h5py, pyproj, rasterio
Usage : python research/live/nisar_water.py [--days 12] [--workers 6]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "acquire"))
sys.path.insert(0, str(ROOT / "research" / "live"))
import earthaccess  # noqa: E402
from _common import load_dotenv, out_dir  # noqa: E402
from flood_now import MIN_SEEN, Reader, dry_season, last_year  # noqa: E402
from opera_dswx import BBOX, upazilas  # noqa: E402

SHORT_NAME = "NISAR_L2_GCOV_PROVISIONAL_V1"
HH_WATER = -9.0  # dB, set against OPERA in research/explore/nisar_calibration.py
MIN_PASS_SEEN = 0.5  # a pass stands for an upazila when it saw at least this share of it
KEEP_DAYS = 30  # cached frames older than this are deleted
HISTORY_DAYS = 150
DRAIN_FROM = "10-01"  # drainage is read from this day of the year to the end of January
FREE_AT = 0.05  # the land counts as free when the flood share is below this
MIN_DROP, MIN_GAP = 0.03, 7  # a fall of at least this much over at least this many days
MAX_AHEAD = 45  # days: a free-by date further ahead than this is not projected
COAST_LAT = 23.0  # south of this (the coastal belt) a drain pace never mixes OPERA and NISAR readings
OUT = ROOT / "services" / "api" / "data" / "live" / "nisar_water.json"
HISTORY = ROOT / "services" / "api" / "data" / "live" / "water_history.json"
FLOOD_NOW = ROOT / "services" / "api" / "data" / "live" / "flood_now.json"
SOURCE = ("NASA-ISRO NISAR L-band radar (GCOV provisional, ASF DAAC), HH at 80 m: open water below -9 dB (set against "
          "OPERA DSWx-HLS on the same days); flood = water now on land that is not lasting water (OPERA DSWx-HLS, "
          "December 2025 and February 2026)")
FS = None


def login() -> None:
    global FS
    load_dotenv()
    earthaccess.login(strategy="environment")
    FS = earthaccess.get_fsspec_https_session()


def frame(g: dict, cache: Path) -> tuple[str, str]:
    """Reads one granule's HH and mask over Bangladesh into the cache; returns (granule, path or why it was skipped)."""
    import h5py
    from pyproj import Transformer
    ur = g["ur"]
    path = cache / f"{ur}.npz"
    if path.exists():
        return ur, str(path)
    for attempt in range(3):
        try:
            with h5py.File(FS.open(g["url"], block_size=4 * 1024 * 1024, cache_type="blockcache"), "r") as h:
                grids = h["science/LSAR/GCOV/grids"]
                if "frequencyB" not in grids or "HHHH" not in grids["frequencyB"]:
                    return ur, "skipped: no HH on the 80 m grid"
                b = grids["frequencyB"]
                epsg = int(b["projection"][()])
                bx, by = Transformer.from_crs(4326, epsg, always_xy=True).transform(
                    [BBOX[0], BBOX[2], BBOX[0], BBOX[2]], [BBOX[1], BBOX[1], BBOX[3], BBOX[3]])
                xs, ys = b["xCoordinates"][:], b["yCoordinates"][:]
                c = np.where((xs >= min(bx)) & (xs <= max(bx)))[0]
                r = np.where((ys >= min(by)) & (ys <= max(by)))[0]
                if not len(c) or not len(r):
                    return ur, "skipped: outside Bangladesh"
                w = (slice(r[0], r[-1] + 1), slice(c[0], c[-1] + 1))
                hh, mask = b["HHHH"][w], b["mask"][w]
            with np.errstate(divide="ignore", invalid="ignore"):
                db = np.where((mask > 0) & (mask < 255) & (hh > 0), 10 * np.log10(hh), np.nan).astype(np.float16)
            np.savez_compressed(path, db=db, xs=xs[w[1]], ys=ys[w[0]], epsg=epsg, day=g["day"])
            return ur, str(path)
        except Exception as e:  # a network error: try again, then leave the frame for the next run
            err = f"{type(e).__name__} {str(e)[:100]}"
    return ur, f"failed: {err}"


def labels_on(xs, ys, epsg: int, ups: list[dict]) -> np.ndarray:
    """Upazila numbers (1-based, 0 outside) on a frame's grid."""
    from affine import Affine
    from rasterio import features
    from rasterio.warp import transform_bounds, transform_geom
    dx, dy = xs[1] - xs[0], ys[1] - ys[0]
    t = Affine(dx, 0, xs[0] - dx / 2, 0, dy, ys[0] - dy / 2)
    w, s, e, n = transform_bounds(f"EPSG:{epsg}", "EPSG:4326", xs.min(), ys.min(), xs.max(), ys.max())
    shapes = [(transform_geom("EPSG:4326", f"EPSG:{epsg}", u["geometry"]), i + 1) for i, u in enumerate(ups)
              if u["bounds"][0] <= e and u["bounds"][2] >= w and u["bounds"][1] <= n and u["bounds"][3] >= s]
    return features.rasterize(shapes, out_shape=(len(ys), len(xs)), transform=t, fill=0, dtype="int32") if shapes \
        else np.zeros((len(ys), len(xs)), "int32")


def dry_on(xs, ys, epsg: int, dry: dict) -> tuple[np.ndarray, np.ndarray]:
    """OPERA's winter reading sampled at a frame's pixel centres: (seen clear in both months, lasting water)."""
    from pyproj import Transformer
    clear = np.zeros((len(ys), len(xs)), bool)
    water = np.zeros_like(clear)
    known = np.zeros_like(clear)
    for d in dry.values():
        a, _, c, _, e, f = d["transform"]
        rows_n, cols_n = d["clear"].shape
        # the tile's footprint on the frame grid
        corners = ([c, c + a * cols_n, c, c + a * cols_n], [f, f, f + e * rows_n, f + e * rows_n])
        fx, fy = Transformer.from_crs(d["epsg"], epsg, always_xy=True).transform(*corners) if d["epsg"] != epsg else corners
        ci = np.where((xs >= min(fx)) & (xs <= max(fx)))[0]
        ri = np.where((ys >= min(fy)) & (ys <= max(fy)))[0]
        if not len(ci) or not len(ri):
            continue
        sub = np.ix_(ri, ci)
        if d["epsg"] == epsg:
            col = np.floor((xs[ci] - c) / a).astype(int)[None, :].repeat(len(ri), 0)
            row = np.floor((ys[ri] - f) / e).astype(int)[:, None].repeat(len(ci), 1)
        else:
            X, Y = np.meshgrid(xs[ci], ys[ri])
            X, Y = Transformer.from_crs(epsg, d["epsg"], always_xy=True).transform(X, Y)
            col, row = np.floor((X - c) / a).astype(int), np.floor((Y - f) / e).astype(int)
        inside = (row >= 0) & (row < rows_n) & (col >= 0) & (col < cols_n)
        rr, cc = np.where(inside, row, 0), np.where(inside, col, 0)
        seen = inside & d["clear"][rr, cc] & ~known[sub]
        clear[sub] |= seen
        water[sub] |= seen & d["water"][rr, cc]
        known[sub] |= seen
    return clear, water


def drain(readings: list[list], today: date, coast: bool) -> dict | None:
    """Pace and free-by date from an upazila's readings [date, floodShare, waterNow, sensor] since its peak."""
    if not (f"{today:%m-%d}" >= DRAIN_FROM or f"{today:%m-%d}" <= "01-31"):
        return None
    start = date(today.year if today.month >= 10 else today.year - 1, 9, 1)
    pts = [r for r in readings if r[1] is not None and date.fromisoformat(r[0]) >= start]
    # One sensor where it can. On the coast OPERA counts ponds and water under rice that NISAR reads as land, so a
    # fall from an OPERA reading to a NISAR one is partly the sensor: there only one sensor's readings are used
    span = lambda rs: (date.fromisoformat(max(rs)[0]) - date.fromisoformat(min(rs)[0])).days if rs else 0  # noqa: E731
    one = [rs for rs in ([r for r in pts if r[3] == "nisar"], [r for r in pts if r[3] == "opera"]) if len(rs) >= 2 and span(rs) >= MIN_GAP]
    pts = one[0] if one else ([] if coast else pts)
    if len(pts) < 2:
        return None
    peak = max(pts, key=lambda r: (r[1], r[0]))
    last = max(pts, key=lambda r: r[0])
    days = (date.fromisoformat(last[0]) - date.fromisoformat(peak[0])).days
    out = {"from": {"date": peak[0], "floodShare": peak[1], "sensor": peak[3]},
           "to": {"date": last[0], "floodShare": last[1], "sensor": last[3]}, "perWeek": None, "freeBy": None}
    if last[1] < FREE_AT:
        out["freeBy"] = last[0]
        return out
    if days < MIN_GAP or peak[1] - last[1] < MIN_DROP:
        return out  # not falling yet, or too soon to tell
    per_day = (peak[1] - last[1]) / days
    out["perWeek"] = round(per_day * 7, 3)
    # A straight line holds only a few weeks: water leaves the haor slowly in October and fast once the rivers fall,
    # so a date further ahead than this is not given
    ahead = round((last[1] - FREE_AT) / per_day)
    out["freeBy"] = str(date.fromisoformat(last[0]) + timedelta(days=ahead)) if ahead <= MAX_AHEAD else None
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=int, default=12, help="passes from the last this many days (one repeat cycle is 12)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--baseline", nargs=2, default=["2026-02-01", "2026-02-28"])
    ap.add_argument("--baseline2", nargs=2, default=["2025-12-01", "2025-12-31"])
    args = ap.parse_args()
    login()
    today = date.today()
    start = today - timedelta(days=args.days)
    cache = out_dir("nisar_water")
    for old in cache.glob("*.npz"):
        if time.time() - old.stat().st_mtime > KEEP_DAYS * 86400:
            old.unlink()

    found = earthaccess.search_data(short_name=SHORT_NAME, bounding_box=BBOX, temporal=(str(start), str(today)), count=-1)
    gs = [{"ur": g["umm"]["GranuleUR"], "day": g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10],
           "url": next(u for u in g.data_links() if u.endswith(".h5"))} for g in found]
    print(f"NISAR GCOV: {len(gs)} passes over Bangladesh since {start}", flush=True)
    paths: dict[str, str] = {}
    with ProcessPoolExecutor(args.workers, initializer=login) as pool:
        futures = [pool.submit(frame, g, cache) for g in gs]
        for fut in as_completed(futures):
            ur, got = fut.result()
            print(f"  {ur[:70]}: {Path(got).name if got.endswith('.npz') else got}", flush=True)
            if got.endswith(".npz"):
                paths[ur] = got

    ups = upazilas()
    dry = dry_season(Reader(FS, ups), args.baseline, args.baseline2, 8)
    print(f"OPERA winter water: {len(dry)} tiles", flush=True)
    n = len(ups) + 1
    per_pass = []  # (day, granule, sums)
    for ur, p in sorted(paths.items()):
        z = np.load(p)
        xs, ys, epsg, day = z["xs"], z["ys"], int(z["epsg"]), str(z["day"])
        lab = labels_on(xs, ys, epsg, ups)
        if not lab.any():
            continue
        dry_clear, dry_water = dry_on(xs, ys, epsg, dry)
        db = z["db"].astype(np.float32)
        valid = ~np.isnan(db)
        water = valid & (db < HH_WATER)
        seen = valid & dry_clear
        flat = lab.ravel()
        count = lambda m: np.bincount(flat, weights=m.ravel().astype(float), minlength=n)  # noqa: E731
        per_pass.append((day, ur, {"area": np.bincount(flat, minlength=n).astype(float), "valid": count(valid),
                                   "water": count(water), "seen": count(seen), "flood": count(seen & water & ~dry_water),
                                   "dryClear": count(valid & dry_clear), "dryWater": count(valid & dry_water)}))
        print(f"  {day} {ur[17:40]}: {int((lab > 0).sum() * 0.0064)} km2 of upazilas, water {water[lab > 0].mean():.0%} "
              f"of the valid land", flush=True)

    total = np.zeros(n)
    for _, _, s in per_pass:
        total = np.maximum(total, s["area"])  # an upazila's full area: the frame that holds most of it
    before = last_year(today)
    rows, readings = {}, {}
    for i, u in enumerate(ups, start=1):
        if total[i] == 0:
            continue
        mine = [(day, ur, s) for day, ur, s in per_pass if s["valid"][i] >= MIN_PASS_SEEN * total[i]]
        reads = []
        for day, ur, s in mine:
            seen = s["seen"][i]
            reads.append({"date": day, "pass": ur,
                          "seenShare": round(seen / total[i], 3),
                          "floodShare": round(s["flood"][i] / seen, 3) if seen >= MIN_SEEN * total[i] else None,
                          "waterNow": round(s["water"][i] / s["valid"][i], 3),
                          "waterDry": round(s["dryWater"][i] / s["dryClear"][i], 3) if s["dryClear"][i] else None})
        if not reads:
            continue
        newest = max(reads, key=lambda r: (r["date"], r["seenShare"]))
        rows[u["site_id"]] = {k: newest[k] for k in ("date", "seenShare", "floodShare", "waterNow", "waterDry")} | \
            {"lastYearRadar": before.get(u["site_id"]), "sensor": "nisar"}
        readings[u["site_id"]] = reads

    # Every reading, OPERA's as well, goes into the history the drainage pace is read from
    hist = json.loads(HISTORY.read_text(encoding="utf-8"))["upazilas"] if HISTORY.exists() else {}
    def add(site: str, day: str, flood: float | None, water: float | None, sensor: str) -> None:
        h = [r for r in hist.get(site, []) if not (r[0] == day and r[3] == sensor)]
        hist[site] = sorted(h + [[day, flood, water, sensor]], key=lambda r: (r[0], r[3]))
    for site, reads in readings.items():
        for r in reads:
            add(site, r["date"], r["floodShare"], r["waterNow"], "nisar")
    if FLOOD_NOW.exists():
        for site, r in json.loads(FLOOD_NOW.read_text(encoding="utf-8"))["upazilas"].items():
            if r.get("date"):
                add(site, r["date"], r.get("floodShare"), r.get("waterNow"), "opera")
    oldest = str(today - timedelta(days=HISTORY_DAYS))
    hist = {s: [r for r in h if r[0] >= oldest] for s, h in hist.items()}
    coast = {u["site_id"]: (u["bounds"][1] + u["bounds"][3]) / 2 < COAST_LAT for u in ups}
    for site, row in rows.items():
        row["drain"] = drain(hist.get(site, []), today, coast[site])

    given = [r["floodShare"] for r in rows.values() if r["floodShare"] is not None]
    out = {
        "source": SOURCE, "made": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window": [str(start), str(today)], "latestPass": max((r["date"] for r in rows.values()), default=None),
        "baseline": [args.baseline2, args.baseline],
        "thresholds": {"hhWaterDb": HH_WATER, "minPassSeen": MIN_PASS_SEEN, "minSeenShare": MIN_SEEN, "freeAt": FREE_AT},
        "passes": {"found": len(gs), "read": len(paths)},
        "summary": {"upazilas": len(rows), "withFloodShare": len(given),
                    "floodAtLeast10pct": sum(1 for v in given if v >= 0.10), "floodAtLeast25pct": sum(1 for v in given if v >= 0.25),
                    "draining": sum(1 for r in rows.values() if r["drain"] and r["drain"]["perWeek"])},
        "upazilas": rows,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    HISTORY.write_text(json.dumps({"made": out["made"], "fields": ["date", "floodShare", "waterNow", "sensor"], "upazilas": hist},
                                  ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} upazilas, {len(given)} with a flood share; >= 10% in "
          f"{out['summary']['floodAtLeast10pct']}, >= 25% in {out['summary']['floodAtLeast25pct']}; "
          f"draining {out['summary']['draining']}", flush=True)


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"done in {time.time() - t0:.0f} s")
