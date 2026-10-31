"""Claims the 1 km grid was asked to support, tested against independent records (31 October 2026). Two did not hold,
and are kept here so the advice does not drift back to them.

  1. "The Aman season is shifting." Per cropland cell and year 2001-2024, the day Aman is cut: the smoothed MODIS NDVI
     past half way down from its August-November peak to the trough before the winter peak. National median per year,
     Theil-Sen trend and Kendall's test; per upazila (20 km2 of cropland or more), how many trends are significant.
  2. "Cut Aman earlier and a third crop fits." BRRI's 2014-15 upazila land use (research/crops/upazila_land_use.csv):
     the share of net cropped area grown three or four times a year, against the satellite's Aman cut day in 2013-2015,
     across the country, within BRRI's regions (each region's mean taken out of both), and over time (the change in
     cut day 2001-05 to 2019-23 against the change in the grid's crops a year, field_conditions.json).
  3. The Aman record against BBS: district Aman production 2012-13 to 2024-25 (research/bbs/crop_district_panel.csv),
     its departure from each district's own log-linear trend, against the district's cropland greenness departure in
     mid-September to October (the record's window), and which large losses the record also shows.
  4. "SMAP can say whether the topsoil is wetter or drier than usual before the winter sowing" (research/grid/smap.py).
     Did not hold: SMAP's record breaks dry from late December 2023, against NASA POWER's rain and MERRA-2's surface
     wetness at the 64 district centres (research/data/power/daily, the reprocessed archive), and its change from one
     October to the next barely follows GPM IMERG's rain (research/data/imerg_nrt, the Late run against its own
     2001-2025 baseline, which also says how dry this October is).

Output: research/pilots/field_grid_checks.json
Usage : python research/grid/checks.py   (after build.py; EDEN_GRID_DIR as for build.py)
"""
from __future__ import annotations

import json
import re
import warnings
from datetime import date

import numpy as np
import pandas as pd
from scipy import stats

import history
import ndvi
import smap
from _grid import ENGINE_DATA, RESEARCH, load_grid

YEARS = list(range(2001, 2025))
OUT = RESEARCH / "pilots" / "field_grid_checks.json"
warnings.filterwarnings("ignore", category=RuntimeWarning)


def aman_cut_day(m_dates, cube) -> np.ndarray:
    """(years, cells): the day of the year Aman is half cut, NaN where no clear Aman peak and fall."""
    out = np.full((len(YEARS), cube.shape[1]), np.nan, np.float32)
    for c0, idx, sm in ndvi._eight_day(m_dates, cube):
        n = sm.shape[1]
        cols = np.arange(n)
        for j, y in enumerate(YEARS):
            lo, a_hi = idx.searchsorted(pd.Timestamp(y, 8, 15)), idx.searchsorted(pd.Timestamp(y, 11, 30))
            w_lo, w_hi = idx.searchsorted(pd.Timestamp(y + 1, 1, 1)), idx.searchsorted(pd.Timestamp(y + 1, 4, 15))
            seg = sm[lo:w_hi + 1]
            a = np.where(np.isnan(seg[:a_hi - lo + 1]), -9, seg[:a_hi - lo + 1])
            pk, p = a.argmax(0), a.max(0)
            wk = np.where(np.isnan(seg[w_lo - lo:]), -9, seg[w_lo - lo:]).argmax(0) + (w_lo - lo)
            steps = np.arange(seg.shape[0])[:, None]
            between = (steps > pk) & (steps < wk)
            segf = np.where(np.isnan(seg), 9, seg)
            trough = np.where(between, segf, 9).min(0)
            half = p - 0.5 * (p - trough)
            below = between & (segf <= half)
            s = np.where(below.any(0), below.argmax(0), -1)
            prev, cur = seg[np.clip(s - 1, 0, None), cols], seg[np.clip(s, 0, None), cols]
            f = np.clip((prev - half) / (prev - cur), 0, 1)
            day = (idx[lo] - pd.Timestamp(y, 1, 1)).days + 1 + (s - 1 + f) * 8
            out[j, c0:c0 + n] = np.where((p >= 0.45) & (p - trough >= 0.12) & (trough < 9) & (s > 0), day, np.nan)
    return out


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", str(s).lower())


