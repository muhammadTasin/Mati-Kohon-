"""How NISAR's open-water threshold was set: L-band HH against NASA OPERA DSWx-HLS on nearly the same days.

For five upazilas with different water (Khaliajuri and Itna in the haor, Tanore in the Barind, Paikgachha and
Batiaghata on the coast), every NISAR GCOV pass from 20 September to 25 October 2026 is paired with OPERA DSWx-HLS
passes within 2 days (granule cloud under 60%). A 30 km box around each upazila is read on NISAR's 80 m grid, and
OPERA's binary water (0 dry, 1 water) is sampled at the same pixel centres, filling from the clearest pass first.
Pairs with less than 40% of the box clear are dropped.

Rules are swept (HH, HV, both, either) and scored by Cohen's kappa over all clear pixels; each site is also left out in
turn to see whether the rule chosen without it holds on it. HV adds nothing over HH alone. Pooled agreement is flat
from -10 to -8 dB (kappa 0.654-0.666 on 18 pairs, 1.58 million pixels; best -8.5): haor water matches best near
-10 dB, coastal water near -7.5 dB. research/live/nisar_water.py uses -9 dB (CHOSEN_DB), within 0.001 of the best
kappa and 2 points from OPERA on haor water, the use that matters most (flooding and drainage on low land).

Output: research/floods/nisar_calibration.csv (one row per pair with the chosen rule), printed sweep
Needs : EARTHDATA_USERNAME / EARTHDATA_PASSWORD (only to read pairs not yet cached), earthaccess, h5py, rasterio, pyproj
Usage : python research/explore/nisar_calibration.py [--workers 6]
"""
from __future__ import annotations

import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "acquire"))
from _common import load_dotenv, out_dir, write_provenance  # noqa: E402

HALF = 15000  # m: a 30 km box
SITES = {"Khaliajuri": (91.1212, 24.7023), "Itna": (91.0826, 24.5491), "Paikgachha": (89.3403, 22.5906),
         "Tanore": (88.5312, 24.6202), "Batiaghata": (89.5162, 22.7143)}
WINDOW = ("2026-09-20", "2026-10-25")
CHOSEN_DB = -9.0  # the threshold in research/live/nisar_water.py (see the docstring for why)
REGIONS = {"haor": ("Khaliajuri", "Itna"), "Barind": ("Tanore",), "coast": ("Paikgachha", "Batiaghata")}
OUT = ROOT / "research" / "floods" / "nisar_calibration.csv"
FS = None


def login() -> None:
    import earthaccess
    global FS
    load_dotenv()
    earthaccess.login(strategy="environment")
    FS = earthaccess.get_fsspec_https_session()


def cloud_of(g) -> float | None:
    for a in g["umm"].get("AdditionalAttributes", []):
        if a.get("Name") == "CloudCoverage":
            try:
                return float(a["Values"][0])
            except (KeyError, ValueError, IndexError):
                return None
    return None


def nisar_box(url: str, lon: float, lat: float) -> dict | None:
    import h5py
    from pyproj import Transformer
    with h5py.File(FS.open(url, block_size=4 * 1024 * 1024, cache_type="blockcache"), "r") as h:
        g = h["science/LSAR/GCOV/grids"].get("frequencyB")
        if g is None or "HHHH" not in g:
            return None
        epsg = int(g["projection"][()])
        x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
        xs, ys = g["xCoordinates"][:], g["yCoordinates"][:]
        c = np.where((xs >= x - HALF) & (xs <= x + HALF))[0]
        r = np.where((ys >= y - HALF) & (ys <= y + HALF))[0]
        if not len(c) or not len(r):
            return None
        w = (slice(r[0], r[-1] + 1), slice(c[0], c[-1] + 1))
        return {"epsg": epsg, "x": xs[w[1]], "y": ys[w[0]], "hh": g["HHHH"][w], "hv": g["HVHV"][w], "mask": g["mask"][w]}


