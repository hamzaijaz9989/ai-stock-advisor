"""Serve the static dashboard for a private GitHub Codespaces preview."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1] / "web"
os.chdir(ROOT)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler)
    print(f"AI Stock Advisor dashboard available on port {port}")
    server.serve_forever()
