"""Downloads for the brainstorm of 31 Oct 2026 (stress this week, a cropland grid, ECOSTRESS stress, soil):
everything over Bangladesh's box, so the data can be harmonised onto one 1 km grid later.

  A. ESA WorldCover 2021 10 m land cover tiles (public, no login): the cropland mask.
  B. ISRIC SoilGrids 250 m (public WCS): clay, sand, organic carbon and pH at 0-5, 5-15 and 15-30 cm.
  C. NASA AppEEARS area requests (Earthdata login from the environment, never printed):
     - MOD13A2.061  1 km 16-day NDVI + reliability, 2001-01-01 to today  (the 25-season baseline)
     - VJ113A2.002  NOAA-20 VIIRS 1 km 16-day NDVI + reliability, 2023 to today (MODIS's successor)
     - SPL3SMP_E    SMAP 9 km daily soil moisture AM/PM, 2015-04-01 to today
     - ECO_L4T_ESI  ECOSTRESS 70 m evaporative stress index, the Boro seasons (Jan-Apr) of 2025 and 2026
     Tasks are submitted once (ids kept in state.json), polled, and their bundles downloaded as they finish;
     a rerun resumes, skipping files already on disk.
  D. "now": the newest VIIRS and Terra MODIS composites as NASA publishes them. The condition is read from the
     newest VIIRS composite and checked against Terra MODIS within 8 days of it (research/grid/build.py), so both
     are kept up to date. NASA CMR (public) says when a composite is out for the whole box; only the dates after
     the newest one on disk are asked of AppEEARS (ids in now_state.json). With --watch-until it looks again every
     3 hours until that day. Then rebuild: python research/grid/build.py.

Usage (from the repo root; the Earthdata login comes from the environment or the repo's .env):
  python research/acquire/grid_downloads.py [--only worldcover soilgrids appeears]
  python research/acquire/grid_downloads.py --only now [--watch-until 2026-11-14] [--dry]
EDEN_GRID_DIR puts the data elsewhere, as for research/grid/.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import requests

from _common import load_dotenv

ROOT = Path(os.environ.get("EDEN_GRID_DIR") or Path(__file__).resolve().parents[1] / "data" / "grid")
BOX = (88.0, 20.6, 92.7, 26.7)  # lon0, lat0, lon1, lat1: all of Bangladesh
API = "https://appeears.earthdatacloud.nasa.gov/api"
TODAY = dt.date.today()
S = requests.Session()
S.headers["User-Agent"] = "EDEN-research (NASA Space Apps 2026, team WinR)"


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def fetch(url: str, path: Path, **kw) -> bool:
    if path.exists() and path.stat().st_size > 0:
        log("have", path.name)
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    for attempt in range(4):
        try:
            with S.get(url, stream=True, timeout=600, **kw) as r:
                if r.status_code == 404:
                    log("none", path.name, "(404)")
                    return False
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            tmp.replace(path)
            log("got", path.name, f"{path.stat().st_size / 1e6:.1f} MB")
            return True
        except Exception as e:  # noqa: BLE001 - keep going, try again
            log("retry", path.name, attempt + 1, type(e).__name__, str(e)[:160])
            time.sleep(20 * (attempt + 1))
    return False


# ---------- A. ESA WorldCover 2021 (3x3 degree tiles named by their lower-left corner) ----------
def worldcover() -> None:
    base = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
    for lat in (18, 21, 24):
        for lon in (87, 90):
            name = f"ESA_WorldCover_10m_2021_v200_N{lat:02d}E{lon:03d}_Map.tif"
            fetch(f"{base}/{name}", ROOT / "worldcover" / name)


# ---------- B. SoilGrids 250 m through its WCS, cut to the box in lon/lat ----------
def soilgrids() -> None:
    for prop in ("clay", "sand", "soc", "phh2o"):
        for depth in ("0-5cm", "5-15cm", "15-30cm"):
            cov = f"{prop}_{depth}_mean"
            url = (f"https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
                   f"&COVERAGEID={cov}&FORMAT=image/tiff"
                   f"&SUBSET=long({BOX[0]},{BOX[2]})&SUBSET=lat({BOX[1]},{BOX[3]})"
                   "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
                   "&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326")
            fetch(url, ROOT / "soilgrids" / f"{cov}.tif")


# ---------- C. AppEEARS area requests ----------
WANT = [
    {"name": "mod13a2_ndvi", "products": ["MOD13A2.061"], "start": "2001-01-01",
     "layers": lambda l: l in ("_1_km_16_days_NDVI", "_1_km_16_days_pixel_reliability")},
    {"name": "viirs_vj113a2_ndvi", "products": ["VJ113A2.002", "VJ113A2.001", "VNP13A2.002"], "start": "2023-01-01",
     "layers": lambda l: l.endswith("_16_days_NDVI") or l.endswith("_16_days_pixel_reliability")},
    # SMAP in three parts: one 2015-2026 request is over AppEEARS's file limit (by 69%)
    {"name": "smap_spl3smp_e_2015", "products": ["SPL3SMP_E.006", "SPL3SMP_E.005"], "start": "2015-04-01", "end": "2019-03-31",
     "layers": lambda l: l.endswith("_soil_moisture") or l.endswith("_soil_moisture_pm")},
    {"name": "smap_spl3smp_e_2019", "products": ["SPL3SMP_E.006", "SPL3SMP_E.005"], "start": "2019-04-01", "end": "2022-12-31",
     "layers": lambda l: l.endswith("_soil_moisture") or l.endswith("_soil_moisture_pm")},
    {"name": "smap_spl3smp_e_2023", "products": ["SPL3SMP_E.006", "SPL3SMP_E.005"], "start": "2023-01-01",
     "layers": lambda l: l.endswith("_soil_moisture") or l.endswith("_soil_moisture_pm")},
    {"name": "ecostress_esi_2025", "products": ["ECO_L4T_ESI.002", "ECO4ESIPTJPL.001"], "start": "2025-01-01", "end": "2025-04-30",
     "layers": lambda l: l.upper() == "ESI" or l.upper().endswith("_ESI") or l == "ESIavg"},
    {"name": "ecostress_esi_2026", "products": ["ECO_L4T_ESI.002", "ECO4ESIPTJPL.001"], "start": "2026-01-01", "end": "2026-04-30",
     "layers": lambda l: l.upper() == "ESI" or l.upper().endswith("_ESI") or l == "ESIavg"},
]


def token() -> str:
    load_dotenv()
    user, pw = os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD")
    if not user or not pw:
        sys.exit("No Earthdata login in the environment or the repo's .env")
    r = S.post(f"{API}/login", auth=(user, pw), timeout=60)
    r.raise_for_status()
    return r.json()["token"]


def mdy(d: str) -> str:
    y, m, dd = d.split("-")
    return f"{m}-{dd}-{y}"


def appeears() -> None:
    state_path = ROOT / "appeears_state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    tok = token()
    h = {"Authorization": f"Bearer {tok}"}
    products = {p["ProductAndVersion"]: p for p in S.get(f"{API}/product", timeout=120).json()}
    geo = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {
        "type": "Polygon", "coordinates": [[[BOX[0], BOX[1]], [BOX[2], BOX[1]], [BOX[2], BOX[3]], [BOX[0], BOX[3]], [BOX[0], BOX[1]]]]}}]}

    for w in WANT:
        if w["name"] in state:
            continue
        prod = next((p for p in w["products"] if p in products), None)
        if not prod:
            log("skip", w["name"], "- none of", w["products"], "offered by AppEEARS")
            state[w["name"]] = {"status": "unavailable"}
            continue
        layers = [l for l in S.get(f"{API}/product/{prod}", timeout=120).json() if w["layers"](l)]
        if not layers:
            log("skip", w["name"], "- no matching layer in", prod)
            state[w["name"]] = {"status": "no-layer", "product": prod}
            continue
        end = w.get("end", TODAY.isoformat())
        task = {"task_type": "area", "task_name": f"eden_{w['name']}", "params": {
            "dates": [{"startDate": mdy(w["start"]), "endDate": mdy(end)}],
            "layers": [{"product": prod, "layer": l} for l in layers],
            "geo": geo, "output": {"format": {"type": "geotiff"}, "projection": "geographic"}}}
        r = S.post(f"{API}/task", json=task, headers=h, timeout=120)
        if r.status_code >= 400:
            log("refused", w["name"], r.status_code, r.text[:300])
            state[w["name"]] = {"status": "refused", "product": prod, "message": r.text[:300]}
        else:
            tid = r.json()["task_id"]
            log("submitted", w["name"], prod, layers, w["start"], "->", end, "task", tid)
            state[w["name"]] = {"status": "submitted", "task_id": tid, "product": prod, "layers": layers,
                                "start": w["start"], "end": end}
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=1))

    collect(state, state_path, tok)
    log("appeears: all tasks finished")


ENDED = ("downloaded", "error", "expired", "deleted")


def collect(state: dict, state_path: Path, tok: str) -> None:
    """Poll the submitted tasks and download each bundle as it finishes. A "now" task's files go to its product's
    folder under now_<composite>/, where research/grid/ finds them beside the first download."""
    h = {"Authorization": f"Bearer {tok}"}
    pending = {k for k, v in state.items() if v.get("task_id") and v.get("status") not in ENDED}
    t_login = time.time()
    while pending:
        if time.time() - t_login > 36 * 3600:  # a fresh token now and then
            tok, t_login = token(), time.time()
            h = {"Authorization": f"Bearer {tok}"}
        for name in sorted(pending):
            v = state[name]
            try:
                j = S.get(f"{API}/task/{v['task_id']}", headers=h, timeout=60).json()
            except Exception as e:  # noqa: BLE001
                log("status?", name, type(e).__name__)
                continue
            st = j.get("status")
            if st != v.get("last"):
                log(name, st)
                v["last"] = st
            if st == "done":
                files = S.get(f"{API}/bundle/{v['task_id']}", headers=h, timeout=120).json()["files"]
                ok = True
                for f in files:
                    out = ROOT / name / f["file_name"]
                    if v.get("folder"):
                        out = ROOT / v["folder"] / f"now_{v['newest']}" / Path(f["file_name"]).name
                    ok &= fetch(f"{API}/bundle/{v['task_id']}/{f['file_id']}", out, headers=h)
                if ok:
                    v["status"] = "downloaded"
                    v["files"] = len(files)
                    log("downloaded", name, len(files), "files")
                    pending.discard(name)
            elif st in ("error", "expired", "deleted"):
                v["status"] = st
                log("ended", name, st, json.dumps(j)[:300])
                pending.discard(name)
            state_path.write_text(json.dumps(state, indent=1))
        if pending:
            time.sleep(300)


# ---------- D. "now": the newest composites, as NASA publishes them ----------
NOW = {"viirs_vj113a2_ndvi": ("VJ113A2", "002"), "mod13a2_ndvi": ("MOD13A2", "061")}
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"


def newest_on_disk(folder: str) -> dt.date:
    days = [dt.datetime.strptime(p.name.split("_doy")[1][:7], "%Y%j").date()
            for p in (ROOT / folder).glob("*/*_16_days_NDVI_doy*.tif")]
    if not days:
        sys.exit(f"No {folder} composites in {ROOT}; run --only appeears first")
    return max(days)


def newest_at_nasa(short: str, version: str, since: dt.date) -> dt.date | None:
    """The newest composite with as many tiles over the box as any other: one still missing a tile would leave part
    of the country blank."""
    r = S.get(CMR, params={"short_name": short, "version": version, "bounding_box": ",".join(map(str, BOX)),
                           "temporal": f"{since.isoformat()}T00:00:00Z,", "sort_key": "-start_date",
                           "page_size": 20}, timeout=60)
    r.raise_for_status()
    tiles = collections.Counter(g["time_start"][:10] for g in r.json()["feed"]["entry"])
    full = max(tiles.values(), default=0)
    return max((dt.date.fromisoformat(d) for d, n in tiles.items() if n == full), default=None)


def now_round(state: dict, state_path: Path, dry: bool) -> None:
    """Ask AppEEARS for any composite NASA has published since the newest on disk, and collect what was asked."""
    layers_of = {w["name"]: w["layers"] for w in WANT}
    tok = None
    for folder, (short, version) in NOW.items():
        have = newest_on_disk(folder)
        out = newest_at_nasa(short, version, have)
        log(folder, "newest on disk", have, "at NASA", out)
        key = f"{folder}_{out}"
        asked = key in state and state[key]["status"] not in ("error", "expired", "deleted")
        if dry or not out or out <= have or asked:
            continue
        tok = tok or token()
        prod = f"{short}.{version}"
        layers = [l for l in S.get(f"{API}/product/{prod}", timeout=120).json() if layers_of[folder](l)]
        first = have + dt.timedelta(days=1)
        task = {"task_type": "area", "task_name": f"eden_now_{folder}_{out}", "params": {
            "dates": [{"startDate": mdy(first.isoformat()), "endDate": mdy(dt.date.today().isoformat())}],
            "layers": [{"product": prod, "layer": l} for l in layers],
            "geo": {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {
                "type": "Polygon", "coordinates": [[[BOX[0], BOX[1]], [BOX[2], BOX[1]], [BOX[2], BOX[3]],
                                                    [BOX[0], BOX[3]], [BOX[0], BOX[1]]]]}}]},
            "output": {"format": {"type": "geotiff"}, "projection": "geographic"}}}
        r = S.post(f"{API}/task", json=task, headers={"Authorization": f"Bearer {tok}"}, timeout=120)
        if r.status_code >= 400:
            log("refused", key, r.status_code, r.text[:300])
            continue
        state[key] = {"status": "submitted", "task_id": r.json()["task_id"], "product": prod, "layers": layers,
                      "start": first.isoformat(), "folder": folder, "newest": out.isoformat()}
        log("submitted", key, prod, first, "->", dt.date.today())
        state_path.write_text(json.dumps(state, indent=1))
    if any(v.get("status") not in ENDED for v in state.values()):
        collect(state, state_path, tok or token())


def now(watch_until: dt.date | None, dry: bool) -> None:
    state_path = ROOT / "now_state.json"  # apart from appeears_state.json, which a running full download rewrites
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    start = {folder: newest_on_disk(folder) for folder in NOW}
    while True:
        try:
            now_round(state, state_path, dry)
        except Exception as e:  # noqa: BLE001 - a network blip must not end a watch of days
            log("round failed", type(e).__name__, str(e)[:200])
        got = {f: d for f, d in ((f, newest_on_disk(f)) for f in NOW) if d > start[f]}
        if got:
            log("new on disk:", ", ".join(f"{f} {d}" for f, d in got.items()),
                "- rebuild with: python research/grid/build.py")
            start.update(got)
        if dry or not watch_until or dt.date.today() >= watch_until:
            break
        time.sleep(3 * 3600)
    log("now: done")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=["worldcover", "soilgrids", "appeears"])
    ap.add_argument("--watch-until", type=dt.date.fromisoformat, help='"now": keep looking until this day')
    ap.add_argument("--dry", action="store_true", help='"now": only say what is newer, fetch nothing')
    a = ap.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    for part in a.only:
        log("=== start", part)
        try:
            {"worldcover": worldcover, "soilgrids": soilgrids, "appeears": appeears,
             "now": lambda: now(a.watch_until, a.dry)}[part]()
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001 - one part failing leaves the others running
            log("FAILED", part, type(e).__name__, str(e)[:300])
        log("=== end", part)


if __name__ == "__main__":
    main()