def smap_check(g) -> dict:
    """Claim 4: SMAP's topsoil as "wetter or drier than usual"."""
    dates, val = smap.load(g)
    D = pd.DatetimeIndex(dates)
    farm = g.crop_km2 >= 20
    farm[0] = False
    v = np.nanmean(np.stack([val["am"], val["pm"]]), 0)
    seasons = {"Dec-Feb": (12, 1, 2), "Jun-Sep": (6, 7, 8, 9), "Oct-Nov": (10, 11)}
    out: dict = {"days": len(dates), "from": dates[0].isoformat(), "to": dates[-1].isoformat()}

    # the break: each farm upazila's seasons, 2021-22 against 2024-25, and the national monthly means
    def mean_of(years, months, x=v):
        return np.nanmean(x[D.year.isin(years) & D.month.isin(months)], 0)
    brk = {}
    for s, months in seasons.items():
        d = (mean_of([2024, 2025], months) - mean_of([2021, 2022], months))[farm]
        d = d[np.isfinite(d)]
        brk[s] = {"upazilas": len(d), "medianChange": round(float(np.median(d)), 3), "shareDrier": round(float((d < 0).mean()), 2)}
    monthly = {}
    for y in sorted(set(D.year)):
        sel = [(D.year == y) & (D.month == m) for m in range(1, 13)]
        monthly[str(y)] = [round(float(np.nanmean(v[s][:, farm])), 3) if s.any() else None for s in sel]
    out["break"] = {"upazilaChange2021_22to2024_25": brk, "nationalMonthly": monthly}

    # against the rain and MERRA-2's wetness at each district centre (NASA POWER's reprocessed archive)
    dist = np.array([""] + [norm(p["district"]) for p in g.places])
    power = {norm(p.stem[5:]): p for p in (RESEARCH / "data" / "power" / "daily").glob("ADM2_*.parquet")}
    per = []
    by_district = {}
    for dn in sorted(set(dist[1:])):
        us = [u for u in range(1, len(dist)) if dist[u] == dn and farm[u]]
        if not us:
            continue
        w = g.crop_km2[us]
        x = v[:, us]
        ok = np.isfinite(x)
        with np.errstate(all="ignore"):
            series = np.where(ok.sum(1) >= 1, np.nansum(np.where(ok, x * w, 0), 1) / (ok * w).sum(1), np.nan)
        by_district[dn] = pd.Series(series, index=D)
        if dn not in power:
            continue
        pw = pd.read_parquet(power[dn])
        pw.index = pd.to_datetime(pw.index)
        for s, months in seasons.items():
            row = {"district": dn, "season": s}
            for tag, yrs in (("a", (2019, 2020, 2021, 2022, 2023)), ("b", (2024, 2025))):
                sm = by_district[dn][D.year.isin(yrs) & D.month.isin(months)].dropna()
                p = pw[pw.index.year.isin(yrs) & pw.index.month.isin(months)]
                row[f"sm_{tag}"] = sm.mean()
                row[f"gw_{tag}"] = pw["GWETTOP"].reindex(sm.index).mean()
                row[f"rain_{tag}"] = p["PRECTOTCORR"].mean()
            per.append(row)
    t = pd.DataFrame(per).dropna()
    vs_power = {}
    for s, x in t.groupby("season"):
        d_sm, d_gw, rain = x.sm_b - x.sm_a, x.gw_b - x.gw_a, 100 * x.rain_b / x.rain_a
        vs_power[s] = {"districts": len(x), "smapChange": round(float(d_sm.median()), 3),
                       "merra2WetnessChange": round(float(d_gw.median()), 3), "rainPctOf2019_23": round(float(rain.median())),
                       "smapDrierWhileRainAndMerra2Not": int(((d_sm < -0.02) & (rain >= 90) & (d_gw >= 0)).sum())}
    out["againstPower"] = vs_power

    # does SMAP's change from one October to the next follow the rain? (GPM IMERG Late, district centres)
    im_dir = RESEARCH / "data" / "imerg_nrt"
    if (im_dir / "imerg_daily_sites.parquet").exists() and (im_dir / "imerg_late_baseline_sites.parquet").exists():
        late = pd.concat([pd.read_parquet(im_dir / "imerg_late_baseline_sites.parquet"),
                          pd.read_parquet(im_dir / "imerg_daily_sites.parquet")[["site_id", "date", "precip_mm"]]])
        late["date"] = pd.to_datetime(late["date"])
        late = late.drop_duplicates(["site_id", "date"], keep="last")
        end = pd.Timestamp(dates[-1])
        def rain(site, y):
            e = end.replace(year=y)
            r = late[(late.site_id == site) & (late.date > e - pd.Timedelta(days=30)) & (late.date <= e)]
            return r.precip_mm.sum() if len(r) >= 28 else np.nan
        sites = {norm(s[5:]): s for s in late.site_id.unique() if s.startswith("ADM2_")}
        pairs, dry = [], []
        for dn, series in by_district.items():
            if dn not in sites:
                continue
            def sm(y):
                e = end.replace(year=y)
                x = series[(series.index > e - pd.Timedelta(days=30)) & (series.index <= e)].dropna()
                return x.mean() if len(x) >= smap.MIN_PASSES else np.nan
            pairs.append((sm(end.year) - sm(end.year - 1), rain(sites[dn], end.year) - rain(sites[dn], end.year - 1)))
        for dn, site in sites.items():
            past = np.array([rain(site, y) for y in range(2001, end.year)])
            now = rain(site, end.year)
            if np.isfinite(now) and np.isfinite(past).sum() >= 20:
                dry.append((dn, now, np.nanmedian(past), int((past < now).sum()), int(np.isfinite(past).sum())))
        p = np.array([x for x in pairs if np.all(np.isfinite(x))])
        rho = stats.spearmanr(p[:, 0], p[:, 1])
        out["followsRain"] = {"window": f"30 days to {end.date()}, {end.year} against {end.year - 1}", "districts": len(p),
                              "spearman": round(float(rho.correlation), 2), "p": round(float(rho.pvalue), 3),
                              "medianRainChangeMm": round(float(np.median(p[:, 1]))),
                              "medianSmapChange": round(float(np.median(p[:, 0])), 3)}
        dd = pd.DataFrame(dry, columns=["district", "mm", "medianMm", "yearsLower", "years"])
        out["rainThisOctober"] = {
            "window": f"30 days to {end.date()}", "source": "GPM IMERG Late, against the Late run's own 2001-2025",
            "districts": len(dd), "lowestOfAllYears": int((dd.yearsLower == 0).sum()),
            "medianPctOfMedian": round(float((100 * dd.mm / dd.medianMm).median())),
            "wettest": dd.assign(pct=(100 * dd.mm / dd.medianMm).round()).nlargest(5, "pct")[["district", "pct"]].values.tolist()}
    out["verdict"] = ("SMAP L3 is not used for 'wetter or drier than usual': its record breaks dry from late December 2023, "
                      "and its year-to-year change barely follows the rain over Bangladesh's cropland")
    return out