def opera_at(href: str, epsg: int, xs, ys, out: np.ndarray) -> None:
    """OPERA water (0/1) at the NISAR pixel centres, filling only pixels still unknown (255) in `out`."""
    import rasterio
    from pyproj import Transformer
    from rasterio.windows import Window, from_bounds
    X, Y = np.meshgrid(xs, ys)
    with rasterio.open(href, opener=FS.open) as src:
        if src.crs.to_epsg() != epsg:
            X, Y = Transformer.from_crs(epsg, src.crs.to_epsg(), always_xy=True).transform(X, Y)
        win = from_bounds(X.min() - 60, Y.min() - 60, X.max() + 60, Y.max() + 60, src.transform).round_offsets().round_lengths()
        try:
            win = win.intersection(Window(0, 0, src.width, src.height))  # boundless reads fail with a Python opener
        except Exception:
            return
        a = src.read(1, window=win)
        t = src.window_transform(win)
    cols, rows = np.floor((X - t.c) / t.a).astype(int), np.floor((Y - t.f) / t.e).astype(int)
    ok = (rows >= 0) & (rows < a.shape[0]) & (cols >= 0) & (cols < a.shape[1])
    v = np.full(X.shape, 255, np.uint8)
    v[ok] = a[rows[ok], cols[ok]]
    fill = (out == 255) & np.isin(v, (0, 1))
    out[fill] = v[fill]


def pair(job: tuple) -> tuple[str, str]:
    key, lon, lat, url, cands, path = job
    if Path(path).exists():
        return key, "cached"
    err = ""
    for _ in range(3):
        try:
            box = nisar_box(url, lon, lat)
            if box is None:
                return key, "no HH on the 80 m grid here"
            lab = np.full((len(box["y"]), len(box["x"])), 255, np.uint8)
            for _, _, href in cands[:6]:
                opera_at(href, box["epsg"], box["x"], box["y"], lab)
            clear = np.isin(lab, (0, 1)).mean()
            if clear < 0.4:
                return key, f"too little clear OPERA ({clear:.0%})"
            np.savez_compressed(path, hh=box["hh"], hv=box["hv"], mask=box["mask"], opera=lab,
                                opera_dates=np.array([c[0] for c in cands[:6]]))
            return key, f"clear {clear:.0%}"
        except Exception as e:  # a network error: try again
            err = f"{type(e).__name__} {str(e)[:80]}"
    return key, f"failed: {err}"


def scores(pred, ref) -> tuple[float, float]:
    tp, fp, fn, tn = (pred & ref).sum(), (pred & ~ref).sum(), (~pred & ref).sum(), (~pred & ~ref).sum()
    n = tp + fp + fn + tn
    acc = (tp + tn) / n
    pe = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / n ** 2
    return acc, (acc - pe) / (1 - pe) if pe < 1 else 0.0


def rules():
    for t in np.arange(-24, -7.5, 0.5):
        yield f"HH<{t:.1f}", (lambda hh, hv, t=t: hh < t)
    for t in np.arange(-32, -15.5, 0.5):
        yield f"HV<{t:.1f}", (lambda hh, hv, t=t: hv < t)
    for t1 in np.arange(-22, -7.5, 1.0):
        for t2 in np.arange(-30, -17.5, 1.0):
            yield f"HH<{t1:.0f}&HV<{t2:.0f}", (lambda hh, hv, t1=t1, t2=t2: (hh < t1) & (hv < t2))
            yield f"HH<{t1:.0f}|HV<{t2:.0f}", (lambda hh, hv, t1=t1, t2=t2: (hh < t1) | (hv < t2))


