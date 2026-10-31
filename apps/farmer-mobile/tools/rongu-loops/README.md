# Rongu's loops for the app

The app can't run Rongu's three.js model, so it plays short pre-rendered loops of him
(`app/src/main/assets/rongu/*.webp`, played by `ui/components/RonguView.kt`). This folder makes them
from the dashboard's model (`apps/saao-dashboard/public/mascot/`).

| Loop | What he does |
| --- | --- |
| `idle` | breathes, blinks once, glances about |
| `wave` | waves hello |
| `talk` | talks for 2.4 s, then a short pause |
| `point` | points to his left (the right of the screen) |

Each loop lasts 3 s at 24 fps and is transparent. Every one starts and ends in the same idle pose, so
the app can go from one to the next without a jump. That works because the capture sets `motion.loop = 3`,
which rounds each idle rhythm (breathing, sway, tail) to fit a whole number of times into 3 s, and scripts
the blinks and glances instead of leaving them to chance.

## Making them again (after Rongu changes)

1. Start the server. It serves the dashboard's `public/` folder plus the capture page, and saves posted frames:
   `python apps/farmer-mobile/tools/rongu-loops/serve.py --out <frames dir>`
2. Open `http://127.0.0.1:8790/__capture/` in Chrome. It renders all four loops (about 30 s) and logs each
   loop's seam: how far the frame after the last one is from the first one (a mean near 0 is seamless).
3. Build the WebP files: `python apps/farmer-mobile/tools/rongu-loops/build.py <frames dir>`.
   It crops every frame to one shared box, scales it to 360 px tall and writes the loops (quality 50, about
   3 MB for all four) plus `res/drawable-nodpi/rongu_still.webp`, the still picture used before Android 9.
