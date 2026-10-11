#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
공백 홈페이지 빌드 스크립트
사용법:  python3 tools/build.py
결과:    public/ 폴더에 HTML·sitemap·robots 등이 생성됩니다. (assets/ 는 그대로 유지)
"""
import json, os, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import data as D
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"
TPL = Path(__file__).resolve().parent / "templates"

env = Environment(loader=FileSystemLoader(str(TPL)), autoescape=select_autoescape(["html"]), trim_blocks=True, lstrip_blocks=True)
BUILD_ID = time.strftime("%Y%m%d%H%M")

def jsonld(page_id, page, extra=None):
    org = {
        "@type": "Organization",
        "@id": D.SITE["domain"] + "/#org",
        "name": D.SITE["company"],
        "alternateName": ["공백", "GONG BAEK", "BLANK Co., Ltd."],
        "url": D.SITE["domain"],
        "logo": D.SITE["domain"] + "/assets/img/og-image.png",
        "email": D.SITE["email"],
        "telephone": "+82-" + D.SITE["phone"][1:],
        "founder": {"@type": "Person", "name": D.SITE["ceo"]},
        "address": {"@type": "PostalAddress", "streetAddress": "영동대로 602, 6층", "addressLocality": "강남구", "addressRegion": "서울특별시", "addressCountry": "KR"},
    }
    graph = [org, {
        "@type": "WebSite", "@id": D.SITE["domain"] + "/#website", "url": D.SITE["domain"], "name": "공백 — 주식회사 블랭크", "publisher": {"@id": D.SITE["domain"] + "/#org"}, "inLanguage": "ko-KR",
    }]
    if page_id == "index":
        graph.append({"@type": "Service", "name": "공실개발 솔루션 공백", "provider": {"@id": D.SITE["domain"] + "/#org"}, "areaServed": "KR",
                      "serviceType": "상가·건물 공실개발, 공간기획, 운영체계 구축", "url": D.SITE["domain"]})
    if page_id not in ("index", "404"):
        crumbs = [{"@type": "ListItem", "position": 1, "name": "홈", "item": D.SITE["domain"] + "/"}]
        if extra and extra.get("parent"):
            crumbs.append({"@type": "ListItem", "position": 2, "name": extra["parent"][0], "item": D.SITE["domain"] + extra["parent"][1]})
            crumbs.append({"@type": "ListItem", "position": 3, "name": extra["name"], "item": D.SITE["domain"] + page["path"]})
        else:
            crumbs.append({"@type": "ListItem", "position": 2, "name": page["title"].split("|")[0].split("—")[0].strip(), "item": D.SITE["domain"] + page["path"]})
        graph.append({"@type": "BreadcrumbList", "itemListElement": crumbs})
    if page_id == "solution":
        graph.append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in D.FAQ]})
    if extra and extra.get("article"):
        a = extra["article"]
        graph.append({"@type": "Article", "headline": a["title"], "description": a["summary"], "datePublished": a["date"], "inLanguage": "ko-KR",
                      "author": {"@id": D.SITE["domain"] + "/#org"}, "publisher": {"@id": D.SITE["domain"] + "/#org"}, "mainEntityOfPage": D.SITE["domain"] + page["path"]})
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=1)

def common_ctx():
    tags = []
    for c in D.CASES:
        for t in c["tags"]:
            if t not in tags: tags.append(t)
    return dict(site=D.SITE, nav=D.NAV, claims=D.CLAIMS, claims_extra=D.CLAIMS_EXTRA, market=D.MARKET, cases=D.CASES, case_footnote=D.CASE_FOOTNOTE,
                case_types=D.CASE_TYPES, case_tags=tags, models=D.MODELS, model_notice=D.MODEL_NOTICE, process=D.PROCESS, service_types=D.SERVICE_TYPES,
                deliverables=D.DELIVERABLES, collab=D.COLLAB, judgement=D.JUDGEMENT_ITEMS, simulation=D.SIMULATION, timeline=D.TIMELINE,
                principles=D.PRINCIPLES, ceo=D.CEO, brands=D.BRANDS, system=D.SYSTEM, partner_types=D.PARTNER_TYPES, partner_fee_notice=D.PARTNER_FEE_NOTICE,
                faq=D.FAQ, insights=D.INSIGHTS, build_id=BUILD_ID)

def write(path, content):
    path = OUT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("  wrote", path.relative_to(ROOT))

def render(page_id, template, out_name, extra=None):
    page = D.PAGES[page_id] if page_id in D.PAGES else extra["page"]
    ctx = common_ctx()
    ctx.update(page_id=page_id, page=page, jsonld=jsonld(page_id, page, extra))
    if extra: ctx.update(extra)
    html = env.get_template(template).render(**ctx)
    html = re.sub(r"\n{3,}", "\n\n", html)
    write(out_name, html)
    return page["path"]

def main():
    OUT.mkdir(exist_ok=True)
    urls = []
    print("Building…")
    urls.append(render("index", "index.html", "index.html"))
    for pid in ["solution", "models", "cases", "brands", "about", "partners", "assessment", "contact", "privacy", "terms"]:
        urls.append(render(pid, pid + ".html", pid + ".html"))
    urls.append(render("insights", "insights.html", "insights/index.html"))
    render("404", "404.html", "404.html")
    # 인사이트 개별 글
    for i, a in enumerate(D.INSIGHTS):
        page = {"path": "/insights/" + a["slug"], "title": a["title"] + " — 공백 인사이트", "desc": a["summary"]}
        extra = {"page": page, "a": a, "article": a, "name": a["title"], "parent": ("인사이트", "/insights"),
                 "prev": D.INSIGHTS[i - 1] if i > 0 else None, "next": D.INSIGHTS[i + 1] if i < len(D.INSIGHTS) - 1 else None}
        urls.append(render("insight", "insight.html", "insights/" + a["slug"] + ".html", extra))

    # sitemap / robots
    today = time.strftime("%Y-%m-%d")
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        if u in ("/privacy", "/terms"): pr = "0.3"
        elif u == "/": pr = "1.0"
        elif u.startswith("/insights/"): pr = "0.6"
        else: pr = "0.8"
        sm.append("  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>" % (D.SITE["domain"], u if u != "/" else "/", today, pr))
    sm.append("</urlset>")
    write("sitemap.xml", "\n".join(sm) + "\n")
    write("robots.txt", "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: %s/sitemap.xml\n" % D.SITE["domain"])

    # Cloudflare Pages 설정 파일
    write("_headers", """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
