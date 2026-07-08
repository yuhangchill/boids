#!/usr/bin/env python3
"""Static server for web/ plus an embedding proxy for the word-arithmetic panel.

POST /api/embed  {"words": ["boids", "behavior"]}
  -> {"vectors": {"boids": [256 floats], ...}, "cached": n, "billed": n}

Vectors come from OpenAI text-embedding-3-small at 256 dims (same model and
size as the corpus, so arithmetic stays in one space). Every word is cached in
data/query-cache.json — a term is only ever billed once. Key from repo .env.

  python3 server.py            # http://localhost:8420
"""

import json
import re
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

MODEL = "text-embedding-3-small"
DIMS = 256
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8420

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
CACHE_FILE = ROOT / "data" / "query-cache.json"
WORD_RE = re.compile(r"^[a-z][a-z '\-]{0,38}$")

_lock = threading.Lock()
_cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}


def api_key():
    env = REPO / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    return None


KEY = api_key()


def embed_remote(words):
    req = Request(
        "https://api.openai.com/v1/embeddings",
        data=json.dumps({"model": MODEL, "input": words, "dimensions": DIMS}).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT / "web"), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/embed":
            return self.send_json(404, {"error": "unknown endpoint"})
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            words = [str(w).strip().lower() for w in body["words"]][:16]
        except Exception:
            return self.send_json(400, {"error": "expected {\"words\": [...]}"})
        if not words or not all(WORD_RE.match(w) for w in words):
            return self.send_json(400, {"error": "terms must be short lowercase words"})

        with _lock:
            missing = [w for w in words if w not in _cache]
            if missing:
                if not KEY:
                    return self.send_json(503, {"error": "no OPENAI_API_KEY in repo .env"})
                try:
                    for w, v in zip(missing, embed_remote(missing)):
                        _cache[w] = v
                except Exception as e:
                    return self.send_json(502, {"error": f"embedding api: {e}"})
                CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
                CACHE_FILE.write_text(json.dumps(_cache))
            self.send_json(
                200,
                {
                    "vectors": {w: _cache[w] for w in words},
                    "cached": len(words) - len(missing),
                    "billed": len(missing),
                },
            )


if __name__ == "__main__":
    print(f"projector at http://localhost:{PORT}   (embed key: {'yes' if KEY else 'MISSING'})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
