"""The landing page's two small maps, drawn once from data (python research/export/landing_maps.py bd|world).

bd:    apps/saao-dashboard/public/img/bd-land.svg, the country in the story's second step, every upazila coloured by its
       land: haor and beel (the upazila's usual land is low: Landsat water 3-6 months a year, or BRRI's Boro-only
       pattern), salty coast (SRDI's 2009 survey finds half its cultivated land saline), else its median height
       (NASADEM) in four steps, with the big rivers drawn over it. Same projection as landing-map.js (and the outline
       #lmGhostLand), so the pins and the slab line up.
world: apps/saao-dashboard/public/globe-land.js, the land on the turning globe behind Rongu, from Natural Earth's
       1:110m land (public domain; world-atlas 2.0.2's land-110m.json, passed with --src), simplified to about a
       degree and rounded to a tenth of one.
"""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps" / "saao-dashboard" / "public"

# ---------------------------------------------------------------------------------------------- shared: simplifying


def rdp(pts, eps):
    """Ramer-Douglas-Peucker on a list of (x, y)."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    far, at = -1.0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm if (dx or dy) else math.hypot(x - x1, y - y1)
        if d > far:
            far, at = d, i
    if far <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: at + 1], eps)[:-1] + rdp(pts[at:], eps)


def ring_simplify(ring, eps):
    """A closed ring simplified from its two farthest-apart halves, so the closing point survives."""
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 4:
        return ring
    half = len(ring) // 2
    return rdp(ring[: half + 1], eps)[:-1] + rdp(ring[half:] + [ring[0]], eps)[:-1]


def area(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))) / 2


# ---------------------------------------------------------------------------------------------- bd: the land map

# Each class: its colour and what the legend calls it (landing-story.js shows the legend)
CLASSES = {
    "haor": "#9CCBC4",   # haor and beel
    "salt": "#C9D3D6",   # salty coast
    "e0": "#BFDCB2",     # the delta and floodplains, 6 m or less
    "e1": "#D2E4B4",     # 6-15 m
    "e2": "#E5DBA6",     # 15-35 m: the Barind, the Madhupur tract, the north-west piedmont
    "e3": "#D5BC93",     # over 35 m: the hills
}
RIVER = "#6FA6C6"
# The big rivers, (lon, lat) along their main channel, and their width in map units (the map is 1000 high)
RIVERS = [
    ("Jamuna", 9, [(89.84, 25.95), (89.74, 25.55), (89.69, 25.15), (89.70, 24.85), (89.73, 24.45), (89.72, 24.15), (89.70, 23.86), (89.75, 23.78)]),
    ("Padma", 9, [(88.10, 24.85), (88.32, 24.58), (88.60, 24.36), (88.90, 24.18), (89.03, 24.07), (89.35, 23.95), (89.75, 23.78), (90.05, 23.55), (90.35, 23.38), (90.62, 23.22)]),
    ("Meghna", 9, [(90.98, 24.05), (90.85, 23.70), (90.62, 23.22), (90.74, 22.85), (90.86, 22.55), (91.02, 22.28)]),
    ("Surma", 5, [(92.45, 24.88), (92.10, 24.90), (91.87, 24.90), (91.40, 25.02), (91.15, 24.72), (91.02, 24.38), (90.98, 24.05)]),
    ("Teesta", 5, [(88.96, 26.32), (89.25, 26.05), (89.50, 25.80), (89.72, 25.56)]),
    ("Old Brahmaputra", 4, [(89.69, 25.15), (90.00, 25.00), (90.40, 24.75), (90.70, 24.40), (90.98, 24.05)]),
    ("Gorai", 4, [(89.15, 23.95), (89.32, 23.60), (89.58, 23.20), (89.70, 22.75), (89.62, 22.30)]),
]


def classify(u):
    land = u["land"]
    if land["type"] == "low":
        return "haor"
    if ((u.get("salinity") or {}).get("salineShare") or 0) >= 0.5:
        return "salt"
    e = land.get("elevMedianM") or 0
    return "e0" if e <= 6 else "e1" if e <= 15 else "e2" if e <= 35 else "e3"


def bd():
    geo = json.loads((PUBLIC / "data" / "bd_upazilas.geojson").read_text(encoding="utf-8"))
    profile = json.loads((ROOT / "packages" / "rotation-engine" / "src" / "data" / "upazila_profile.json").read_text(encoding="utf-8"))["upazilas"]
    lons, lats = [], []

    def each(c):
        if isinstance(c[0], (int, float)):
            lons.append(c[0]); lats.append(c[1])
        else:
            for x in c:
                each(x)

    for f in geo["features"]:
        each(f["geometry"]["coordinates"])
    min_lon, max_lat, min_lat = min(lons), max(lats), min(lats)
    k = 1000 / (max_lat - min_lat)
    cos = math.cos((min_lat + max_lat) / 2 * math.pi / 180)
    xy = lambda lon, lat: ((lon - min_lon) * cos * k, (max_lat - lat) * k)  # noqa: E731

    paths = {c: [] for c in CLASSES}
    counts = {c: 0 for c in CLASSES}
    for f in geo["features"]:
        cls = classify(profile[f["properties"]["id"]])
        counts[cls] += 1
        polys = [f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]
        for poly in polys:
            for ring in poly:
                pts = ring_simplify([xy(*p) for p in ring], 2.6)  # under a pixel at the size it is shown
                if len(pts) < 3 or area(pts) < 4:
                    continue
                paths[cls].append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in pts) + "Z")
    rivers = []
    for _, width, line in RIVERS:
        pts = [xy(*p) for p in line]
        rivers.append(f'<path d="M{"L".join(f"{x:.0f} {y:.0f}" for x, y in pts)}" stroke-width="{width}"/>')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 721 1048">'
        "<!-- Bangladesh by its land (research/export/landing_maps.py bd): NASADEM height, Landsat water and BRRI's "
        "patterns for the haor, SRDI's salinity survey for the coast; the big rivers over it -->"
        '<g fill-rule="evenodd" stroke="#F6F2E8" stroke-opacity=".35" stroke-width=".9" stroke-linejoin="round">'
        + "".join(f'<path fill="{CLASSES[c]}" d="{"".join(paths[c])}"/>' for c in CLASSES if paths[c])
        + f'</g><g fill="none" stroke="{RIVER}" stroke-linecap="round" stroke-linejoin="round">'
        + "".join(rivers)
        + "</g></svg>"
    )
    out = PUBLIC / "img" / "bd-land.svg"
    out.write_text(svg, encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {len(svg) // 1024} KB; upazilas by class {counts}")


# ---------------------------------------------------------------------------------------------- world: the globe's land


def world(src):
    topo = json.loads(Path(src).read_text(encoding="utf-8"))
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring_of(idx):
        pts = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts

    rings = []
    for g in topo["objects"]["land"]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        for poly in polys:
            ring = ring_simplify(ring_of(poly[0]), 0.9)  # outer rings only: lakes are not drawn
            if len(ring) >= 4 and area(ring) >= 2:
                rings.append(ring)
    land, ice = [], []
    for ring in rings:
        lat = sum(p[1] for p in ring) / len(ring)
        lon = sum(p[0] for p in ring) / len(ring)
        ice.append(1 if lat < -60 or (lat > 60 and -75 < lon < -10) else 0)  # Antarctica and Greenland
        land.append([round(v * 10) for p in ring for v in p])
    js = (
        "// The land on the globe behind Rongu (landing-orbit.js): Natural Earth 1:110m land, public domain, from\n"
        "// world-atlas 2.0.2; simplified to about a degree by research/export/landing_maps.py world. Each ring is\n"
        "// lon, lat, lon, lat, ... in tenths of a degree; ICE marks Antarctica and Greenland.\n"
        f"export const LAND = {json.dumps(land, separators=(',', ':'))};\n"
        f"export const ICE = {json.dumps(ice, separators=(',', ':'))};\n"
    )
    out = PUBLIC / "globe-land.js"
    out.write_text(js, encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {len(js) // 1024} KB, {len(land)} rings, {sum(len(r) // 2 for r in land)} points")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("what", choices=["bd", "world"])
    ap.add_argument("--src", help="world-atlas land-110m.json (for world)")
    a = ap.parse_args()
    bd() if a.what == "bd" else world(a.src)