""")
    write("_redirects", """# 기존 주소 → 새 주소 (301)
/intro        /about     301
/start        /contact   301
/seminar      /solution  301
/article      /insights/ 301
/index.html   /          301
""")
    write("site.webmanifest", json.dumps({
        "name": "공백 — 공실개발 솔루션", "short_name": "공백", "start_url": "/", "display": "browser",
        "background_color": "#ffffff", "theme_color": "#ffffff",
        "icons": [{"src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}]
    }, ensure_ascii=False, indent=1))
    write("favicon.svg", """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><rect width="34" height="34" rx="6" fill="#fff"/><rect x="2.5" y="2.5" width="29" height="29" rx="4" fill="none" stroke="#141619" stroke-width="2.4"/><rect x="7.5" y="7.5" width="8.5" height="8.5" fill="#141619"/><rect x="18" y="7.5" width="8.5" height="8.5" fill="none" stroke="#141619" stroke-width="1.5" stroke-dasharray="2 2"/><rect x="7.5" y="18" width="8.5" height="8.5" fill="none" stroke="#141619" stroke-width="1.5" stroke-dasharray="2 2"/><rect x="18" y="18" width="8.5" height="8.5" fill="#e5501c"/></svg>""")
    print("Done. %d pages." % (len(urls) + 1))

if __name__ == "__main__":
    main()
