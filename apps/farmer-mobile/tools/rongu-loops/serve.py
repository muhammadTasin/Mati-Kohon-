"""Serve the dashboard's Rongu and the capture page, and save the frames the page sends.

    python apps/farmer-mobile/tools/rongu-loops/serve.py [--port 8790] [--out <frames dir>]

Open http://127.0.0.1:8790/__capture/ in a browser: it renders the loops and posts every frame here,
into <out>/<loop>/<nnn>.png. Then run build.py on the same folder. Local use only (it binds 127.0.0.1).
"""
import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[2] / "saao-dashboard" / "public"
FRAME = re.compile(r"^/__frames/([a-z0-9_-]+)/(\d{3})\.png$")
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css",
         ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml"}


class Handler(SimpleHTTPRequestHandler):
    out: Path

    def translate_path(self, path):
        if path.split("?")[0].startswith("/__capture/"):
            name = path.split("?")[0][len("/__capture/"):] or "capture.html"
            return str(HERE / Path(name).name)
        return super().translate_path(path)

    def guess_type(self, path):
        # Windows' registry can map .js to text/plain, which breaks module scripts
        return TYPES.get(Path(path).suffix.lower()) or super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        m = FRAME.match(self.path)
        if not m:
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        target = self.out / m.group(1) / f"{m.group(2)}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        if not self.path.startswith("/__frames/"):
            super().log_message(fmt, *args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--out", type=Path, default=HERE / "frames")
    args = ap.parse_args()
    Handler.out = args.out.resolve()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(PUBLIC)))
    print(f"Rongu capture: http://127.0.0.1:{args.port}/__capture/  frames -> {Handler.out}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