def main() -> None:
    g = load_grid()
    ids = [p["id"] for p in g.places]
    farm = g.crop_km2 >= 20
    m_dates, m_cube = ndvi.load_cube(g, "modis")
    cut, _ = g.per_upazila(aman_cut_day(m_dates, m_cube))               # (years, upazilas)
    out: dict = {"generatedOn": date.today().isoformat()}

    # 1. has the Aman cut day moved?
    nat = np.nanmedian(cut[:, farm], axis=1)
    ts = stats.theilslopes(nat, YEARS)
    trends = []
    for u in np.where(farm)[0]:
        ok = np.isfinite(cut[:, u])
        if ok.sum() >= 18:
            yy, vv = np.array(YEARS)[ok], cut[ok, u]
            trends.append((stats.theilslopes(vv, yy)[0], stats.kendalltau(yy, vv).pvalue))
    tr = np.array(trends)
    out["amanCutTiming"] = {
        "nationalMedianDay": round(float(np.median(nat)), 1),
        "trendDaysPerDecade": round(float(ts[0] * 10), 1),
        "kendallP": round(float(stats.kendalltau(YEARS, nat).pvalue), 3),
        "upazilas": len(tr), "earlierSignificant": int(((tr[:, 0] < 0) & (tr[:, 1] < 0.05)).sum()),
        "laterSignificant": int(((tr[:, 0] > 0) & (tr[:, 1] < 0.05)).sum()),
        "verdict": "no national shift; upazilas split both ways"}

    # 2. does an earlier Aman cut go with a third crop?
    lu = pd.read_csv(RESEARCH / "crops" / "upazila_land_use.csv")
    by_name = {norm(i.replace("ADM3_", "")): k for k, i in enumerate(ids, start=1)}
    lu["k"] = lu.adm3_name.map(lambda s: by_name.get(norm(s)))
    lu = lu.dropna(subset=["k"]).astype({"k": int})
    lu["triple"] = (lu.triple_cropped_ha + lu.quadruple_cropped_ha) / lu.net_cropped_ha
    yrs = [YEARS.index(y) for y in (2013, 2014, 2015)]
    lu["cut"] = [np.nanmean(cut[yrs, k]) for k in lu.k]
    s = lu[farm[lu.k] & lu.cut.notna() & lu.triple.notna()].copy()
    rho = stats.spearmanr(s.cut, s.triple)
    s["cut_w"] = s.cut - s.groupby("region").cut.transform("mean")
    s["triple_w"] = s.triple - s.groupby("region").triple.transform("mean")
    within = stats.pearsonr(s.cut_w, s.triple_w)
    bands = pd.cut(s.cut, [0, 305, 312, 319, 326, 400], labels=["before 1 Nov", "1-8 Nov", "8-15 Nov", "15-22 Nov", "after 22 Nov"])
    fc = json.loads((ENGINE_DATA / "field_conditions.json").read_text(encoding="utf-8"))
    cy = fc["cropsByYear"]["years"]
    change = []
    for uid, r in fc["upazilas"].items():
        k = ids.index(uid) + 1
        if not farm[k] or not r.get("cropsByYear"):
            continue
        c = np.array([np.nan if v is None else v for v in r["cropsByYear"]], float)
        early, late = [cy.index(y) for y in range(2001, 2006)], [cy.index(y) for y in range(2019, 2024)]
        dc = np.nanmean(c[late]) - np.nanmean(c[early])
        dh = np.nanmean(cut[[YEARS.index(y) for y in range(2019, 2024)], k]) - np.nanmean(cut[[YEARS.index(y) for y in range(2001, 2006)], k])
        if np.isfinite(dc) and np.isfinite(dh):
            change.append((dh, dc))
    ch = np.array(change)
    over_time = stats.spearmanr(ch[:, 0], ch[:, 1])
    out["thirdCropGate"] = {
        "upazilas": len(s),
        "acrossCountry": {"spearman": round(float(rho.correlation), 2), "p": float(f"{rho.pvalue:.1e}"),
                          "tripleShareByCutDay": {str(b): round(float(v), 2) for b, v in s.groupby(bands, observed=True).triple.median().items()}},
        "withinRegions": {"pearson": round(float(within[0]), 2), "p": round(float(within[1]), 2)},
        "overTime": {"upazilas": len(ch), "spearman": round(float(over_time.correlation), 2), "p": round(float(over_time.pvalue), 2)},
        "verdict": "a north-west against east and south difference, not a lever: it vanishes within regions and over time"}

    # 3. the Aman record against BBS district production
    rec = fc["amanRecord"]
    m_up, _ = ndvi.upazila_series(g, m_cube)
    years = np.array(list(ndvi.BASE_YEARS))
    a = history.aman_greenness(m_dates, m_up)
    dist = np.array([""] + [p["district"] for p in g.places])
    fix = {"brahamanbaria": "brahmanbaria", "nawabganj": "chapainawabganj"}
    p = pd.read_csv(RESEARCH / "bbs" / "crop_district_panel.csv")
    p = p[(p.crop == "Aman rice") & (p.variant == "total") & (p.production_t > 0)].copy()
    p["y"] = p.year.str[:4].astype(int)
    p["dk"] = p.district.map(lambda s: fix.get(norm(s), norm(s)))
    pairs, big = [], []
    for dname in sorted(set(dist[1:])):
        us = [u for u in range(1, len(ids) + 1) if dist[u] == dname and g.crop_km2[u] > 0]
        w = g.crop_km2[us]
        v = a[:, us]
        ok = np.isfinite(v)
        series = np.where(ok.any(1), np.nansum(np.where(ok, v * w, 0), 1) / np.maximum((ok * w).sum(1), 1e-9), np.nan)
        _, resid = ndvi.detrend(series[:, None], years.astype(float), float(years[-1]))
        d = p[p.dk == fix.get(norm(dname), norm(dname))].sort_values("y")
        if len(d) < 10:
            continue
        lv = np.log(d.production_t.values)
        dep = (lv - np.polyval(np.polyfit(d.y, lv, 1), d.y)) * 100
        for yy, dd in zip(d.y, dep):
            if yy in years:
                pairs.append((resid[list(years).index(yy), 0], dd))
                if dd <= -15:
                    big.append({"district": dname, "season": f"{yy}-{str(yy + 1)[2:]}", "productionDepPct": round(float(dd)),
                                "greennessDep": round(float(resid[list(years).index(yy), 0]), 3)})
    pr = np.array(pairs)
    r = stats.pearsonr(pr[:, 0], pr[:, 1])
    out["amanRecordVsBbs"] = {
        "districtSeasons": len(pr), "pearson": round(float(r[0]), 2), "p": float(f"{r[1]:.1e}"),
        "largeLosses": sorted(big, key=lambda b: b["productionDepPct"]),
        "checks": [{k: c[k] for k in ("name", "years", "z", "caught")} for c in rec["checks"]],
        "widespread": rec["widespread"],
        "verdict": "the record shows long, severe losses (Aila, the 2020 and 2024 floods) but BBS district figures "
                   "are too noisy to calibrate it"}

    # 4. SMAP's topsoil as "wetter or drier than usual"
    out["smapCheck"] = smap_check(g)
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ("largeLosses",)} if isinstance(v, dict) else v
                      for k, v in out.items()}, indent=1))


if __name__ == "__main__":
    main()
