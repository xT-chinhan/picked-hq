"""Polite page reader for the business analysis, built on Scrapling.

Reads a handful of public pages of one site and prints ONE JSON object on stdout (logs go to stderr).
Politeness, on purpose: a named user agent, robots.txt is read first and obeyed, at most MAX_PAGES pages, a pause between
requests, and none of Scrapling's disguise features (no browser TLS impersonation, no spoofed headers or referer).

usage: scrape.py <url>
"""
import json, re, sys, time, logging, urllib.parse, urllib.robotparser

logging.disable(logging.CRITICAL)
from scrapling.fetchers import Fetcher  # noqa: E402

UA = "PickedBot/1.0 (+https://pickedhq.pages.dev)"
MAX_PAGES, DELAY, TIMEOUT = 5, 0.6, 15
PAGE_HINT = re.compile(r"(about|gioi-thieu|ve-chung-toi|contact|lien-he|product|san-pham|collection|danh-muc|faq|hoi-dap|chinh-sach|policy|warranty|bao-hanh|pricing|bang-gia)", re.I)
PRICE = re.compile(r"(\d{1,3}(?:[.,]\d{3})+\s?(?:₫|đ|vnd|vnđ)|\$\s?\d+(?:[.,]\d+)?|\d+\s?(?:k|tr)\b)", re.I)
PHONE = re.compile(r"(?:\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def fetch(url):
    # plain HTTP fetch: no impersonation, no stealth headers
    return Fetcher.get(url, headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.8"}, impersonate=None, stealthy_headers=False, timeout=TIMEOUT, follow_redirects=True)


def types_in(node, out):
    if isinstance(node, list):
        for x in node: types_in(x, out)
    elif isinstance(node, dict):
        t = node.get("@type")
        for x in (t if isinstance(t, list) else [t]):
            if isinstance(x, str): out.add(x)
        for v in node.values(): types_in(v, out)


def read(page, url):
    css = lambda s: [str(t).strip() for t in page.css(s).getall() if str(t).strip()]
    types, blocks, org = set(), 0, ""
    for raw in page.css('script[type="application/ld+json"]::text').getall():
        try:
            j = json.loads(str(raw)); types_in(j, types); blocks += 1
            for n in (j if isinstance(j, list) else j.get("@graph", [j]) if isinstance(j, dict) else []):
                if isinstance(n, dict) and n.get("@type") in ("Organization", "LocalBusiness", "Store", "Corporation") and isinstance(n.get("name"), str) and not org: org = n["name"].strip()
        except Exception: pass
    text = page.get_all_text(separator=" ") if hasattr(page, "get_all_text") else ""
    text = re.sub(r"\s+", " ", str(text))
    md = ""
    try: md = page.markdown()
    except Exception: pass
    host = urllib.parse.urlparse(url).netloc
    links = [urllib.parse.urljoin(url, str(a.attrib.get("href", ""))) for a in page.css("a") if a.attrib.get("href")]
    return {
        "url": url, "status": page.status,
        "site_name": (str(page.css('meta[property="og:site_name"]::attr(content)').get() or "").strip() or org)[:80],
        "title": str(page.css("title::text").get() or "").strip()[:200],
        "description": str(page.css('meta[name="description"]::attr(content)').get() or "").strip()[:300],
        "canonical": str(page.css('link[rel="canonical"]::attr(href)').get() or ""), "lang": str(page.css("html::attr(lang)").get() or ""),
        "h1": css("h1::text")[:3], "h2": css("h2::text")[:8],
        "jsonld_types": sorted(types), "jsonld_blocks": blocks,
        "words": len(text.split()), "prices": list(dict.fromkeys(PRICE.findall(text)))[:6],
        "phones": list(dict.fromkeys(PHONE.findall(text)))[:3], "emails": list(dict.fromkeys(EMAIL.findall(text)))[:3],
        "internal_links": sum(1 for l in links if urllib.parse.urlparse(l).netloc == host), "external_links": sum(1 for l in links if urllib.parse.urlparse(l).netloc not in ("", host)),
        "markdown": md[:1800], "_links": links,
    }


def main(start):
    out = {"start": start, "pages": [], "robots": "unknown", "sitemap_urls": 0, "llms_txt": "missing", "notes": [], "tool": "scrapling"}
    origin = "{0.scheme}://{0.netloc}".format(urllib.parse.urlparse(start))
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = fetch(origin + "/robots.txt")
        if r.status == 200 and "html" not in (r.headers.get("content-type", "") or "").lower():
            rp.parse(str(r.body.decode("utf8", "ignore") if hasattr(r.body, "decode") else r.body).splitlines()); out["robots"] = "read"
            sm = re.findall(r"(?im)^sitemap:\s*(\S+)", str(r.text if hasattr(r, "text") else ""))
        else: rp.parse([]); out["robots"] = "none"; sm = []
    except Exception as e:
        rp.parse([]); out["robots"] = "unreachable"; sm = []; out["notes"].append(f"robots.txt: {type(e).__name__}")
    allowed = lambda u: rp.can_fetch(UA, u) if out["robots"] == "read" else True
    try:
        t = fetch(origin + "/llms.txt")
        if t.status == 200 and "html" not in (t.headers.get("content-type", "") or "").lower(): out["llms_txt"] = "found"
    except Exception: pass
    for s in (sm[:1] or [origin + "/sitemap.xml"]):
        try:
            x = fetch(s)
            if x.status == 200: out["sitemap_urls"] = len(re.findall(r"<loc>", str(x.text if hasattr(x, "text") else "")))
        except Exception: pass
    queue, seen = [start], set()
    while queue and len(out["pages"]) < MAX_PAGES:
        u = queue.pop(0).split("#")[0]
        if u in seen: continue
        seen.add(u)
        if not allowed(u): out["notes"].append(f"skipped by robots.txt: {u}"); continue
        try:
            page = fetch(u)
            if page.status != 200: out["notes"].append(f"{u} -> HTTP {page.status}"); continue
            info = read(page, u); out["pages"].append(info)
            if len(out["pages"]) == 1:
                host = urllib.parse.urlparse(u).netloc
                cand = [l for l in info["_links"] if urllib.parse.urlparse(l).netloc == host and PAGE_HINT.search(l) and l.split("#")[0] not in seen]
                queue += list(dict.fromkeys(l.split("#")[0] for l in cand))[: MAX_PAGES + 4]
        except Exception as e:
            out["notes"].append(f"{u}: {type(e).__name__}")
        time.sleep(DELAY)
    for p in out["pages"]: p.pop("_links", None)
    return out


if __name__ == "__main__":
    print(json.dumps(main(sys.argv[1]), ensure_ascii=False))
