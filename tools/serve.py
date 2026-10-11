#!/usr/bin/env python3
"""로컬 미리보기 서버 (Cloudflare Pages처럼 /about → about.html 로 연결)
사용법: python3 tools/serve.py  →  http://localhost:8787
"""
import http.server, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent / "public"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def do_GET(self):
        p = self.path.split("?")[0]
        if p != "/" and not p.endswith("/") and "." not in p.rsplit("/", 1)[-1]:
            if (ROOT / (p.lstrip("/") + ".html")).exists():
                self.path = p + ".html" + ("?" + self.path.split("?")[1] if "?" in self.path else "")
        q = self.path.split("?")[0]
        if q.endswith("/") and q != "/" and (ROOT / q.lstrip("/") / "index.html").exists():
            pass
        elif not (ROOT / q.lstrip("/")).exists() and self.path != "/":
            self.path = "/404.html"
        return super().do_GET()
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
