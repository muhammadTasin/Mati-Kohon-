"""Turn the captured frames into the app's animated WebP loops.

    python apps/farmer-mobile/tools/rongu-loops/build.py <frames dir> [--height 360] [--quality 50]

Every loop is cropped to the same box (the union of all frames), so Rongu stands on the same spot in each
and the app can switch loops without a jump. Writes assets/rongu/<loop>.webp (assets, not res/raw: a raw
resource would be scaled up to the screen's density when decoded) and res/drawable-nodpi/rongu_still.webp
(the idle loop's first frame, for phones before Android 9 and for "remove animations").
Quality 50 keeps the four loops near 3 MB; at a phone's size it looks the same as 80.
"""
import argparse
from pathlib import Path

from PIL import Image

LOOPS = ["idle", "wave", "talk", "point"]
FPS = 24
MAIN = Path(__file__).resolve().parents[2] / "app" / "src" / "main"


def durations(n):
    # whole milliseconds that add up to exactly n / FPS seconds
    return [round((i + 1) * 1000 / FPS) - round(i * 1000 / FPS) for i in range(n)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", type=Path)
    ap.add_argument("--height", type=int, default=360)
    ap.add_argument("--quality", type=int, default=50)
    args = ap.parse_args()

    frames = {name: [Image.open(p).convert("RGBA") for p in sorted((args.frames / name).glob("[0-9][0-9][0-9].png"))] for name in LOOPS}
    w, h = frames["idle"][0].size
    box = None
    for loop in frames.values():
        for im in loop:
            b = im.getchannel("A").point(lambda a: 255 if a > 6 else 0).getbbox()
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box[0] == 0 or box[1] == 0 or box[2] == w or box[3] == h:
        print(f"warning: Rongu touches the edge of the frame {box}; widen the camera")
    pad = 4
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
    scale = args.height / (box[3] - box[1])
    size = (round((box[2] - box[0]) * scale), args.height)
    print(f"crop {box} -> {size[0]}x{size[1]}")

    def shrink(im):
        # resample with premultiplied alpha, so the soft edges don't pick up a dark fringe
        return im.crop(box).convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")

    assets = MAIN / "assets" / "rongu"
    assets.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, loop in frames.items():
        out = [shrink(im) for im in loop]
        path = assets / f"{name}.webp"
        out[0].save(path, save_all=True, append_images=out[1:], duration=durations(len(out)), loop=0,
                    quality=args.quality, alpha_quality=50, method=6, minimize_size=True)
        total += path.stat().st_size
        print(f"rongu/{path.name}: {len(out)} frames, {path.stat().st_size / 1024:.0f} KB")
        if name == "idle":
            still = MAIN / "res" / "drawable-nodpi" / "rongu_still.webp"
            out[0].save(still, quality=90, method=6)
            total += still.stat().st_size
            print(f"{still.name}: {still.stat().st_size / 1024:.0f} KB")
    print(f"total {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