def best(pairs: dict, keys: list[str], hh_only: bool = True):
    """The rule with the highest kappa; HH alone by default, the rule in use (half the data to read)."""
    hh, hv, ref = (np.concatenate([pairs[k][i] for k in keys]) for i in range(3))
    return max(((name, scores(f(hh, hv), ref), f) for name, f in rules() if not hh_only or "HV" not in name), key=lambda r: r[1][1])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()
    cache = out_dir("nisar_calibration")
    import earthaccess
    login()
    jobs = []
    for name, (lon, lat) in SITES.items():
        for ng in earthaccess.search_data(short_name="NISAR_L2_GCOV_PROVISIONAL_V1", point=(lon, lat), temporal=WINDOW):
            day = date.fromisoformat(ng["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10])
            key = f"{name}_{day}_{ng['umm']['GranuleUR'].split('_')[5]}"
            cands = earthaccess.search_data(short_name="OPERA_L3_DSWX-HLS_V1", point=(lon, lat),
                                            temporal=(str(day - timedelta(days=2)), str(day + timedelta(days=2))))
            cands = sorted([c for c in cands if (cloud_of(c) or 100) <= 60], key=lambda c: cloud_of(c) or 100)
            cands = [(c["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10], cloud_of(c) or 0,
                      next(l for l in c.data_links() if l.endswith("_B02_BWTR.tif"))) for c in cands]
            if cands:
                url = next(u for u in ng.data_links() if u.endswith(".h5"))
                jobs.append((key, lon, lat, url, cands, str(cache / f"{key}.npz")))
    print(f"{len(jobs)} NISAR passes with an OPERA look within 2 days", flush=True)
    with ProcessPoolExecutor(args.workers, initializer=login) as pool:
        for key, msg in pool.map(pair, jobs):
            print(f"  {key}: {msg}", flush=True)

    pairs = {}
    for p in sorted(cache.glob("*.npz")):
        z = np.load(p)
        with np.errstate(divide="ignore", invalid="ignore"):
            hh, hv = 10 * np.log10(z["hh"]), 10 * np.log10(z["hv"])
        ok = np.isfinite(hh) & np.isfinite(hv) & (z["mask"] > 0) & (z["mask"] < 255) & np.isin(z["opera"], (0, 1))
        pairs[p.stem] = (hh[ok], hv[ok], z["opera"][ok] == 1)
    name, (acc, kappa), f = best(pairs, list(pairs))
    any_name, (any_acc, any_kappa), _ = best(pairs, list(pairs), hh_only=False)
    print(f"\n{len(pairs)} pairs, {sum(len(v[2]) for v in pairs.values())} clear pixels; best HH rule {name}: accuracy {acc:.1%}, "
          f"kappa {kappa:.3f}; best with HV too: {any_name}, accuracy {any_acc:.1%}, kappa {any_kappa:.3f}")
    sites = sorted({k.split("_")[0] for k in pairs})
    for site in sites:
        train = [k for k in pairs if not k.startswith(site + "_")]
        test = [k for k in pairs if k.startswith(site + "_")]
        n2, _, f2 = best(pairs, train)
        hh, hv, ref = (np.concatenate([pairs[k][i] for k in test]) for i in range(3))
        a2, k2 = scores(f2(hh, hv), ref)
        print(f"  {site} left out: rule {n2}, accuracy {a2:.0%}, kappa {k2:.2f}, OPERA water {ref.mean():.0%} vs NISAR {f2(hh, hv).mean():.0%}")
    print("\nHH threshold: pooled accuracy / kappa | per region OPERA vs NISAR water, kappa")
    for t in (-11.0, -10.0, -9.5, -9.0, -8.5, -8.0, -7.5):
        hh, ref = np.concatenate([v[0] for v in pairs.values()]), np.concatenate([v[2] for v in pairs.values()])
        a, k = scores(hh < t, ref)
        parts = []
        for region, sites in REGIONS.items():
            ks = [x for x in pairs if x.split("_")[0] in sites]
            h, r = np.concatenate([pairs[x][0] for x in ks]), np.concatenate([pairs[x][2] for x in ks])
            parts.append(f"{region} {r.mean():.0%} vs {(h < t).mean():.0%}, {scores(h < t, r)[1]:.2f}")
        print(f"  {t:5.1f} dB{' (chosen)' if t == CHOSEN_DB else ''}: {a:.1%} / {k:.3f} | " + " | ".join(parts))
    f = lambda hh, hv: hh < CHOSEN_DB  # noqa: E731
    chosen_acc, chosen_kappa = scores(np.concatenate([v[0] for v in pairs.values()]) < CHOSEN_DB, np.concatenate([v[2] for v in pairs.values()]))
    rows = []
    for k, (hh, hv, ref) in pairs.items():
        pred = f(hh, hv)
        a, kp = scores(pred, ref)
        site, day, track = k.split("_")
        rows.append({"site": site, "nisar_date": day, "track": track, "clear_px": len(ref), "opera_water": round(ref.mean(), 3),
                     "nisar_water": round(pred.mean(), 3), "agreement": round(a, 3), "kappa": round(kp, 3),
                     "hh_water_median_db": round(float(np.median(hh[ref])), 1) if ref.any() else None,
                     "hh_land_median_db": round(float(np.median(hh[~ref])), 1) if (~ref).any() else None, "rule": f"HH<{CHOSEN_DB}"})
    df = pd.DataFrame(rows)
    df.to_csv(OUT, index=False)
    write_provenance(OUT, source="NASA-ISRO NISAR GCOV (PROVISIONAL, ASF DAAC) 80 m HH/HV against NASA OPERA DSWx-HLS v1 within 2 days",
                     window=list(WINDOW), sites=SITES, best_rule=name, best_kappa=round(kappa, 3),
                     chosen_rule=f"HH<{CHOSEN_DB}", accuracy=round(chosen_acc, 3), kappa=round(chosen_kappa, 3))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(df)} pairs")


if __name__ == "__main__":
    main()
