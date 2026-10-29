"""Month by month: when a place's fields meet heat, cold, heavy rain and dry soil, and when the land is bare.

Field Shift asks a tool to "highlight times when fields are typically bare, seasons when current crops appear more
vulnerable", and to look at "temperature, heat stress, rainfall, soil moisture, evaporation, frost risk, extreme
precipitation ... and long-term water trends". This script makes the two calendars behind that, from data already
cached for the replay:

1. Weather risk by month (research/data/power/daily, the same points and BMD station correction as national_replay.py),
   seasons 2001-2025, for the Talanda pilot and the 64 district points:
     hot days        maximum temperature 36 C or more (BMD's heat-wave threshold), station-corrected NASA POWER
     cold nights     minimum 10 C or less (BMD's cold-wave threshold)
     near-frost      minimum 4 C or less: ground frost becomes possible (rare in Bangladesh; shown so it is not guessed)
     heavy rain      44 mm or more in a day (BMD "heavy"), NASA GPM IMERG Final via POWER
     erosive rain    23 mm or more in a day (BMD "moderately heavy" and above): the rain that moves bare soil
     dry days        under 1 mm of rain
     ET0             FAO-56 Penman-Monteith reference evapotranspiration (mm)
     ET              NASA POWER's actual evapotranspiration (MERRA-2 land model, EVPTRNS, mm)
     root wetness    NASA POWER GWETROOT (0 dry to 1 saturated), the root-zone soil moisture
   The station correction is the replay's (the nearest BMD station within 100 km); where that station has under three
   years of temperatures the replay uses none, and here the nearest station within 50 km that has them is used (as at
   Thakurgaon, whose raw grid is far hotter in April than its neighbours'). A monthly mean correction does not fix
   the hot tail: at Rajshahi the corrected grid counts about 48 days of 36 C a year in 2014-25 where the station's
   seven complete recent years average 60, so hot days here are a floor.
   plus the same hot-day counts if every day were 1, 2 or 3 C warmer, and erosive-rain days if every day's rain were
   10 or 20 per cent lighter or heavier (for the dashboard's what-if sliders), and the
   trend of each yearly total by two statistical methods: recent (2014-25) minus early (2001-12) means, and a
   Theil-Sen slope with a Mann-Kendall p-value (Kendall's tau against the year).

2. Greenness by month (NASA MODIS MOD13Q1 NDVI, 250 m, one pixel at each of the 544 upazila centres, the AppEEARS
   request fieldshift_ndvi_national_20260927): the median NDVI of each calendar month's good composites, for 2021-25
   and 2001-05. Under about 0.35 the land around the point is bare, flooded or just planted; this is the satellite's
   own view of the bare-field months, beside the replay's calendar.

A grid cell and one pixel describe the landscape around a point, not a farm: these are context for the plan and for
the farmer's own check, not field measurements.

Output: packages/rotation-engine/src/data/season_calendar.json
Usage : python research/explore/season_calendar.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0] / "acquire"))
import national_replay as nr  # noqa: E402  (weather: POWER + BMD station correction + ET0 + IMERG rain)
import national_greenness as ng  # noqa: E402  (crops a year from MODIS NDVI peaks)
from _common import DATA, RESEARCH  # noqa: E402

OUT = RESEARCH.parent / "packages" / "rotation-engine" / "src" / "data" / "season_calendar.json"
NDVI = DATA / "appeears" / "ndvi_national" / "fieldshift-ndvi-national-20260927-MOD13Q1-061-results.csv"
YEARS = range(2001, 2026)
EARLY, RECENT = range(2001, 2013), range(2014, 2026)
HOT_C, COLD_C, FROST_C = 36.0, 10.0, 4.0
HEAVY_MM, EROSIVE_MM, DRY_MM = 44.0, 23.0, 1.0
WARMING = (1, 2, 3)
RAIN_SCALES = (-20, -10, 10, 20)


def r(x: float, d: int = 1) -> float:
    return round(float(x), d)


def monthly_days(flag: pd.Series) -> list[float]:
    """Average number of flagged days in each calendar month, over the seasons."""
    per = flag.groupby([flag.index.year, flag.index.month]).sum().unstack()
    return [r(per[m].mean()) if m in per else 0.0 for m in range(1, 13)]


def monthly_mean_total(x: pd.Series) -> list[float]:
    per = x.groupby([x.index.year, x.index.month]).sum(min_count=20).unstack()
    return [r(per[m].mean(), 0) if m in per else 0.0 for m in range(1, 13)]


def trend(yearly: pd.Series, digits: int = 1) -> dict:
    """Two views of one yearly series: the recent-minus-early difference, and Theil-Sen with a Mann-Kendall p."""
    y = yearly.dropna()
    early, recent = y.loc[EARLY.start:EARLY.stop - 1].mean(), y.loc[RECENT.start:RECENT.stop - 1].mean()
    slope = stats.theilslopes(y.values, y.index.values)[0]
    tau, p = stats.kendalltau(y.index.values, y.values)
    if np.isnan(tau):  # a constant series (no cold nights at all on the coast): no trend
        tau, p = 0.0, 1.0
    return {"early": r(early, digits), "recent": r(recent, digits), "change": r(recent - early, digits),
            "slopePerDecade": r(slope * 10, digits + 1), "kendallTau": r(tau, 2), "p": r(p, 3)}


def place_calendar(p: pd.DataFrame) -> dict:
    p = p.loc[f"{YEARS.start}-01-01":f"{YEARS.stop - 1}-12-31"]
    tmax, tmin, rain = p["tmax"], p["tmin"], p["rain"]
    ok = tmax.notna() & tmin.notna() & rain.notna()
    p, tmax, tmin, rain = p[ok], tmax[ok], tmin[ok], rain[ok]
    months = {
        "rainMm": monthly_mean_total(rain),
        "heavyRainDays": monthly_days(rain >= HEAVY_MM),
        "erosiveRainDays": monthly_days(rain >= EROSIVE_MM),
        "dryDays": monthly_days(rain < DRY_MM),
        "hotDays": monthly_days(tmax >= HOT_C),
        "coldNights": monthly_days(tmin <= COLD_C),
        "nearFrostNights": monthly_days(tmin <= FROST_C),
        "et0Mm": monthly_mean_total(p["et0"]),
        "etMm": monthly_mean_total(p["EVPTRNS"]) if "EVPTRNS" in p else None,
        "rootWet": [r(v, 2) for v in p["GWETROOT"].groupby(p.index.month).mean().reindex(range(1, 13)).values],
    }
    warm = {f"+{d}": monthly_days(tmax >= HOT_C - d) for d in WARMING}
    # Erosive rain days if every day's rain were 10 or 20 per cent lighter or heavier
    rainier = {f"{k:+d}": monthly_days(rain * (1 + k / 100) >= EROSIVE_MM) for k in RAIN_SCALES}
    yr = p.index.year
    yearly = {
        "hotDays": (tmax >= HOT_C).groupby(yr).sum().astype(float),
        "coldNights": (tmin <= COLD_C).groupby(yr).sum().astype(float),
        "heavyRainDays": (rain >= HEAVY_MM).groupby(yr).sum().astype(float),
        "rainMm": rain.groupby(yr).sum(),
        "rootWet": p["GWETROOT"].groupby(yr).mean(),
        "et0Mm": p["et0"].groupby(yr).sum(),
    }
    # The dry season's root zone (January-April), when Rabi crops and Boro draw on the soil and the aquifer
    dry = p[p.index.month.isin([1, 2, 3, 4])]
    yearly["dryRootWet"] = dry["GWETROOT"].groupby(dry.index.year).mean()
    trends = {k: trend(v, 2 if k in ("rootWet", "dryRootWet") else 0 if k in ("rainMm", "et0Mm") else 1) for k, v in yearly.items()}
    # Year by year, for the map's time slider
    by_year = {k: [None if pd.isna(v) else r(v, 2 if "Wet" in k else 0) for v in yearly[k].reindex(YEARS).values]
               for k in ("hotDays", "heavyRainDays", "dryRootWet", "rainMm")}
    return {"months": {k: v for k, v in months.items() if v is not None}, "warmer": warm, "erosiveRainScaled": rainier, "trend": trends,
            "years": by_year}


def groundwater_years(site: str, gws: pd.DataFrame) -> list[float | None]:
    """NASA GLDAS-2.2 (GRACE-assimilated) groundwater storage by year, mm against the 2003-2007 mean (no data before 2003)."""
    g = gws[gws["site_id"] == site]
    if g.empty:
        return [None] * len(YEARS)
    annual = g.groupby(pd.to_datetime(g["date"]).dt.year)["gws_mm"].mean()
    annual = annual[annual.index.isin(YEARS)]
    base = annual.loc[2003:2007].mean()
    return [None if y not in annual.index or pd.isna(annual[y]) else r(annual[y] - base, 0) for y in YEARS]


def greenness() -> dict:
    cols = ["ID", "Date", "MOD13Q1_061__250m_16_days_NDVI", "MOD13Q1_061__250m_16_days_pixel_reliability"]
    d = pd.read_csv(NDVI, usecols=cols)
    d.columns = ["id", "date", "ndvi", "rel"]
    d = d[d["rel"].isin([0, 1])].copy()
    d["date"] = pd.to_datetime(d["date"])
    d["year"], d["month"] = d["date"].dt.year, d["date"].dt.month
    out = {}
    for uid, g in d.groupby("id"):
        nd = g.set_index("date")["ndvi"].sort_index()
        nd = nd[~nd.index.duplicated()]
        # Crops a year (agricultural year November-October), as research/explore/national_greenness.py counts them
        crops_by_year = [int(v) for v in ng.cycles_per_year(nd).reindex(YEARS).fillna(0).values] if len(nd) >= 300 else None
        recent = g[g["year"].between(2021, 2025)].groupby("month")["ndvi"].median().reindex(range(1, 13))
        early = g[g["year"].between(2001, 2005)].groupby("month")["ndvi"].median().reindex(range(1, 13))
        if recent.isna().sum() > 2:
            continue
        out[uid] = {"recent": [None if np.isnan(v) else r(v, 2) for v in recent.values],
                    "early": [None if np.isnan(v) else r(v, 2) for v in early.values],
                    "cropsByYear": crops_by_year}
    return out


def stations_for(lat: float, lon: float, st: pd.DataFrame) -> pd.DataFrame:
    """The replay's station (nearest within 100 km) when it has three years of temperatures; else the nearest within
    50 km that has them (a station further away may sit in another climate, as Srimangal's tea hills for Sylhet)."""
    near = nr.nearest_station(lat, lon, st)
    if near and near["years_ok"]:
        return st[st["wmo"] == near["wmo"]]
    ok = st[st["years_ok"]]
    alt = nr.nearest_station(lat, lon, ok)
    return ok[ok["wmo"] == alt["wmo"]] if alt and alt["km"] <= 50 else None


def weather(site: str, lat: float, lon: float, st: pd.DataFrame | None) -> tuple[pd.DataFrame, dict | None]:
    """national_replay.weather with a chosen station, or none (then the grid's temperatures are used as they are)."""
    if st is not None:
        return nr.weather(site, lat, lon, st)
    p = pd.read_parquet(DATA / "power" / "daily" / f"{site}.parquet")
    p.index = pd.to_datetime(p.index)
    p["tmax"], p["tmin"] = p["T2M_MAX"], p["T2M_MIN"]
    p["et0"] = nr.et0(p, lat)
    p["rain"] = p["IMERG_PRECTOT"].fillna(p["PRECTOTCORR"]) if "IMERG_PRECTOT" in p else p["PRECTOTCORR"]
    return p, None


def main() -> None:
    st = pd.read_csv(RESEARCH / "sites" / "bmd_stations_gsod.csv")
    gsod = DATA / "stations" / "gsod"
    st["path"] = [next(iter(gsod.glob(f"{w}_*.parquet")), None) for w in st["wmo"]]
    st = st.dropna(subset=["path"]).reset_index(drop=True)
    st["years_ok"] = [len(pd.read_parquet(f, columns=["tmax_c", "tmin_c"]).dropna()) >= 3 * 365 for f in st["path"]]

    pilot = pd.read_csv(RESEARCH / "sites" / "pilot_sites.csv").set_index("site_id").loc["RAJ_TANORE"]
    places = [("talanda_tanore", "RAJ_TANORE", float(pilot["lat"]), float(pilot["lon"]))]
    for _, s in pd.read_csv(RESEARCH / "sites" / "districts.csv").iterrows():
        if (DATA / "power" / "daily" / f"{s['site_id']}.parquet").exists():
            places.append((str(s["name"]), s["site_id"], float(s["lat"]), float(s["lon"])))

    gws_file = DATA / "gldas" / "gldas_da_sites.parquet"
    gws = pd.read_parquet(gws_file) if gws_file.exists() else pd.DataFrame(columns=["site_id", "date", "gws_mm"])
    out_places = {}
    for key, site, lat, lon in places:
        p, station = weather(site, lat, lon, stations_for(lat, lon, st))
        cal = place_calendar(p)
        cal["years"]["groundwaterMm"] = groundwater_years(site, gws)
        out_places[key] = {"station": station, **cal}
        m = cal["months"]
        print(f"{key:<16} hot Apr {m['hotDays'][3]:>4}  cold Jan {m['coldNights'][0]:>4}  heavy Jul {m['heavyRainDays'][6]:>3}  "
              f"hot-days trend {cal['trend']['hotDays']['slopePerDecade']:+.2f}/decade p={cal['trend']['hotDays']['p']}")

    green = greenness() if NDVI.exists() else {}
    print(f"greenness calendars: {len(green)} upazilas")
    OUT.write_text(json.dumps({
        "generatedOn": date.today().isoformat(),
        "seasons": f"{YEARS.start}-{YEARS.stop - 1}",
        "source": ("NASA POWER daily (MERRA-2; maximum and minimum temperature corrected by month against the nearest "
                   "BMD station within 100 km, NOAA GSOD) and NASA GPM IMERG Final rain via POWER, at the Talanda pilot "
                   "and the 64 district points; NASA MODIS MOD13Q1 NDVI at the 544 upazila centres (AppEEARS)"),
        "method": __doc__.split("\n\n")[1].strip() if __doc__ else "",
        "thresholds": {"hotC": HOT_C, "coldC": COLD_C, "nearFrostC": FROST_C, "heavyMm": HEAVY_MM, "erosiveMm": EROSIVE_MM,
                       "dryMm": DRY_MM, "lowNdvi": 0.35},
        "trendPeriods": {"early": f"{EARLY.start}-{EARLY.stop - 1}", "recent": f"{RECENT.start}-{RECENT.stop - 1}"},
        "years": list(YEARS),
        "groundwaterSource": "NASA GLDAS-2.2 (GRACE-assimilated) groundwater storage, yearly mean against 2003-2007, at the same points",
        "places": out_places,
        "greenness": {"product": "NASA MODIS MOD13Q1 v061 NDVI, 250 m, one pixel at the upazila centre; monthly median of good composites",
                      "recentYears": "2021-2025", "earlyYears": "2001-2005", "upazilas": green},
    }, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"wrote {OUT.relative_to(RESEARCH.parent)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
