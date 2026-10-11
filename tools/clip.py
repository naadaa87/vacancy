import sys, asyncio
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/tmp/claude-0/-home-claude/16c752ac-8a3c-52b1-8161-ffe23f13b763/scratchpad/shots")
path = sys.argv[1]; w = int(sys.argv[2]); ys = [int(x) for x in sys.argv[3:]]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8787/" + path, wait_until="networkidle")
        await pg.wait_for_timeout(1800)
        h = await pg.evaluate("document.documentElement.scrollHeight")
        print("height", h)
        for i, y in enumerate(ys):
            await pg.screenshot(path=str(OUT / f"clip-{(path or 'index').replace('/','_')}-{w}-{y}.png"), clip={"x":0,"y":y,"width":w,"height":min(900, h-y)}, full_page=True)
        await b.close()
asyncio.run(main())
