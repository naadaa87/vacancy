#!/usr/bin/env python3
"""페이지 스크린샷 (검수용). 사용법: python3 tools/shot.py [page ...]"""
import sys, asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/claude-0/-home-claude/16c752ac-8a3c-52b1-8161-ffe23f13b763/scratchpad/shots")
OUT.mkdir(parents=True, exist_ok=True)
pages = sys.argv[1:] or ["", "solution", "models", "cases", "brands", "about", "partners", "assessment", "insights", "contact", "insights/vacancy-development-pnl", "privacy", "404"]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, tag in ((1440, "d"), (390, "m")):
            ctx = await b.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
            pg = await ctx.new_page()
            errors = []
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            for path in pages:
                await pg.goto("http://127.0.0.1:8787/" + path, wait_until="networkidle")
                await pg.wait_for_timeout(300)
                name = (path or "index").replace("/", "_")
                await pg.screenshot(path=str(OUT / f"{name}-{tag}.png"), full_page=True)
                sw = await pg.evaluate("document.documentElement.scrollWidth")
                print(f"{tag} {path or '/'}: scrollWidth={sw}")
            if errors: print("console errors:", errors)
            await ctx.close()
        await b.close()
asyncio.run(main())
