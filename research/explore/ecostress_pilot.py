"""Field-scale water use and stress around the Talanda pilot from NASA ECOSTRESS (70 m, from the space station).

Field Shift names ECOSTRESS twice: for evaporation and water stress, and for land-surface temperature in a harmonised
feature set. Around Tanore the dry season is the question: Boro rice is irrigated from tube wells from February to
April while lentil, mustard and wheat finish on stored soil moisture. ECOSTRESS sees each 70 m field:

  ETdaily  (ECO_L3T_JET v002): the day's evapotranspiration, mm/day (the JET ensemble)
  ESI      (ECO_L4T_ESI v002): the evaporative stress index, ET over potential ET (0 = no water, 1 = unstressed)
  cloud, water masks from the same granules; only clear land pixels count

For every daytime overpass (09:00-15:00 Bangladesh time; a late pass gives a poor daily ET) from February to April,
2019-2026, over a box of about 11 x 11 km around the pilot point, this script keeps the median and 90th-percentile
ETdaily, the median ESI, the share of land at ESI 0.8 or more and the share under strong stress (ESI under 0.3). A scene
reprocessed under another build counts once (the latest build).

Checked against BRRI's 2014-15 survey (Boro in about 40% of Tanore's cropping patterns), the share at ESI 0.8 or more
in March-April (10-15%) is far smaller, so it is not a measure of Boro area here; that needs field labels.

The tiles are small (about 2.4 MB for the four files of an overpass) and reading a window over HTTPS took 40 s, so
whole files are fetched once into research/data/ecostress (git-ignored) and read locally.

ECOSTRESS passes at different times of day and is often clouded; a box is not a farm. These numbers check the
replay's water story at field scale; they do not enter the scores.

Output: packages/rotation-engine/src/data/ecostress_pilot.json
Usage : python research/explore/ecostress_pilot.py   (EARTHDATA_USERNAME / EARTHDATA_PASSWORD in .env, or in the file
        named by EARTHDATA_ENV_FILE)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import earthaccess
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "acquire"))
from _common import DATA, RESEARCH, load_dotenv, write_provenance  # noqa: E402

OUT = RESEARCH.parent / "packages" / "rotation-engine" / "src" / "data" / "ecostress_pilot.json"
CACHE = DATA / "ecostress"
HALF = 0.05  # degrees: a box of about 11 x 11 km around the pilot point
MONTHS = (2, 3, 4)
YEARS = range(2019, 2027)
UTC_HOURS = range(3, 9)  # 09:00-14:59 Bangladesh time
WET, DRY = 0.8, 0.3
MIN_CLEAR = 0.5  # an overpass counts when half the box is clear land
FILES = ("ETdaily", "cloud", "water")


def cached(url: str, fs) -> Path:
    path = CACHE / url.rsplit("/", 1)[-1]
    if not path.exists():
        tmp = path.with_suffix(".part")
        tmp.write_bytes(fs.cat(url))
        tmp.replace(path)
    return path


def read_window(path: Path, bbox) -> np.ndarray:
    with rasterio.open(path) as src:
        b = transform_bounds("EPSG:4326", src.crs, *bbox)
        win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
        nodata = src.nodata
        a = src.read(1, window=win, boundless=True, fill_value=nodata if nodata is not None else np.nan).astype("float32")
        if nodata is not None:
            a[a == nodata] = np.nan
        return a


def main() -> None:
    pilot = pd.read_csv(RESEARCH / "sites" / "pilot_sites.csv").set_index("site_id").loc["RAJ_TANORE"]
    lat, lon = float(pilot["lat"]), float(pilot["lon"])
    bbox = (lon - HALF, lat - HALF, lon + HALF, lat + HALF)
    load_dotenv()
    if os.environ.get("EARTHDATA_ENV_FILE"):
        load_dotenv(Path(os.environ["EARTHDATA_ENV_FILE"]))
    earthaccess.login(strategy="environment")
    fs = earthaccess.get_fsspec_https_session()
    CACHE.mkdir(parents=True, exist_ok=True)
    rows, skipped = [], {"night_or_evening": 0, "cloudy": 0, "no_esi": 0, "error": 0}
    for year in YEARS:
        span = (f"{year}-{MONTHS[0]:02d}-01", f"{year}-{MONTHS[-1]:02d}-30")
        jet = earthaccess.search_data(short_name="ECO_L3T_JET", version="002", bounding_box=bbox, temporal=span, count=500)
        esi = {g["umm"]["GranuleUR"].replace("L4T_ESI", "L3T_JET"): g for g in
               earthaccess.search_data(short_name="ECO_L4T_ESI", version="002", bounding_box=bbox, temporal=span, count=500)}
        seen = set()
        # One scene can be listed under several builds (..._0712_01, ..._0713_01): the latest build counts once
        for g in sorted(jet, key=lambda g: g["umm"]["GranuleUR"].split("_", 7)[-1], reverse=True):
            ur = g["umm"]["GranuleUR"]
            when = pd.Timestamp(ur.split("_")[6][:15])
            if when.month not in MONTHS or when in seen:
                continue
            seen.add(when)
            if when.hour not in UTC_HOURS:
                skipped["night_or_evening"] += 1
                continue
            if ur not in esi:
                skipped["no_esi"] += 1
                continue
            links = {u.rsplit("_", 1)[-1].removesuffix(".tif"): u for u in g.data_links()}
            elinks = {u.rsplit("_", 1)[-1].removesuffix(".tif"): u for u in esi[ur].data_links()}
            if not set(FILES) <= links.keys() or "ESI" not in elinks:
                skipped["no_esi"] += 1
                continue
            try:
                et, cloud, water = (read_window(cached(links[k], fs), bbox) for k in FILES)
                si = read_window(cached(elinks["ESI"], fs), bbox)
            except Exception as err:  # a failed fetch or a window outside the tile: skip it, and say so
                skipped["error"] += 1
                print(f"  {ur}: skipped ({type(err).__name__})", flush=True)
                continue
            n = min(a.shape[0] for a in (et, cloud, water, si)), min(a.shape[1] for a in (et, cloud, water, si))
            et, cloud, water, si = (a[: n[0], : n[1]] for a in (et, cloud, water, si))
            land = (cloud == 0) & (water == 0) & np.isfinite(et) & np.isfinite(si)
            clear = float(land.mean())
            if clear < MIN_CLEAR:
                skipped["cloudy"] += 1
                continue
            e, s = et[land], np.clip(si[land], 0, 1.5)
            rows.append({"date": when.date().isoformat(), "localHour": (when.hour + 6) % 24, "clearShare": round(clear, 2), "pixels": int(land.sum()),
                         "etMedian": round(float(np.median(e)), 2), "etP90": round(float(np.percentile(e, 90)), 2),
                         "esiMedian": round(float(np.median(s)), 2), "wetShare": round(float((s >= WET).mean()), 3),
                         "stressedShare": round(float((s < DRY).mean()), 3)})
            print(f"  {rows[-1]}", flush=True)
    print("skipped:", skipped)
    rows.sort(key=lambda r: (r["date"], r["localHour"]))
    write_provenance(CACHE / "tiles", source="NASA ECOSTRESS ECO_L3T_JET v002 and ECO_L4T_ESI v002 (LP DAAC), tiles over the Talanda pilot",
                     script="research/explore/ecostress_pilot.py")
    t = pd.DataFrame(rows)
    if t.empty:
        print("no clear daytime overpasses")
        return
    t["month"] = pd.to_datetime(t["date"]).dt.month
    monthly = t.groupby("month").agg(overpasses=("date", "size"), etMedian=("etMedian", "median"), esiMedian=("esiMedian", "median"),
                                     wetShare=("wetShare", "median"), stressedShare=("stressedShare", "median"))
    OUT.write_text(json.dumps({
        "generatedOn": date.today().isoformat(),
        "source": "NASA ECOSTRESS ECO_L3T_JET v002 (ETdaily) and ECO_L4T_ESI v002 (ESI), 70 m, with the granules' cloud and water masks (LP DAAC)",
        "method": __doc__.split("\n\n")[2].strip() if __doc__ else "",
        "box": {"lat": lat, "lon": lon, "halfDegrees": HALF},
        "thresholds": {"wellWateredEsi": WET, "stressedEsi": DRY, "minClearShare": MIN_CLEAR},
        "years": f"{YEARS.start}-{YEARS.stop - 1}, February-April, daytime passes",
        "skipped": skipped,
        "monthly": {int(m): {k: (round(float(v), 3) if k != "overpasses" else int(v)) for k, v in r.items()} for m, r in monthly.iterrows()},
        "overpasses": rows,
    }, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(monthly.to_string())
    print(f"wrote {OUT.relative_to(RESEARCH.parent)} ({len(rows)} clear daytime overpasses)")


if __name__ == "__main__":
    main()
