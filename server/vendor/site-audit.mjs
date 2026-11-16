// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/bots.ts
var AI_SEARCH_CRAWLERS = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];
var AI_USER_AGENTS = ["ChatGPT-User", "Claude-User", "Perplexity-User"];
var AI_TRAINING_CRAWLERS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot"];
var PROBE_BOTS = [
  {
    token: "ChatGPT-User",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot"
  },
  {
    token: "OAI-SearchBot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot"
  },
  {
    token: "Claude-User",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)"
  },
  {
    token: "PerplexityBot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"
  }
];

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/gather.ts
import { gunzipSync } from "node:zlib";

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/hosts.ts
function normalizeHost(input) {
  const trimmed = input.trim();
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, "");
  }
}
function homepageUrl(input) {
  const trimmed = input.trim();
  const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  return `${url.protocol}//${url.host}/`;
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/parse/html.ts
import { parseHTML } from "linkedom";
var INSTRUCTION_PATTERN = /\b(ignore (all |any )?(previous|prior|above) (instructions|prompts)|you are (an? )?(ai|assistant|language model|llm|chatbot)|\b(ai|llm|language model)s?( assistants?| agents?| models?)?,? (must|should|always|never) |system prompt|disregard (the|all|any) |when (summari[sz]ing|asked about) this)/i;
var HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])|(left|top)\s*:\s*-\d{3,}px|opacity\s*:\s*0(?![.\d])/i;
function attr(document, selector, name) {
  return document.querySelector(selector)?.getAttribute(name)?.trim() ?? "";
}
function collectJsonLd(document) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node;
    if (record["@graph"]) visit(record["@graph"]);
    if (record["@type"]) out.push(record);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.textContent ?? ""));
    } catch {
    }
  }
  return out;
}
function indexLabels(document) {
  const labels = /* @__PURE__ */ new Map();
  for (const label of document.querySelectorAll("label[for]")) {
    const target = label.getAttribute("for");
    if (target && !labels.has(target)) labels.set(target, label);
  }
  return labels;
}
function labelFor(element, labels) {
  const id = element.getAttribute("id");
  return id ? labels.get(id) : void 0;
}
function accessibleName(element, document, labels) {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (text) return text;
  }
  const direct = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? (element.tagName === "INPUT" ? element.getAttribute("value") : null);
  if (direct?.trim()) return direct.trim();
  const label = labelFor(element, labels);
  if (label?.textContent?.trim()) return label.textContent.trim();
  if (element.closest("label")?.textContent?.trim()) return element.closest("label")?.textContent?.trim() ?? "";
  const imageAlt = [...element.querySelectorAll("img[alt], svg[aria-label]")].map((img) => img.getAttribute("alt") ?? img.getAttribute("aria-label") ?? "").join(" ").trim();
  return (element.textContent ?? "").trim() || imageAlt || element.getAttribute("placeholder")?.trim() || "";
}
function hiddenItself(element) {
  return element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true" || HIDDEN_STYLE.test(element.getAttribute("style") ?? "");
}
function isHidden(element, cache) {
  const unresolved = [];
  let node = element;
  let hidden = false;
  while (node) {
    const cached = cache.get(node);
    if (cached !== void 0) {
      hidden = cached;
      break;
    }
    unresolved.push(node);
    node = node.parentElement;
  }
  for (const ancestor of unresolved.reverse()) {
    hidden ||= hiddenItself(ancestor);
    cache.set(ancestor, hidden);
  }
  return hidden;
}
var FORM_FIELDS = ["INPUT", "SELECT", "TEXTAREA"];
var BUTTON_INPUTS = ["submit", "button", "reset", "image"];
function hasLabel(element, labels) {
  if (element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.closest("label"))
    return true;
  return labelFor(element, labels) !== void 0;
}
function collectControls(document, hidden) {
  const labels = indexLabels(document);
  const controls = { total: 0, named: 0, nonNative: 0, formControls: 0, labeledFormControls: 0 };
  const interactive = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]'
  );
  for (const element of interactive) {
    if (isHidden(element, hidden)) continue;
    controls.total++;
    if (accessibleName(element, document, labels)) controls.named++;
    const isField = FORM_FIELDS.includes(element.tagName) && !BUTTON_INPUTS.includes(element.getAttribute("type") ?? "");
    if (!isField) continue;
    controls.formControls++;
    if (hasLabel(element, labels)) controls.labeledFormControls++;
  }
  for (const element of document.querySelectorAll("div[onclick], span[onclick], div[role=button], span[role=button]")) {
    if (!element.hasAttribute("tabindex")) controls.nonNative++;
  }
  return controls;
}
function collectHiddenInstructions(document, hidden) {
  const found = /* @__PURE__ */ new Set();
  for (const element of document.querySelectorAll("body *")) {
    const candidates = [element.getAttribute("aria-label"), element.getAttribute("alt"), element.getAttribute("title")];
    if (isHidden(element, hidden) && element.children.length === 0) candidates.push(element.textContent);
    for (const candidate of candidates) {
      if (candidate && INSTRUCTION_PATTERN.test(candidate)) found.add(candidate.trim().slice(0, 160));
    }
  }
  return [...found];
}
var PASSAGE_MIN_WORDS = 40;
var PASSAGE_MAX_WORDS = 200;
function countCitablePassages(document) {
  const scope = document.querySelector("main, [role=main], article") ?? document.body;
  if (!scope) return 0;
  return [...scope.querySelectorAll("p, li")].filter((block) => {
    const words = (block.textContent ?? "").trim().split(/\s+/).filter(Boolean).length;
    return words >= PASSAGE_MIN_WORDS && words <= PASSAGE_MAX_WORDS;
  }).length;
}
function hasJsRedirectStub(inlineScripts, text) {
  if (text.length >= 200) return false;
  return /\b(window\.|document\.)?location(\.href)?\s*=|location\.(replace|assign)\(/.test(inlineScripts);
}
function parsePage(url, html) {
  const { document } = parseHTML(html);
  const absolute = (href) => {
    if (!href) return "";
    try {
      return new URL(href, url).toString();
    } catch {
      return "";
    }
  };
  const jsonLd = collectJsonLd(document);
  const hidden = /* @__PURE__ */ new Map();
  const controls = collectControls(document, hidden);
  const inlineScripts = [...document.querySelectorAll("script:not([src])")].map((script) => script.textContent ?? "").join("\n");
  for (const node of document.querySelectorAll("script, style, noscript, template, svg")) node.remove();
  const text = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
  return {
    url,
    title: (document.querySelector("title")?.textContent ?? "").trim(),
    lang: attr(document, "html", "lang"),
    metaDescription: attr(document, 'meta[name="description" i]', "content"),
    canonical: absolute(attr(document, 'link[rel="canonical" i]', "href")),
    ogImage: attr(document, 'meta[property="og:image" i]', "content"),
    ogType: attr(document, 'meta[property="og:type" i]', "content"),
    robotsMeta: [...document.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]')].map((meta) => meta.getAttribute("content") ?? "").join(", ").toLowerCase(),
    metaRefresh: /url\s*=/i.test(attr(document, 'meta[http-equiv="refresh" i]', "content")),
    jsRedirectStub: hasJsRedirectStub(inlineScripts, text),
    text,
    headings: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent ?? "").trim()
    })),
    hasMain: document.querySelector('main, [role="main"]') !== null,
    links: [...document.querySelectorAll("a[href]")].map((anchor) => ({ href: absolute(anchor.getAttribute("href") ?? ""), text: (anchor.textContent ?? "").trim() })).filter((link) => link.href.startsWith("http")),
    markdownAlternates: [...document.querySelectorAll('link[rel="alternate" i][type="text/markdown" i]')].map((link) => absolute(link.getAttribute("href") ?? "")).filter(Boolean),
    jsonLd,
    controls,
    hiddenInstructions: collectHiddenInstructions(document, hidden),
    metaDates: [
      ...document.querySelectorAll(
        'meta[property="article:modified_time" i], meta[property="article:published_time" i], meta[property="og:updated_time" i]'
      )
    ].map((meta) => meta.getAttribute("content") ?? "").filter(Boolean),
    authorMeta: attr(document, 'meta[name="author" i]', "content"),
    hasAuthorLink: document.querySelector('a[rel~="author" i], link[rel~="author" i]') !== null,
    citablePassages: countCitablePassages(document)
  };
}
function jsonLdTypes(node) {
  const type = node["@type"];
  return (Array.isArray(type) ? type : [type]).filter((value) => typeof value === "string");
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/parse/markdown.ts
function hasFrontmatter(markdown) {
  return /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/.test(markdown);
}
function codeFencesBalanced(markdown) {
  let open;
  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    if (!fence) continue;
    if (!open) open = fence;
    else if (fence[0] === open[0] && fence.length >= open.length) open = void 0;
  }
  return open === void 0;
}
function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[([^[\]\n]{1,500})\]\(([^)\s]{1,2000})(?:\s+"[^"\n]{0,500}")?\)/g)].map((match) => ({
    text: match[1],
    url: match[2]
  }));
}
function llmsTxtShape(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return {
    h1: /^#\s+\S/.test(lines[0] ?? ""),
    summary: lines.some((line) => line.startsWith(">")),
    linkItems: lines.filter((line) => /^\s*[-*]\s+\[[^\]]+\]\([^)]+\)/.test(line)).length
  };
}
function looksLikeHtml(body) {
  return /^\s*(<!doctype html|<html[\s>])/i.test(body);
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/parse/robots.ts
import robotsParser from "robots-parser";
function directiveValues(text, name) {
  return text.split(/\r?\n/).flatMap((line) => {
    const colon = line.indexOf(":");
    if (colon === -1 || line.slice(0, colon).trim().toLowerCase() !== name) return [];
    const value = line.slice(colon + 1).trim();
    return value ? [value] : [];
  });
}
function parseRobots(robotsUrl, text) {
  const robot = robotsParser(robotsUrl, text);
  return {
    isAllowed: (url, userAgent) => robot.isAllowed(url, userAgent),
    getCrawlDelay: (userAgent) => robot.getCrawlDelay(userAgent),
    sitemaps: robot.getSitemaps(),
    contentSignals: directiveValues(text, "content-signal"),
    schemamaps: directiveValues(text, "schemamap"),
    userAgents: directiveValues(text, "user-agent").map((ua) => ua.toLowerCase())
  };
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/parse/sitemap.ts
function decode(value) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}
var MAX_ENTRIES = 5e4;
function localName(tag) {
  const name = tag.replace(/^\//, "").split(/[\s/]/, 1)[0] ?? "";
  return name.slice(name.indexOf(":") + 1);
}
function nextTag(lower, from) {
  const open = lower.indexOf("<", from);
  const close = open === -1 ? -1 : lower.indexOf(">", open);
  if (close === -1) return void 0;
  const raw = lower.slice(open + 1, close).trim();
  const markup = raw.startsWith("?") || raw.startsWith("!");
  return { name: markup ? "" : localName(raw), closing: raw.startsWith("/"), end: close + 1 };
}
function rootKind(tag) {
  if (tag.closing) return "invalid";
  if (tag.name === "urlset") return "urlset";
  return tag.name === "sitemapindex" ? "index" : "invalid";
}
var EntryReader = class {
  kind = "invalid";
  entries = [];
  current;
  /** Where scanning resumes, or undefined to stop. */
  accept(tag, xml, lower) {
    if (this.kind === "invalid") {
      this.kind = rootKind(tag);
      return tag.end;
    }
    if (tag.name === (this.kind === "index" ? "sitemap" : "url")) {
      if (tag.closing && this.current?.loc) this.entries.push({ loc: this.current.loc, lastmod: this.current.lastmod });
      this.current = tag.closing ? void 0 : {};
      return tag.end;
    }
    const field = tag.name === "loc" || tag.name === "lastmod" ? tag.name : void 0;
    if (!field || tag.closing || !this.current) return tag.end;
    const end = lower.indexOf("</", tag.end);
    if (end === -1) return void 0;
    this.current[field] = decode(xml.slice(tag.end, end));
    return end;
  }
};
function parseSitemap(xml) {
  const lower = xml.toLowerCase();
  const reader = new EntryReader();
  let tag = nextTag(lower, 0);
  while (tag && reader.entries.length < MAX_ENTRIES) {
    const next = reader.accept(tag, xml, lower);
    if (next === void 0) break;
    tag = nextTag(lower, next);
  }
  return { kind: reader.kind, entries: reader.entries };
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/sample.ts
import { createHash } from "node:crypto";
function rank(seed, value) {
  return createHash("sha256").update(`${seed}
${value}`).digest("hex");
}
function section(url) {
  return url.pathname.split("/").filter(Boolean)[0] ?? "";
}
function canonicalPage(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return void 0;
  }
}
var NON_PAGE = /\.(pdf|png|jpe?g|gif|webp|svg|zip|xml|json|txt|mp4|mp3|css|js)$/i;
var BOILERPLATE = /(^|-)(careers?|jobs?|legal|privacy|terms|tos|cookies?|polic(y|ies)|agreements?|disclosures?|dpa|compliance)(-|$)/;
var NON_ENGLISH_LOCALE = /^(ar|bg|bn|br|ca|cs|da|de|el|es|et|fa|fi|fr|he|hi|hr|hu|id|it|ja|ko|lt|lv|ms|nb|nl|no|pl|pt|ro|ru|sk|sl|sr|sv|th|tr|uk|vi|zh|zhs|zht)([-_][a-z]{2,4})?$/i;
function segments(page) {
  return new URL(page).pathname.toLowerCase().replace(/\/+$/, "").split("/").filter(Boolean);
}
var LOCALE_SHAPED = /^[a-z]{2,3}([-_][a-z]{2,4})?$/i;
function fallbackTest(pages) {
  const paths = new Set(pages.map((page) => segments(page).join("/")));
  const isTranslation = (parts) => parts.slice(0, 2).some((part, index) => {
    if (!LOCALE_SHAPED.test(part)) return false;
    const untranslated = parts.filter((_, other) => other !== index).join("/");
    return NON_ENGLISH_LOCALE.test(part) || untranslated !== "" && paths.has(untranslated);
  });
  return (page) => {
    const parts = segments(page);
    return parts.some((part) => BOILERPLATE.test(part)) || isTranslation(parts);
  };
}
function eligibility(origin, isAllowed) {
  return (url) => {
    const page = canonicalPage(url);
    if (!page) return void 0;
    const parsed = new URL(page);
    if (parsed.origin !== origin || NON_PAGE.test(parsed.pathname) || !isAllowed(page)) return void 0;
    return page;
  };
}
function sections(origin, pages) {
  const bySection = /* @__PURE__ */ new Map();
  for (const page of pages) {
    const key = section(new URL(page));
    bySection.set(key, (bySection.get(key) ?? /* @__PURE__ */ new Set()).add(page));
  }
  const byRank = (a, b) => rank(origin, a).localeCompare(rank(origin, b));
  const bySize = (a, b) => (bySection.get(b)?.size ?? 0) - (bySection.get(a)?.size ?? 0) || byRank(a, b);
  return [...bySection.keys()].sort(bySize).map((key) => [...bySection.get(key) ?? []].sort(byRank));
}
function samplePages(options) {
  const { origin, limit } = options;
  const eligible = eligibility(origin, options.isAllowed);
  const picked = /* @__PURE__ */ new Set([`${origin}/`]);
  const add = (page) => {
    if (page && picked.size < limit) picked.add(page);
  };
  for (const url of options.priority) add(eligible(url));
  const rest = options.candidates.map(eligible).filter((page) => page !== void 0 && !picked.has(page));
  const isFallback = fallbackTest(rest);
  for (const pool of [rest.filter((page) => !isFallback(page)), rest.filter(isFallback)]) {
    const groups = sections(origin, pool);
    const deepest = Math.max(0, ...groups.map((group) => group.length));
    for (let round = 0; round < deepest && picked.size < limit; round++) {
      for (const group of groups) add(group[round]);
    }
  }
  return [...picked];
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/gather.ts
var MARKDOWN_ACCEPT = "text/markdown, text/plain;q=0.9, */*;q=0.1";
var TEXT_ACCEPT = "text/plain, text/markdown;q=0.9, */*;q=0.1";
var SMALL_BODY = 256 * 1024;
var ROBOTS_BODY = 512 * 1024;
var SITEMAP_BODY = 5 * 1024 * 1024;
var LLMS_LINK_PROBES = 3;
function isResponse(fetched) {
  return fetched?.kind === "response";
}
function isOk(fetched) {
  return isResponse(fetched) && fetched.status >= 200 && fetched.status < 300;
}
function parsedPages(site) {
  return site.pages.filter((page) => page.parsed);
}
function contentType(fetched) {
  return isResponse(fetched) ? (fetched.headers["content-type"] ?? "").toLowerCase() : "";
}
function isHtmlResponse(fetched) {
  return isResponse(fetched) && (contentType(fetched).includes("html") || looksLikeHtml(fetched.body));
}
function resolveUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return void 0;
  }
}
function sameSchemeAs(url, origin) {
  const parsed = resolveUrl(url, origin);
  if (!parsed) return void 0;
  const target = new URL(parsed);
  target.protocol = new URL(origin).protocol;
  return target.toString();
}
function pagePath(url) {
  return new URL(url).pathname.replace(/\/+$/, "");
}
function markdownSuffixUrl(url) {
  const parsed = new URL(url);
  const path = pagePath(url);
  parsed.pathname = path === "" ? "/index.md" : `${path}.md`;
  parsed.search = "";
  return parsed.toString();
}
var TRUST_PATTERNS = {
  about: /\/(about|company|our-story|team)(\/|$)|^about( us)?$/i,
  contact: /\/(contact|contact-us|support)(\/|$)|^contact( us)?$/i,
  privacy: /\/(privacy|privacy-policy)(\/|$)|privacy/i
};
function findLink(page, origin, pattern) {
  return page?.links.find((link) => {
    const url = new URL(link.href);
    const sameSite = normalizeHost(url.hostname) === normalizeHost(origin);
    return sameSite && (pattern.test(url.pathname) || pattern.test(link.text));
  })?.href;
}
var SITEMAP_MAX_XML = 50 * 1024 * 1024;
function sitemapXml(fetched) {
  const gzipped = fetched.bytes[0] === 31 && fetched.bytes[1] === 139;
  if (!gzipped) return fetched.body;
  try {
    return gunzipSync(fetched.bytes, { maxOutputLength: SITEMAP_MAX_XML }).toString("utf8");
  } catch {
    return void 0;
  }
}
function readSitemap(fetched) {
  if (!isOk(fetched)) return void 0;
  const xml = sitemapXml(fetched);
  return xml === void 0 ? void 0 : parseSitemap(xml);
}
async function fetchSitemap(fetcher, robots, origin) {
  const declared = robots?.sitemaps.flatMap((url2) => sameSchemeAs(url2, origin) ?? []) ?? [];
  const url = declared[0] ?? `${origin}/sitemap.xml`;
  const fetches = [];
  const first = await fetcher.get(url, {
    accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
    maxBytes: SITEMAP_BODY
  });
  fetches.push(first);
  const parsed = readSitemap(first);
  if (!parsed) return { url, fetches, entries: [], valid: false };
  if (parsed.kind !== "index") return { url, fetches, entries: parsed.entries, valid: parsed.kind === "urlset" };
  const child = [...parsed.entries].sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))[0];
  if (!child) return { url, fetches, entries: [], valid: true };
  const childUrl = resolveUrl(child.loc, url);
  if (!childUrl) return { url, fetches, entries: [], valid: false };
  const childFetch = await fetcher.get(childUrl, {
    accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
    maxBytes: SITEMAP_BODY
  });
  fetches.push(childFetch);
  const childParsed = readSitemap(childFetch);
  return { url, fetches, entries: childParsed?.entries ?? [], valid: childParsed?.kind === "urlset" };
}
function parseHtml(fetched) {
  return isOk(fetched) && isHtmlResponse(fetched) ? parsePage(fetched.url, fetched.body) : void 0;
}
async function fetchRobots(fetcher, origin) {
  const robotsFetch = await fetcher.get(`${origin}/robots.txt`, {
    accept: TEXT_ACCEPT,
    ignoreRobots: true,
    maxBytes: ROBOTS_BODY
  });
  const robots = isOk(robotsFetch) && !looksLikeHtml(robotsFetch.body) ? parseRobots(`${origin}/robots.txt`, robotsFetch.body) : void 0;
  const unavailable = isResponse(robotsFetch) && (robotsFetch.status === 429 || robotsFetch.status >= 500);
  const crawlRules = unavailable ? parseRobots(`${origin}/robots.txt`, "User-agent: *\nDisallow: /") : robots;
  if (crawlRules) fetcher.setRobots(origin, crawlRules);
  return { robotsFetch, robots, crawlRules };
}
async function fetchPages(options, robots, candidates, home) {
  const sampled = samplePages({
    origin: options.origin,
    priority: options.priorityPages,
    candidates,
    limit: options.pageLimit,
    isAllowed: (url) => robots?.isAllowed(url, options.userAgentToken) !== false
  });
  const pages = [home];
  for (const url of sampled.slice(1)) {
    const html = await options.fetcher.get(url);
    pages.push({ url, html, parsed: parseHtml(html) });
  }
  return pages;
}
async function probeBots(options, robots) {
  const home = `${options.origin}/`;
  if (robots?.isAllowed(home, options.userAgentToken) === false) return [];
  const probes = [];
  for (const bot of PROBE_BOTS) {
    probes.push({ bot, fetched: await options.fetcher.get(home, { userAgent: bot.userAgent, ignoreRobots: true }) });
  }
  return probes;
}
async function probeLlmsLinks(fetcher, llmsTxt2) {
  if (!isOk(llmsTxt2) || isHtmlResponse(llmsTxt2)) return [];
  const { origin } = new URL(llmsTxt2.url);
  const links = markdownLinks(llmsTxt2.body).map((link) => resolveUrl(link.url, llmsTxt2.url)).filter((url) => url?.startsWith(`${origin}/`) === true);
  const probes = [];
  for (const url of [...new Set(links)].slice(0, LLMS_LINK_PROBES)) {
    probes.push(await fetcher.get(url, { accept: MARKDOWN_ACCEPT, maxBytes: SMALL_BODY }));
  }
  return probes;
}
async function fetchLinkedPages(fetcher, origin, pages) {
  const homeParsed = pages[0]?.parsed;
  const fetchLinked = async (pattern) => {
    const href = findLink(homeParsed, origin, pattern);
    if (!href) return {};
    const sampled = pages.find((page) => page.url === href);
    return { href, fetched: sampled?.html ?? await fetcher.get(href, { maxBytes: SMALL_BODY }) };
  };
  const trust = {
    about: await fetchLinked(TRUST_PATTERNS.about),
    contact: await fetchLinked(TRUST_PATTERNS.contact),
    privacy: await fetchLinked(TRUST_PATTERNS.privacy)
  };
  const pricingPage = await fetchLinked(/\/(pricing|plans)(\/|$)|^pricing$/i);
  const markdown = pricingPage.href && isOk(pricingPage.fetched) ? await fetcher.get(markdownSuffixUrl(pricingPage.href), { accept: MARKDOWN_ACCEPT, maxBytes: SMALL_BODY }) : void 0;
  return { trust, pricing: { ...pricingPage, markdown } };
}
function linksToDocs(origin, urls) {
  return urls.some((url) => {
    try {
      const parsed = new URL(url);
      return parsed.origin === origin && /^\/docs(\/|$)/.test(parsed.pathname);
    } catch {
      return false;
    }
  });
}
function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return void 0;
  }
}
async function pagesOrigin(fetcher, origin, entries) {
  const urls = entries.flatMap((entry) => parseUrl(entry.loc) ?? []);
  if (urls.length === 0 || urls.some((url) => url.origin === origin)) return void 0;
  const counts = /* @__PURE__ */ new Map();
  for (const url of urls) counts.set(url.origin, (counts.get(url.origin) ?? 0) + 1);
  const target = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sample = urls.find((url) => url.origin === target && url.pathname !== "/");
  if (!target || !sample) return void 0;
  const probe = await fetcher.get(`${origin}${sample.pathname}`);
  return isResponse(probe) && new URL(probe.url).origin === target ? target : void 0;
}
async function gatherSite(options) {
  const { fetcher, origin } = options;
  const homeUrl = `${origin}/`;
  const { robotsFetch, robots, crawlRules } = await fetchRobots(fetcher, origin);
  const sitemap2 = await fetchSitemap(fetcher, robots, origin);
  const moved = options.followedPages ? void 0 : await pagesOrigin(fetcher, origin, sitemap2.entries);
  if (moved) return gatherSite({ ...options, origin: moved, homepage: void 0, followedPages: true });
  const reused = options.homepage && new URL(options.homepage.url).toString() === homeUrl ? options.homepage : void 0;
  const homeFetch = reused ?? await fetcher.get(homeUrl);
  const home = { url: homeUrl, html: homeFetch, parsed: parseHtml(homeFetch) };
  const homeLinks = home.parsed?.links.map((link) => link.href) ?? [];
  const candidates = sitemap2.entries.length > 0 ? sitemap2.entries.map((entry) => entry.loc) : homeLinks;
  const pages = await fetchPages(options, crawlRules, candidates, home);
  const llmsTxt2 = await fetcher.get(`${origin}/llms.txt`, { accept: TEXT_ACCEPT, maxBytes: SMALL_BODY });
  for (const page of pages) page.markdownAccept = await fetcher.get(page.url, { accept: MARKDOWN_ACCEPT });
  const botProbes = await probeBots(options, crawlRules);
  for (const page of pages) {
    page.markdownSuffix = await fetcher.get(markdownSuffixUrl(page.url), { accept: MARKDOWN_ACCEPT });
  }
  const notFound2 = await fetcher.get(`${origin}/elmo-audit-${Date.now().toString(36)}-not-a-page`);
  const llmsFullHead = await fetcher.get(`${origin}/llms-full.txt`, { method: "HEAD", accept: TEXT_ACCEPT });
  const headUnsupported = isResponse(llmsFullHead) && (llmsFullHead.status === 405 || llmsFullHead.status === 501);
  const llmsFullTxt2 = headUnsupported ? await fetcher.get(`${origin}/llms-full.txt`, { accept: TEXT_ACCEPT, maxBytes: SMALL_BODY }) : llmsFullHead;
  const llmsLinkProbes = await probeLlmsLinks(fetcher, llmsTxt2);
  const { trust, pricing: pricing2 } = await fetchLinkedPages(fetcher, origin, pages);
  const agentView2 = await fetcher.get(`${origin}/?mode=agent`);
  const llmsSection = linksToDocs(origin, [...candidates, ...homeLinks]) ? await fetcher.get(`${origin}/docs/llms.txt`, { accept: TEXT_ACCEPT, maxBytes: SMALL_BODY }) : void 0;
  return {
    origin,
    robotsFetch,
    robots,
    pages,
    sitemap: sitemap2,
    llmsTxt: llmsTxt2,
    llmsFullTxt: llmsFullTxt2,
    llmsLinkProbes,
    llmsSection,
    notFound: notFound2,
    agentView: agentView2,
    botProbes,
    trust,
    pricing: pricing2
  };
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/checks/result.ts
function result(definition, status, evidence, pages) {
  const needsFix = status === "fail" || status === "warn" || status === "info";
  return {
    id: definition.id,
    group: definition.group,
    title: definition.title,
    status,
    evidence,
    ...needsFix && { fix: definition.fix },
    ...pages && pages.length > 0 && { pages }
  };
}
function notFetched(definition, fetched, what) {
  const reason = fetched?.kind === "skipped" ? {
    budget: "the request budget ran out",
    robots: "robots.txt disallows ElmoBot",
    "crawl-delay": "robots.txt asks for a Crawl-delay longer than the audit waits",
    "host-stopped": "the site stopped responding normally"
  }[fetched.reason] : fetched?.kind === "error" ? fetched.message : "it was not fetched";
  return result(definition, "not_checked", `Couldn't check ${what}: ${reason}.`);
}
function wasNotFetched(fetched) {
  return fetched === void 0 || fetched.kind === "skipped";
}
function share(part, whole) {
  return whole === 0 ? "0%" : `${Math.round(part / whole * 100)}%`;
}
function list(items) {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
function count(n, singular, plural = `${singular}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/checks/reach.ts
var define = (id, title, fix) => ({ id, group: "reach", title, fix });
var ROBOTS_VALID = define(
  "robots-valid",
  "robots.txt",
  "Serve a plain-text /robots.txt (RFC 9309) with at least one User-agent group and a Sitemap line."
);
var ROBOTS_AI_SEARCH = define(
  "robots-ai-search",
  "AI Search Crawlers Allowed",
  "Allow OAI-SearchBot, Claude-SearchBot, and PerplexityBot in robots.txt, so AI search engines can index and cite your pages."
);
var ROBOTS_AI_USER = define(
  "robots-ai-user",
  "AI User Agents Allowed",
  "Allow ChatGPT-User, Claude-User, and Perplexity-User in robots.txt. They fetch a page because a person asked an assistant about it."
);
var ROBOTS_AI_TRAINING = define(
  "robots-ai-training",
  "AI Training Crawlers",
  "Decide deliberately whether GPTBot, ClaudeBot, Google-Extended, and CCBot may use your content for training, and say so in robots.txt."
);
var CONTENT_SIGNALS = define(
  "content-signals",
  "Content Signals",
  "Add a Content-Signal line to robots.txt (for example `Content-Signal: search=yes, ai-input=yes, ai-train=no`) to state how AI systems may use your content."
);
var BOT_REACHABILITY = define(
  "bot-reachability",
  "Reachable by AI Agents",
  "Make sure bot protection (a WAF, bot-fight mode, or a CDN challenge) lets AI crawlers and user agents through. Verified bots can be allowlisted by IP or signature."
);
var NOINDEX = define(
  "noindex",
  "Pages Not Hidden From Search",
  "Remove `noindex` from the robots meta tag and X-Robots-Tag header on pages you want AI search to use."
);
var SNIPPET_DIRECTIVES = define(
  "snippet-directives",
  "Snippets Allowed",
  "Remove `nosnippet` and `max-snippet:0` (and raise small `max-snippet` limits) on pages you want quoted. Answer engines such as Google's AI Overviews only use text a page lets them show as a snippet."
);
var CONTENT_PUBLIC = define(
  "content-public",
  "Content Without Signing In",
  "Keep marketing, docs, and pricing pages readable without an account. Agents can't sign in."
);
var REDIRECT_HYGIENE = define(
  "redirect-hygiene",
  "Clean Redirects",
  "Use server-side 301/308 redirects with at most two hops instead of meta-refresh or JavaScript redirects."
);
var ALTERNATE_DOMAINS = define(
  "alternate-domains",
  "Alternate Domains Redirect Cleanly",
  "Redirect each alternate domain to the primary site in a single permanent (301 or 308) HTTPS redirect."
);
var NOT_FOUND = define(
  "not-found",
  "Real 404 Pages",
  `Return HTTP 404 for pages that don't exist. A 200 "soft 404" makes agents treat an error page as content.`
);
function robotsCheck(site) {
  const fetched = site.robotsFetch;
  if (wasNotFetched(fetched)) return notFetched(ROBOTS_VALID, fetched, "robots.txt");
  if (!isResponse(fetched)) return result(ROBOTS_VALID, "fail", `robots.txt couldn't be fetched: ${fetched.message}.`);
  if (fetched.status === 404) return result(ROBOTS_VALID, "fail", "There is no robots.txt (HTTP 404).");
  if (fetched.status < 200 || fetched.status >= 300) {
    return result(ROBOTS_VALID, "fail", `robots.txt returned HTTP ${fetched.status}.`);
  }
  if (isHtmlResponse(fetched))
    return result(ROBOTS_VALID, "fail", "robots.txt returns an HTML page instead of plain text.");
  if (!site.robots || site.robots.userAgents.length === 0) {
    return result(ROBOTS_VALID, "warn", "robots.txt has no User-agent groups.");
  }
  const sitemapNote = site.robots.sitemaps.length > 0 ? "" : " It doesn't declare a Sitemap.";
  return result(
    ROBOTS_VALID,
    sitemapNote ? "warn" : "pass",
    `robots.txt has rules for ${count(site.robots.userAgents.length, "user agent")}.${sitemapNote}`
  );
}
function robotsUnavailable(site) {
  const fetched = site.robotsFetch;
  if (!isResponse(fetched) || fetched.status !== 429 && fetched.status < 500) return void 0;
  return `robots.txt fails with HTTP ${fetched.status}, which crawlers read as the whole site being off-limits.`;
}
function botRules(site, definition, bots, informational = false) {
  const unavailable = robotsUnavailable(site);
  if (unavailable) return result(definition, informational ? "info" : "fail", unavailable);
  if (!site.robots) {
    if (wasNotFetched(site.robotsFetch)) return notFetched(definition, site.robotsFetch, "robots.txt");
    return result(definition, informational ? "info" : "pass", `No robots.txt rules, so nothing blocks ${list(bots)}.`);
  }
  const robots = site.robots;
  const urls = site.pages.map((page) => page.url);
  const blocked = bots.map((bot) => ({ bot, pages: urls.filter((url) => robots.isAllowed(url, bot) === false) })).filter((entry) => entry.pages.length > 0);
  if (blocked.length === 0) {
    return result(
      definition,
      informational ? "info" : "pass",
      `${list(bots)} are allowed on every sampled page (${count(urls.length, "page")}).`
    );
  }
  const evidence = blocked.map(({ bot, pages }) => `${bot} is blocked on ${pages.length} of ${urls.length} pages`).join("; ");
  return result(definition, informational ? "info" : "fail", `${evidence}.`, [
    ...new Set(blocked.flatMap((entry) => entry.pages))
  ]);
}
function contentSignals(site) {
  if (wasNotFetched(site.robotsFetch)) return notFetched(CONTENT_SIGNALS, site.robotsFetch, "robots.txt");
  const unavailable = robotsUnavailable(site);
  if (unavailable) return result(CONTENT_SIGNALS, "warn", unavailable);
  if (!site.robots)
    return result(CONTENT_SIGNALS, "warn", "No robots.txt, so there's nowhere to declare Content Signals.");
  const signals = site.robots.contentSignals;
  if (signals.length === 0) return result(CONTENT_SIGNALS, "warn", "robots.txt has no Content-Signal declaration.");
  return result(CONTENT_SIGNALS, "pass", `Content-Signal: ${signals[0]}.`);
}
var CHALLENGE = /just a moment|attention required|access denied|verify you are human|captcha|are you a robot/i;
function botReachability(site) {
  const baseline = site.pages[0]?.html;
  const baselineLength = isOk(baseline) ? baseline.body.length : 0;
  const outcomes = site.botProbes.map(({ bot, fetched }) => {
    if (fetched.kind === "skipped") return { bot: bot.token, state: "unchecked" };
    if (fetched.kind === "error") return { bot: bot.token, state: "blocked", detail: fetched.message };
    const challenged = !isOk(fetched) || fetched.headers["cf-mitigated"] === "challenge" || CHALLENGE.test(fetched.body.slice(0, 5e3)) && fetched.body.length < baselineLength / 2;
    return challenged ? { bot: bot.token, state: "blocked", detail: `HTTP ${fetched.status}` } : { bot: bot.token, state: "reachable" };
  });
  const checked = outcomes.filter((outcome) => outcome.state !== "unchecked");
  if (checked.length === 0) return notFetched(BOT_REACHABILITY, site.botProbes[0]?.fetched, "bot reachability");
  const blocked = checked.filter((outcome) => outcome.state === "blocked");
  const note = " Sent with each bot's user agent from Elmo's address, so sites that verify bots by IP may treat the real bots differently.";
  if (blocked.length === 0) {
    return result(BOT_REACHABILITY, "pass", `The homepage loads for ${list(checked.map((o) => o.bot))}.${note}`);
  }
  const detail = blocked.map((o) => `${o.bot} (${"detail" in o ? o.detail : "blocked"})`);
  return result(
    BOT_REACHABILITY,
    blocked.length === checked.length ? "fail" : "warn",
    `Blocked or challenged: ${list(detail)}.${note}`
  );
}
function noindex(site) {
  const hidden = site.pages.filter((page) => {
    const header = isResponse(page.html) ? page.html.headers["x-robots-tag"] ?? "" : "";
    const directives = `${header},${page.parsed?.robotsMeta ?? ""}`.split(",").map(
      (directive) => directive.trim().toLowerCase().replace(/^[\w-]+:\s*(?=noindex|none)/, "")
    );
    return directives.includes("noindex") || directives.includes("none");
  });
  const checked = site.pages.filter((page) => isResponse(page.html));
  if (checked.length === 0) return notFetched(NOINDEX, site.pages[0]?.html, "the sampled pages");
  if (hidden.length === 0)
    return result(NOINDEX, "pass", `No sampled page is marked noindex (${count(checked.length, "page")} checked).`);
  const homeHidden = hidden.some((page) => page === site.pages[0]);
  return result(
    NOINDEX,
    homeHidden ? "fail" : "warn",
    `${hidden.length} of ${checked.length} sampled pages are marked noindex.`,
    hidden.map((page) => page.url)
  );
}
var SHORT_SNIPPET = 160;
function snippetDirectives(site) {
  const checked = site.pages.filter((page) => isResponse(page.html));
  if (checked.length === 0) return notFetched(SNIPPET_DIRECTIVES, site.pages[0]?.html, "the sampled pages");
  const directives = checked.map((page) => {
    const header = isResponse(page.html) ? page.html.headers["x-robots-tag"] ?? "" : "";
    const raw = `${page.parsed?.robotsMeta ?? ""}, ${header}`.toLowerCase();
    const maxSnippet = raw.match(/max-snippet\s*:\s*(-?\d+)/)?.[1];
    return { url: page.url, raw, maxSnippet: maxSnippet === void 0 ? void 0 : Number(maxSnippet) };
  });
  const blocked = directives.filter((d) => /\bnosnippet\b/.test(d.raw) || d.maxSnippet === 0);
  if (blocked.length > 0) {
    return result(
      SNIPPET_DIRECTIVES,
      "fail",
      `${blocked.length} of ${checked.length} sampled pages forbid snippets (nosnippet or max-snippet:0).`,
      blocked.map((d) => d.url)
    );
  }
  const limited = directives.filter(
    (d) => d.maxSnippet !== void 0 && d.maxSnippet > 0 && d.maxSnippet < SHORT_SNIPPET
  );
  if (limited.length > 0) {
    return result(
      SNIPPET_DIRECTIVES,
      "warn",
      `max-snippet caps snippets below ${SHORT_SNIPPET} characters on ${count(limited.length, "page")}.`,
      limited.map((d) => d.url)
    );
  }
  return result(
    SNIPPET_DIRECTIVES,
    "pass",
    `No sampled page restricts snippets (${count(checked.length, "page")} checked).`
  );
}
var LOGIN_PATH = /\/(login|log-in|signin|sign-in|auth|sso|account\/login)(\/|$|\?)/i;
function contentPublic(site) {
  const checked = site.pages.filter((page) => isResponse(page.html));
  if (checked.length === 0) return notFetched(CONTENT_PUBLIC, site.pages[0]?.html, "the sampled pages");
  const gated = checked.filter((page) => {
    const html = page.html;
    return isResponse(html) && (html.status === 401 || html.status === 403 || LOGIN_PATH.test(new URL(html.url).pathname));
  });
  if (gated.length === 0)
    return result(CONTENT_PUBLIC, "pass", `All ${checked.length} sampled pages are publicly readable.`);
  return result(
    CONTENT_PUBLIC,
    gated.length === checked.length ? "fail" : "warn",
    `${gated.length} of ${checked.length} sampled pages require signing in.`,
    gated.map((page) => page.url)
  );
}
function redirectHygiene(site) {
  const checked = site.pages.filter((page) => isResponse(page.html));
  if (checked.length === 0) return notFetched(REDIRECT_HYGIENE, site.pages[0]?.html, "the sampled pages");
  const stubs = checked.filter((page) => page.parsed?.metaRefresh || page.parsed?.jsRedirectStub);
  const longChains = checked.filter((page) => isResponse(page.html) && page.html.hops.length > 2);
  if (stubs.length > 0) {
    return result(
      REDIRECT_HYGIENE,
      "fail",
      `Meta-refresh or JavaScript redirects on ${count(stubs.length, "page")}, which many agents don't follow.`,
      stubs.map((page) => page.url)
    );
  }
  if (longChains.length > 0) {
    return result(
      REDIRECT_HYGIENE,
      "warn",
      `More than two redirects to load: ${count(longChains.length, "page")}.`,
      longChains.map((page) => page.url)
    );
  }
  return result(
    REDIRECT_HYGIENE,
    "pass",
    `No meta-refresh, JavaScript redirects, or long chains across ${count(checked.length, "page")}.`
  );
}
function alternateDomains(aliases) {
  if (aliases.length === 0) return void 0;
  const problems = aliases.flatMap((alias) => {
    const statuses = alias.hops.map((hop) => hop.status);
    const issues = [];
    if (alias.hops.length > 1) issues.push(`${alias.hops.length} hops`);
    if (statuses.some((status) => status !== 301 && status !== 308)) issues.push("a non-permanent redirect");
    return issues.length > 0 ? [`${alias.host} (${list(issues)})`] : [];
  });
  if (problems.length === 0) {
    return result(
      ALTERNATE_DOMAINS,
      "pass",
      `${list(aliases.map((alias) => alias.host))} redirect${aliases.length === 1 ? "s" : ""} here in one permanent hop.`
    );
  }
  return result(ALTERNATE_DOMAINS, "warn", `Redirect issues: ${list(problems)}.`);
}
function notFound(site) {
  const fetched = site.notFound;
  if (!isResponse(fetched)) return notFetched(NOT_FOUND, fetched, "a missing page");
  if (fetched.status === 404 || fetched.status === 410) {
    const agentFriendly = /markdown|text\/plain/.test(contentType(fetched));
    return result(
      NOT_FOUND,
      "pass",
      `A missing page returns HTTP ${fetched.status}${agentFriendly ? " with a plain-text or markdown body" : ""}.`
    );
  }
  if (fetched.status >= 200 && fetched.status < 300) {
    return result(NOT_FOUND, "fail", `A missing page returns HTTP ${fetched.status} (a soft 404).`);
  }
  return result(NOT_FOUND, "warn", `A missing page returns HTTP ${fetched.status} instead of 404.`);
}
function reachChecks(site, aliases) {
  return [
    robotsCheck(site),
    botRules(site, ROBOTS_AI_SEARCH, AI_SEARCH_CRAWLERS),
    botRules(site, ROBOTS_AI_USER, AI_USER_AGENTS),
    botRules(site, ROBOTS_AI_TRAINING, AI_TRAINING_CRAWLERS, true),
    contentSignals(site),
    botReachability(site),
    noindex(site),
    snippetDirectives(site),
    contentPublic(site),
    redirectHygiene(site),
    alternateDomains(aliases),
    notFound(site)
  ].filter((check) => check !== void 0);
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/checks/read.ts
var define2 = (id, title, fix) => ({ id, group: "read", title, fix });
var CONTENT_NO_JS = define2(
  "content-no-js",
  "Content Without JavaScript",
  "Server-render your main content. Most AI crawlers don't run JavaScript, so a client-rendered shell reads as an empty page."
);
var TOKEN_BUDGET = define2(
  "page-token-budget",
  "Page Size for Agents",
  "Keep each page's main content to about 30k tokens, splitting very long pages, so it fits in an agent's context alongside the question."
);
var MARKDOWN_ACCEPT2 = define2(
  "markdown-accept",
  "Markdown via Accept Header",
  "Return a markdown version of each page when a request sends `Accept: text/markdown`, with `Vary: Accept` so caches keep the two apart."
);
var MARKDOWN_SUFFIX = define2(
  "markdown-suffix",
  "Markdown at .md URLs",
  "Serve each page's markdown at the same path with `.md` appended (and `/index.md` for the homepage)."
);
var MARKDOWN_ALTERNATE = define2(
  "markdown-alternate",
  "Markdown Alternate Link",
  'Advertise each page\'s markdown with `<link rel="alternate" type="text/markdown" href="\u2026">` in the HTML head.'
);
var MARKDOWN_BOT_UA = define2(
  "markdown-bot-ua",
  "Markdown for AI User Agents",
  "Optionally serve markdown to known AI user agents (ChatGPT-User, Claude-User) even when they ask for HTML."
);
var MARKDOWN_QUALITY = define2(
  "markdown-quality",
  "Markdown Quality",
  "Start markdown documents with a `---` frontmatter block (title, description, canonical URL, last updated) and close every code fence."
);
var LLMS_TXT = define2(
  "llms-txt",
  "llms.txt",
  "Publish /llms.txt as described at llmstxt.org: an H1 with the site name, a `>` summary, and sections of annotated markdown links."
);
var LLMS_TXT_LINKS = define2(
  "llms-txt-links",
  "llms.txt Links Resolve",
  "Fix or remove llms.txt links that don't resolve. Prefer links to markdown versions of pages."
);
var LLMS_FULL_TXT = define2(
  "llms-full-txt",
  "llms-full.txt",
  "Publish /llms-full.txt with the full text of your key pages or docs in one markdown file."
);
var LLMS_TXT_SECTIONS = define2(
  "llms-txt-sections",
  "Docs Section llms.txt",
  "For a large docs section, publish its own llms.txt (for example /docs/llms.txt), so agents can load just that area."
);
var SITEMAP = define2(
  "sitemap",
  "Sitemap",
  "Publish an XML sitemap listing your canonical pages, and reference it from robots.txt with a Sitemap line."
);
var SITEMAP_LASTMOD = define2(
  "sitemap-lastmod",
  "Sitemap Freshness Dates",
  "Give every sitemap entry an accurate `<lastmod>`, so crawlers can find new and updated pages first."
);
var LINK_HEADERS = define2(
  "link-headers",
  "Discovery Link Headers",
  'Add an HTTP Link header (RFC 8288) to the homepage pointing at your sitemap, llms.txt (`rel="describedby"`), and markdown alternate.'
);
var AGENT_VIEW = define2(
  "agent-view",
  "Agent View",
  "Optionally serve a leaner agent-oriented view of the homepage (for example at `?mode=agent`), without navigation and marketing chrome."
);
var LEANER_VIEW = 0.7;
var MIN_TEXT = 500;
var THIN_TEXT = 100;
var TOKEN_LIMIT = 3e4;
var TOKEN_HARD_LIMIT = 1e5;
function contentNoJs(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(CONTENT_NO_JS, site.pages[0]?.html, "page content");
  const thin = pages.filter((page) => (page.parsed?.text.length ?? 0) < MIN_TEXT || page.parsed?.headings.length === 0);
  const empty = pages.filter((page) => (page.parsed?.text.length ?? 0) < THIN_TEXT);
  const home = site.pages[0]?.parsed;
  const homeSummary = home ? `Homepage: ${home.text.length.toLocaleString("en-US")} characters of text and ${count(home.headings.length, "heading")} in the server HTML. ` : "";
  if (thin.length === 0)
    return result(
      CONTENT_NO_JS,
      "pass",
      `${homeSummary}All ${pages.length} sampled pages have text without JavaScript.`
    );
  return result(
    CONTENT_NO_JS,
    empty.length > 0 ? "fail" : "warn",
    `${homeSummary}${thin.length} of ${pages.length} pages have little or no text or headings without JavaScript.`,
    thin.map((page) => page.url)
  );
}
function markdownBody(fetched) {
  if (!isOk(fetched) || isHtmlResponse(fetched)) return void 0;
  return /markdown|text\/plain/.test(contentType(fetched)) ? fetched.body : void 0;
}
function tokenBudget(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(TOKEN_BUDGET, site.pages[0]?.html, "page size");
  const sizes = pages.map((page) => ({
    url: page.url,
    tokens: estimateTokens(
      markdownBody(page.markdownAccept) ?? markdownBody(page.markdownSuffix) ?? page.parsed?.text ?? ""
    )
  }));
  const largest = Math.max(...sizes.map((size) => size.tokens));
  const over = sizes.filter((size) => size.tokens > TOKEN_LIMIT);
  const evidence = `The largest sampled page is about ${largest.toLocaleString("en-US")} tokens.`;
  if (over.length === 0) return result(TOKEN_BUDGET, "pass", evidence);
  return result(
    TOKEN_BUDGET,
    largest > TOKEN_HARD_LIMIT ? "fail" : "warn",
    `${evidence} Over about ${TOKEN_LIMIT.toLocaleString("en-US")} tokens: ${count(over.length, "page")}.`,
    over.map((size) => size.url)
  );
}
function perPageMarkdown(site, definition, pick, what, requireVary = false) {
  const attempted = site.pages.filter((page) => !wasNotFetched(pick(page)));
  if (attempted.length === 0) return notFetched(definition, pick(site.pages[0]), what);
  const serving = attempted.filter((page) => markdownBody(pick(page)) !== void 0);
  const missingVary = serving.filter((page) => {
    const fetched = pick(page);
    return requireVary && isResponse(fetched) && !/accept/i.test(fetched.headers.vary ?? "");
  });
  if (serving.length === 0)
    return result(definition, "fail", `No sampled page serves ${what} (${count(attempted.length, "page")} checked).`);
  if (missingVary.length > 0) {
    return result(
      definition,
      "warn",
      `${serving.length} of ${attempted.length} pages serve ${what}, but ${missingVary.length} omit \`Vary: Accept\`.`,
      missingVary.map((page) => page.url)
    );
  }
  const missing = attempted.filter((page) => !serving.includes(page));
  return result(
    definition,
    missing.length === 0 ? "pass" : "warn",
    `${serving.length} of ${attempted.length} sampled pages serve ${what}.`,
    missing.map((page) => page.url)
  );
}
function markdownAlternate(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(MARKDOWN_ALTERNATE, site.pages[0]?.html, "page markup");
  const advertising = pages.filter((page) => (page.parsed?.markdownAlternates.length ?? 0) > 0);
  if (advertising.length === 0) return result(MARKDOWN_ALTERNATE, "info", "No page advertises a markdown alternate.");
  return result(
    MARKDOWN_ALTERNATE,
    advertising.length === pages.length ? "pass" : "warn",
    `${advertising.length} of ${pages.length} sampled pages advertise a markdown alternate.`,
    pages.filter((page) => !advertising.includes(page)).map((page) => page.url)
  );
}
function markdownForBots(site) {
  const userAgents = site.botProbes.filter((probe) => probe.bot.token.endsWith("-User"));
  const checked = userAgents.filter((probe) => isResponse(probe.fetched));
  if (checked.length === 0) return notFetched(MARKDOWN_BOT_UA, userAgents[0]?.fetched, "bot user agents");
  const served = checked.filter((probe) => markdownBody(probe.fetched) !== void 0);
  if (served.length === 0) return result(MARKDOWN_BOT_UA, "info", "AI user agents asking for HTML get HTML.");
  return result(MARKDOWN_BOT_UA, "pass", `${served.map((probe) => probe.bot.token).join(", ")} get markdown.`);
}
function markdownQuality(site) {
  const documents = site.pages.flatMap(
    (page) => [page.markdownAccept, page.markdownSuffix].map((fetched) => ({ url: isResponse(fetched) ? fetched.url : page.url, body: markdownBody(fetched) })).filter((doc) => doc.body !== void 0)
  );
  const unique = [...new Map(documents.map((doc) => [doc.url, doc])).values()];
  if (unique.length === 0)
    return result(MARKDOWN_QUALITY, "not_checked", "No markdown documents were served to check.");
  const unbalanced = unique.filter((doc) => !codeFencesBalanced(doc.body));
  const noFrontmatter = unique.filter((doc) => !hasFrontmatter(doc.body));
  if (unbalanced.length > 0) {
    return result(
      MARKDOWN_QUALITY,
      "fail",
      `Unclosed code fence in ${count(unbalanced.length, "markdown document")}.`,
      unbalanced.map((doc) => doc.url)
    );
  }
  if (noFrontmatter.length > 0) {
    return result(
      MARKDOWN_QUALITY,
      "warn",
      `${noFrontmatter.length} of ${unique.length} markdown documents have no frontmatter.`,
      noFrontmatter.map((doc) => doc.url)
    );
  }
  return result(
    MARKDOWN_QUALITY,
    "pass",
    `All ${unique.length} markdown documents have frontmatter and balanced code fences.`
  );
}
function textFile(fetched) {
  return isOk(fetched) && !isHtmlResponse(fetched) ? fetched.body : void 0;
}
function llmsTxt(site) {
  if (wasNotFetched(site.llmsTxt)) return notFetched(LLMS_TXT, site.llmsTxt, "llms.txt");
  const body = textFile(site.llmsTxt);
  if (body === void 0) {
    const status = isResponse(site.llmsTxt) ? `HTTP ${site.llmsTxt.status}${isHtmlResponse(site.llmsTxt) ? " with an HTML page" : ""}` : `an error (${site.llmsTxt.message})`;
    return result(LLMS_TXT, "fail", `/llms.txt returned ${status}.`);
  }
  const shape = llmsTxtShape(body);
  const problems = [!shape.h1 && "no H1 on the first line", shape.linkItems === 0 && "no markdown link lists"].filter(
    Boolean
  );
  if (problems.length > 0) return result(LLMS_TXT, "warn", `/llms.txt exists but has ${problems.join(" and ")}.`);
  return result(
    LLMS_TXT,
    "pass",
    `/llms.txt has an H1${shape.summary ? ", a summary" : ""} and ${shape.linkItems} linked entries.`
  );
}
function llmsTxtLinks(site) {
  if (textFile(site.llmsTxt) === void 0)
    return result(LLMS_TXT_LINKS, "not_checked", "There's no llms.txt to check.");
  if (site.llmsLinkProbes.length === 0) {
    return result(LLMS_TXT_LINKS, "not_checked", "llms.txt has no links to this site to probe.");
  }
  const probes = site.llmsLinkProbes.filter((probe) => !wasNotFetched(probe));
  if (probes.length === 0) return notFetched(LLMS_TXT_LINKS, site.llmsLinkProbes[0], "llms.txt links");
  const broken = probes.filter((probe) => !isOk(probe));
  if (broken.length === 0) {
    return result(LLMS_TXT_LINKS, "pass", `Every probed llms.txt link resolves (${count(probes.length, "link")}).`);
  }
  return result(
    LLMS_TXT_LINKS,
    broken.length === probes.length ? "fail" : "warn",
    `${broken.length} of ${probes.length} probed llms.txt links don't resolve.`,
    broken.map((probe) => probe.requestedUrl)
  );
}
function llmsFullTxt(site) {
  if (wasNotFetched(site.llmsFullTxt)) return notFetched(LLMS_FULL_TXT, site.llmsFullTxt, "llms-full.txt");
  const fetched = site.llmsFullTxt;
  if (!isResponse(fetched))
    return result(LLMS_FULL_TXT, "warn", `/llms-full.txt couldn't be fetched: ${fetched.message}.`);
  if (fetched.status < 200 || fetched.status >= 300) {
    return result(LLMS_FULL_TXT, "warn", `/llms-full.txt returned HTTP ${fetched.status}.`);
  }
  if (contentType(fetched).includes("html"))
    return result(LLMS_FULL_TXT, "warn", "/llms-full.txt returns an HTML page.");
  return result(LLMS_FULL_TXT, "pass", "/llms-full.txt exists.");
}
function llmsTxtSections(site) {
  if (!site.llmsSection) return result(LLMS_TXT_SECTIONS, "not_checked", "No /docs section was found to check.");
  if (wasNotFetched(site.llmsSection)) return notFetched(LLMS_TXT_SECTIONS, site.llmsSection, "/docs/llms.txt");
  if (textFile(site.llmsSection) !== void 0) return result(LLMS_TXT_SECTIONS, "pass", "/docs/llms.txt exists.");
  return result(LLMS_TXT_SECTIONS, "info", "There's a /docs section but no /docs/llms.txt.");
}
function sitemap(site) {
  const first = site.sitemap.fetches[0];
  if (wasNotFetched(first)) return notFetched(SITEMAP, first, "the sitemap");
  if (!site.sitemap.valid) {
    const failed = site.sitemap.fetches.at(-1);
    const where = failed?.requestedUrl ?? site.sitemap.url;
    const status = isResponse(failed) ? `HTTP ${failed.status}` : failed?.kind === "error" ? failed.message : "not fetched";
    return result(SITEMAP, "fail", `No valid sitemap at ${where} (${status}).`);
  }
  return result(
    SITEMAP,
    "pass",
    `Valid sitemap at ${site.sitemap.url} with ${site.sitemap.entries.length} entries read.`
  );
}
function sitemapLastmod(site) {
  const entries = site.sitemap.entries;
  if (entries.length === 0) return result(SITEMAP_LASTMOD, "not_checked", "There are no sitemap entries to check.");
  const dated = entries.filter((entry) => entry.lastmod).length;
  const evidence = `${share(dated, entries.length)} of ${entries.length} sitemap entries have a lastmod date.`;
  return result(SITEMAP_LASTMOD, dated / entries.length >= 0.8 ? "pass" : "warn", evidence);
}
var DISCOVERY_RELS = ["sitemap", "describedby", "alternate", "service-doc", "service-desc", "api-catalog"];
function linkHeaders(site) {
  const home = site.pages[0]?.html;
  if (!isResponse(home)) return notFetched(LINK_HEADERS, home, "the homepage headers");
  const header = home.headers.link ?? "";
  const rels = header.split(/,(?=\s*<)/).flatMap((entry) => {
    const names = entry.match(/rel="?([^";]+)"?/)?.[1]?.split(/\s+/) ?? [];
    const isMarkdown = /type="?text\/markdown/i.test(entry);
    return names.filter((rel) => rel !== "alternate" || isMarkdown);
  });
  const discovery = [...new Set(rels.filter((rel) => DISCOVERY_RELS.includes(rel)))];
  if (discovery.length === 0) return result(LINK_HEADERS, "warn", "The homepage sends no discovery Link header.");
  return result(LINK_HEADERS, "pass", `The homepage Link header advertises ${discovery.join(", ")}.`);
}
function agentView(site) {
  const fetched = site.agentView;
  const home = site.pages[0]?.html;
  if (!isResponse(fetched)) return notFetched(AGENT_VIEW, fetched, "?mode=agent");
  if (fetched.status < 200 || fetched.status >= 300) {
    return result(AGENT_VIEW, "info", `\`?mode=agent\` returns HTTP ${fetched.status}.`);
  }
  if (!isOk(home))
    return result(AGENT_VIEW, "not_checked", "The homepage didn't load, so there's nothing to compare against.");
  const distinct = markdownBody(fetched) !== void 0 || fetched.body.length < home.body.length * LEANER_VIEW;
  return distinct ? result(AGENT_VIEW, "pass", "`?mode=agent` returns a leaner view than the homepage.") : result(AGENT_VIEW, "info", "`?mode=agent` returns the same page as the homepage.");
}
function readChecks(site) {
  return [
    contentNoJs(site),
    tokenBudget(site),
    perPageMarkdown(
      site,
      MARKDOWN_ACCEPT2,
      (page) => page.markdownAccept,
      "markdown when asked with `Accept: text/markdown`",
      true
    ),
    perPageMarkdown(site, MARKDOWN_SUFFIX, (page) => page.markdownSuffix, "markdown at a `.md` URL"),
    markdownAlternate(site),
    markdownForBots(site),
    markdownQuality(site),
    llmsTxt(site),
    llmsTxtLinks(site),
    llmsFullTxt(site),
    llmsTxtSections(site),
    sitemap(site),
    sitemapLastmod(site),
    linkHeaders(site),
    agentView(site)
  ];
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/checks/understand.ts
var define3 = (id, title, fix) => ({ id, group: "understand", title, fix });
var JSON_LD_ORG = define3(
  "json-ld-organization",
  "Organization Structured Data",
  "Add Organization JSON-LD to the homepage with name, url, logo, description, and contactPoint or address."
);
var JSON_LD_SAMEAS = define3(
  "json-ld-sameas",
  "Entity Links (sameAs)",
  "List your official profiles (LinkedIn, GitHub, Crunchbase, Wikipedia, X) in the Organization's `sameAs`, so models tie your site to the right entity."
);
var SCHEMA_BREADTH = define3(
  "schema-breadth",
  "Page Structured Data",
  "Mark up pages with the schema.org type that fits them: Article or BlogPosting, Product or SoftwareApplication, FAQPage, HowTo, BreadcrumbList."
);
var METADATA = define3(
  "metadata",
  "Page Metadata",
  "Give every page a unique title, a meta description, a canonical link, `<html lang>`, and og:image and og:type."
);
var TRUST_PAGES = define3(
  "trust-pages",
  "About, Contact, and Privacy Pages",
  "Link About, Contact, and Privacy pages from the homepage. Agents use them to judge who is behind a site."
);
var PRICING = define3(
  "pricing",
  "Pricing Page",
  "If you sell something, link a public pricing page from the homepage, and optionally publish it as markdown at /pricing.md."
);
var DOCUMENT_STRUCTURE = define3(
  "document-structure",
  "Document Structure",
  "Wrap the main content in `<main>`, use one H1 per page, and don't skip heading levels."
);
var ACCESSIBLE_CONTROLS = define3(
  "accessible-controls",
  "Accessible Controls",
  "Give every link, button, and form field an accessible name, label form fields, and use native `<a>` and `<button>` rather than clickable divs."
);
var HIDDEN_INSTRUCTIONS = define3(
  "hidden-instructions",
  "No Hidden Instructions to AI",
  "Remove hidden text or attributes that address AI agents. Models treat it as prompt injection, and it can get a site distrusted."
);
var FRESHNESS = define3(
  "content-freshness",
  "Content Freshness",
  "State when each page was published and last updated: `datePublished` and `dateModified` in JSON-LD (or `article:modified_time`), and keep them accurate. Answer engines favor content they can tell is current."
);
var CITABLE_PASSAGES = define3(
  "citable-passages",
  "Quotable Passages",
  "In articles, write key points as self-contained paragraphs of roughly 40\u2013200 words that answer one question each, so an answer engine can quote them whole."
);
var AUTHORSHIP = define3(
  "authorship",
  "Article Authors",
  "Name the author of each article in JSON-LD (`author` as a Person with `url` or `sameAs`) and on the page, and link to an author page. Named, verifiable authors are an E-E-A-T signal."
);
var SCHEMA_FEEDS = define3(
  "schema-feeds",
  "Schema Feeds (NLWeb)",
  "Optionally add a `schemamap:` line to robots.txt pointing at a feed of your schema.org data, as NLWeb proposes."
);
var ORGANIZATION_TYPES = /^(Organization|Corporation|LocalBusiness|OnlineBusiness|OnlineStore|NGO|EducationalOrganization|GovernmentOrganization|NewsMediaOrganization|SportsOrganization|MedicalOrganization|Store)$/;
var IDENTITY_TYPES = /^(Organization|Corporation|OnlineBusiness|WebSite|WebPage|Person|ImageObject|SearchAction|EntryPoint)$/;
function organization(site) {
  return site.pages[0]?.parsed?.jsonLd.find((node) => jsonLdTypes(node).some((type) => ORGANIZATION_TYPES.test(type)));
}
function jsonLdOrganization(site) {
  if (!site.pages[0]?.parsed) return notFetched(JSON_LD_ORG, site.pages[0]?.html, "the homepage");
  const org = organization(site);
  if (!org) return result(JSON_LD_ORG, "fail", "The homepage has no Organization JSON-LD.");
  const missing = [
    !org.name && "name",
    !org.url && "url",
    !org.logo && "logo",
    !org.description && "description",
    !(org.contactPoint || org.address || org.email) && "contactPoint or address"
  ].filter((field) => Boolean(field));
  if (missing.length === 0) return result(JSON_LD_ORG, "pass", "The homepage has complete Organization JSON-LD.");
  return result(
    JSON_LD_ORG,
    missing.includes("name") ? "fail" : "warn",
    `Organization JSON-LD is missing ${list(missing)}.`
  );
}
function jsonLdSameAs(site) {
  if (!site.pages[0]?.parsed) return notFetched(JSON_LD_SAMEAS, site.pages[0]?.html, "the homepage");
  const sameAs = organization(site)?.sameAs;
  const links = (Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : []).filter(
    (value) => typeof value === "string"
  );
  const hosts = [...new Set(links.map(normalizeHost))];
  if (hosts.length >= 2) return result(JSON_LD_SAMEAS, "pass", `sameAs links to ${list(hosts)}.`);
  if (hosts.length === 1) return result(JSON_LD_SAMEAS, "warn", `sameAs links only to ${hosts[0]}.`);
  return result(JSON_LD_SAMEAS, "fail", "The Organization has no sameAs links.");
}
function schemaBreadth(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(SCHEMA_BREADTH, site.pages[0]?.html, "page markup");
  const types = new Set(
    pages.flatMap((page) => page.parsed?.jsonLd.flatMap(jsonLdTypes) ?? []).filter((type) => !IDENTITY_TYPES.test(type))
  );
  if (types.size >= 2) return result(SCHEMA_BREADTH, "pass", `Sampled pages use ${list([...types].slice(0, 6))}.`);
  if (types.size === 1) return result(SCHEMA_BREADTH, "warn", `Sampled pages only use ${[...types][0]}.`);
  return result(SCHEMA_BREADTH, "fail", "Sampled pages have no content-level structured data.");
}
var METADATA_FIELDS = [
  ["title", (page) => page.title],
  ["meta description", (page) => page.metaDescription],
  ["canonical", (page) => page.canonical],
  ["lang", (page) => page.lang],
  ["og:image", (page) => page.ogImage],
  ["og:type", (page) => page.ogType]
];
function metadata(site) {
  const pages = parsedPages(site).flatMap((page) => page.parsed ? [page.parsed] : []);
  if (pages.length === 0) return notFetched(METADATA, site.pages[0]?.html, "page markup");
  const gaps = METADATA_FIELDS.map(([field, read]) => ({
    field,
    urls: pages.filter((page) => !read(page)).map((page) => page.url)
  })).filter((gap) => gap.urls.length > 0);
  const titles = pages.map((page) => page.title).filter(Boolean);
  const duplicated = new Set(titles).size < titles.length;
  if (gaps.length === 0 && !duplicated) {
    return result(METADATA, "pass", `All ${pages.length} sampled pages have unique titles and complete metadata.`);
  }
  const parts = gaps.map((gap) => `${gap.field} missing on ${count(gap.urls.length, "page")}`);
  if (duplicated) parts.push("duplicate titles");
  const critical = gaps.some((gap) => gap.field === "title" || gap.field === "meta description");
  return result(METADATA, critical ? "fail" : "warn", `${list(parts)}.`, [...new Set(gaps.flatMap((gap) => gap.urls))]);
}
function linkedPageState(page) {
  if (!page.href) return "missing";
  if (!page.fetched || page.fetched.kind === "skipped") return "unchecked";
  return isOk(page.fetched) ? "ok" : "broken";
}
function trustPages(site) {
  if (!site.pages[0]?.parsed) return notFetched(TRUST_PAGES, site.pages[0]?.html, "the homepage");
  const states = Object.entries(site.trust).map(([name, page]) => ({ name, state: linkedPageState(page) }));
  if (states.every((entry) => entry.state === "unchecked"))
    return notFetched(TRUST_PAGES, site.trust.about.fetched, "the linked pages");
  const bad = states.filter((entry) => entry.state === "missing" || entry.state === "broken");
  if (bad.length === 0)
    return result(TRUST_PAGES, "pass", "About, Contact, and Privacy pages are linked from the homepage.");
  const describe = bad.map((entry) => `${entry.name} ${entry.state === "missing" ? "isn't linked" : "doesn't load"}`);
  return result(TRUST_PAGES, bad.length === states.length ? "fail" : "warn", `${list(describe)}.`);
}
function pricing(site) {
  if (!site.pages[0]?.parsed) return notFetched(PRICING, site.pages[0]?.html, "the homepage");
  const state = linkedPageState(site.pricing);
  if (state === "missing") return result(PRICING, "info", "No pricing page is linked from the homepage.");
  if (state === "broken") return result(PRICING, "warn", `The pricing link (${site.pricing.href}) doesn't load.`);
  if (state === "unchecked") return notFetched(PRICING, site.pricing.fetched, "the pricing page");
  const markdown = isOk(site.pricing.markdown) && !isHtmlResponse(site.pricing.markdown) ? " It's also published as markdown." : "";
  return result(PRICING, "pass", `A pricing page is linked from the homepage.${markdown}`);
}
function documentStructure(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(DOCUMENT_STRUCTURE, site.pages[0]?.html, "page markup");
  const issues = pages.flatMap((page) => {
    const meta = page.parsed;
    if (!meta) return [];
    const h1s = meta.headings.filter((heading) => heading.level === 1).length;
    const skips = meta.headings.some((heading, i) => i > 0 && heading.level - (meta.headings[i - 1]?.level ?? 1) > 1);
    const problems = [
      !meta.hasMain && "no <main>",
      h1s === 0 && "no H1",
      h1s > 1 && "more than one H1",
      skips && "skipped heading levels"
    ].filter((problem) => Boolean(problem));
    return problems.length > 0 ? [{ url: page.url, problems }] : [];
  });
  if (issues.length === 0)
    return result(
      DOCUMENT_STRUCTURE,
      "pass",
      `All ${pages.length} sampled pages have a <main>, one H1, and ordered headings.`
    );
  const kinds = [...new Set(issues.flatMap((issue) => issue.problems))];
  return result(
    DOCUMENT_STRUCTURE,
    "warn",
    `${issues.length} of ${pages.length} pages have structure issues (${list(kinds)}).`,
    issues.map((issue) => issue.url)
  );
}
function accessibleControls(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(ACCESSIBLE_CONTROLS, site.pages[0]?.html, "page markup");
  const totals = pages.reduce(
    (sum, page) => {
      const controls = page.parsed?.controls;
      if (!controls) return sum;
      return {
        total: sum.total + controls.total,
        named: sum.named + controls.named,
        nonNative: sum.nonNative + controls.nonNative,
        formControls: sum.formControls + controls.formControls,
        labeled: sum.labeled + controls.labeledFormControls
      };
    },
    { total: 0, named: 0, nonNative: 0, formControls: 0, labeled: 0 }
  );
  if (totals.total === 0) return result(ACCESSIBLE_CONTROLS, "pass", "The sampled pages have no interactive controls.");
  const namedShare = totals.named / totals.total;
  const unlabeled = totals.formControls - totals.labeled;
  const evidence = `${totals.named} of ${totals.total} controls have an accessible name (${share(totals.named, totals.total)}); ${count(unlabeled, "unlabeled form field")}; ${count(totals.nonNative, "clickable non-native element")}.`;
  if (namedShare >= 0.95 && unlabeled === 0 && totals.nonNative === 0)
    return result(ACCESSIBLE_CONTROLS, "pass", evidence);
  return result(ACCESSIBLE_CONTROLS, namedShare >= 0.8 ? "warn" : "fail", evidence);
}
function hiddenInstructions(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(HIDDEN_INSTRUCTIONS, site.pages[0]?.html, "page markup");
  const flagged = pages.filter((page) => (page.parsed?.hiddenInstructions.length ?? 0) > 0);
  if (flagged.length === 0)
    return result(
      HIDDEN_INSTRUCTIONS,
      "pass",
      `No hidden instructions to AI found across ${count(pages.length, "page")}.`
    );
  const sample = flagged[0]?.parsed?.hiddenInstructions[0] ?? "";
  return result(
    HIDDEN_INSTRUCTIONS,
    "warn",
    `Hidden text addressed to AI on ${count(flagged.length, "page")}, for example "${sample}".`,
    flagged.map((page) => page.url)
  );
}
var STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1e3;
var EDITORIAL_TYPES = /^(Article|BlogPosting|NewsArticle|OpinionNewsArticle|ReportageNewsArticle|AnalysisNewsArticle|Report|ScholarlyArticle)$/;
function isEditorial(page) {
  const types = page.parsed?.jsonLd.flatMap(jsonLdTypes) ?? [];
  if (types.includes("TechArticle")) return false;
  return types.some((type) => EDITORIAL_TYPES.test(type)) || page.parsed?.ogType === "article";
}
function pageDates(page) {
  const meta = page.parsed;
  const structured = [
    ...meta?.jsonLd.flatMap((node) => [node.dateModified, node.datePublished]) ?? [],
    ...meta?.metaDates ?? []
  ].filter((value) => typeof value === "string").map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  if (structured.length > 0) return { dates: structured, source: "structured" };
  const header = isResponse(page.html) ? page.html.headers["last-modified"] : void 0;
  const fromHeader = header ? new Date(header) : void 0;
  return fromHeader && !Number.isNaN(fromHeader.getTime()) ? { dates: [fromHeader], source: "header" } : { dates: [], source: "none" };
}
function freshness(site) {
  const pages = parsedPages(site);
  if (pages.length === 0) return notFetched(FRESHNESS, site.pages[0]?.html, "page markup");
  const dated = pages.map((page) => ({ url: page.url, ...pageDates(page) })).filter((page) => page.source !== "none");
  const undated = pages.filter((page) => !dated.some((d) => d.url === page.url)).map((page) => page.url);
  if (dated.length === 0)
    return result(FRESHNESS, "warn", "None of the sampled pages says when it was published or updated.", undated);
  const newest = new Date(Math.max(...dated.flatMap((page) => page.dates.map((date) => date.getTime()))));
  const structuredCount = dated.filter((page) => page.source === "structured").length;
  const evidence = `${dated.length} of ${pages.length} pages carry a date (${structuredCount} in structured data or meta tags); the newest is ${newest.toISOString().slice(0, 10)}.`;
  if (Date.now() - newest.getTime() > STALE_AFTER_MS)
    return result(FRESHNESS, "warn", `${evidence} Nothing sampled was updated in the past year.`);
  if (structuredCount < pages.length / 2) return result(FRESHNESS, "warn", evidence, undated);
  return result(FRESHNESS, "pass", evidence);
}
var MIN_PASSAGES = 3;
function citablePassages(site) {
  const articles = parsedPages(site).filter(isEditorial);
  if (articles.length === 0) return result(CITABLE_PASSAGES, "not_checked", "No article pages were in the sample.");
  const counts = articles.map((page) => ({ url: page.url, passages: page.parsed?.citablePassages ?? 0 }));
  const strong = counts.filter((page) => page.passages >= MIN_PASSAGES);
  const total = counts.reduce((sum, page) => sum + page.passages, 0);
  const evidence = `${strong.length} of ${articles.length} article pages have at least ${MIN_PASSAGES} quotable passages of 40\u2013200 words (${total} in all).`;
  const weak = counts.filter((page) => page.passages < MIN_PASSAGES).map((page) => page.url);
  if (strong.length >= articles.length / 2) return result(CITABLE_PASSAGES, "pass", evidence);
  return result(CITABLE_PASSAGES, total === 0 ? "fail" : "warn", evidence, weak);
}
function articleAuthor(page) {
  const meta = page.parsed;
  if (!meta) return "none";
  const authors = meta.jsonLd.flatMap((node) => {
    const author = node.author;
    return Array.isArray(author) ? author : author ? [author] : [];
  });
  const verifiable = authors.some(
    (author) => typeof author === "object" && author !== null && ("url" in author || "sameAs" in author)
  );
  if (verifiable || authors.length > 0 && meta.hasAuthorLink) return "verifiable";
  const publisher = meta.jsonLd.some((node) => node.publisher);
  return authors.length > 0 || publisher || meta.authorMeta || meta.hasAuthorLink ? "named" : "none";
}
function authorship(site) {
  const articles = parsedPages(site).filter(isEditorial);
  if (articles.length === 0) return result(AUTHORSHIP, "not_checked", "No article pages were in the sample.");
  const states = articles.map((page) => ({ url: page.url, state: articleAuthor(page) }));
  const anonymous = states.filter((page) => page.state === "none");
  const unverified = states.filter((page) => page.state === "named");
  const evidence = `${articles.length - anonymous.length} of ${articles.length} article pages name an author or publisher; ${states.filter((page) => page.state === "verifiable").length} link the author to a profile.`;
  if (anonymous.length > 0 || unverified.length > 0) {
    return result(
      AUTHORSHIP,
      "warn",
      evidence,
      [...anonymous, ...unverified].map((page) => page.url)
    );
  }
  return result(AUTHORSHIP, "pass", evidence);
}
function schemaFeeds(site) {
  if (!site.robots) return result(SCHEMA_FEEDS, "not_checked", "There's no robots.txt to check.");
  if (site.robots.schemamaps.length > 0)
    return result(SCHEMA_FEEDS, "pass", `robots.txt declares schemamap: ${site.robots.schemamaps[0]}.`);
  return result(SCHEMA_FEEDS, "info", "robots.txt has no schemamap line.");
}
function understandChecks(site) {
  return [
    jsonLdOrganization(site),
    jsonLdSameAs(site),
    schemaBreadth(site),
    metadata(site),
    freshness(site),
    citablePassages(site),
    authorship(site),
    trustPages(site),
    pricing(site),
    documentStructure(site),
    accessibleControls(site),
    hiddenInstructions(site),
    schemaFeeds(site)
  ];
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/http.ts
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { pipeline } from "node:stream";
import zlib from "node:zlib";
var BlockedHostError = class extends Error {
};
var DEFAULT_TIMEOUT_MS = 1e4;
var DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
var DEADLINE_MS = 3e4;
var BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3]
]) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8]
]) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}
function isPublicAddress(ip) {
  const family = isIP(ip);
  if (family === 0) return false;
  return !BLOCKED.check(ip, family === 4 ? "ipv4" : "ipv6");
}
var guardedLookup = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list2 = addresses;
    const allowed = list2.filter((entry) => isPublicAddress(entry.address));
    if (allowed.length === 0) {
      return callback(new BlockedHostError(`${hostname} resolves to a private or reserved address`), "", 0);
    }
    if (options.all) return callback(null, allowed, 0);
    const first = allowed[0];
    callback(null, first.address, first.family);
  });
};
function decoderFor(encoding) {
  switch (encoding?.trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return void 0;
  }
}
function flattenHeaders(raw) {
  const headers = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value !== void 0) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}
function readBody(res, request, headers) {
  const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
  const hasBody = request.method !== "HEAD" && res.statusCode !== 204 && res.statusCode !== 304;
  const decoder = hasBody ? decoderFor(headers["content-encoding"]) : void 0;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    };
    const fail = (error) => {
      if (done) return;
      done = true;
      reject(error);
    };
    const stream = decoder ? pipeline(res, decoder, (error) => error && fail(error)) : res;
    stream.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
      else chunks.push(chunk);
      if (size >= maxBytes) {
        finish();
        res.destroy();
      }
    });
    stream.on("end", finish);
    stream.on("error", fail);
    res.on("aborted", () => fail(new Error(`Connection closed while reading ${request.url}`)));
  });
}
function rejectUnsafe(url, allowPrivateNetwork) {
  if (allowPrivateNetwork) return void 0;
  if (url.protocol !== "https:") return new BlockedHostError(`Only HTTPS URLs are audited: ${url}`);
  if (url.port && url.port !== "443") return new BlockedHostError(`Only the default HTTPS port is audited: ${url}`);
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && !isPublicAddress(literal))
    return new BlockedHostError(`${url.hostname} is a private or reserved address`);
  return void 0;
}
function httpRequest(request, allowPrivateNetwork = false) {
  const url = new URL(request.url);
  const unsafe = rejectUnsafe(url, allowPrivateNetwork);
  if (unsafe) return Promise.reject(unsafe);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => req.destroy(new Error(`Took too long fetching ${request.url}`)), DEADLINE_MS);
    const settle = (fn) => (value) => {
      clearTimeout(deadline);
      fn(value);
    };
    const req = transport.request(
      url,
      {
        method: request.method ?? "GET",
        headers: { "accept-encoding": "gzip, deflate, br", ...request.headers },
        lookup: allowPrivateNetwork ? void 0 : guardedLookup,
        timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: request.signal
      },
      (res) => {
        const headers = flattenHeaders(res.headers);
        readBody(res, request, headers).then(
          settle(
            (bytes) => resolve({ url: request.url, status: res.statusCode ?? 0, headers, body: bytes.toString("utf8"), bytes })
          )
        ).catch(settle(reject));
      }
    );
    req.on("timeout", () => req.destroy(new Error(`Timed out fetching ${request.url}`)));
    req.on("error", settle(reject));
    req.end();
  });
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/fetcher.ts
var MAX_REDIRECTS = 5;
var MAX_RETRY_AFTER_MS = 3e4;
var MAX_CRAWL_DELAY_MS = 1e4;
var MAX_CONSECUTIVE_FAILURES = 2;
function abortableSleep(signal) {
  return (ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}
var Fetcher = class {
  constructor(options) {
    this.options = options;
    this.sleep = options.sleep ?? abortableSleep(options.signal);
    this.robotsToken = options.userAgent.split("/")[0] ?? options.userAgent;
  }
  options;
  used = 0;
  budgetExhausted = false;
  hosts = /* @__PURE__ */ new Map();
  cache = /* @__PURE__ */ new Map();
  sleep;
  robotsToken;
  get limit() {
    return this.options.requestLimit;
  }
  stopped(origin) {
    return this.hosts.get(origin)?.stopped === true;
  }
  setRobots(origin, robots) {
    this.host(origin).robots = robots;
  }
  get(url, options = {}) {
    const key = JSON.stringify([
      url,
      options.accept,
      options.userAgent,
      options.method,
      options.followRedirects,
      options.maxBytes
    ]);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.fetchFollowing(url, options).catch((error) => {
        if (this.options.signal?.aborted) throw error;
        return { kind: "error", requestedUrl: url, message: error.message, blocked: false };
      });
      this.cache.set(key, pending);
    }
    return pending;
  }
  host(origin) {
    let state = this.hosts.get(origin);
    if (!state) {
      state = { nextSlotAt: 0, consecutiveFailures: 0, stopped: false };
      this.hosts.set(origin, state);
    }
    return state;
  }
  async fetchFollowing(requestedUrl, options) {
    const hops = [];
    let current = requestedUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const outcome = await this.fetchOnce(current, options);
      if (outcome.kind !== "response") return { ...outcome, requestedUrl };
      const location = outcome.headers.location;
      const isRedirect = outcome.status >= 300 && outcome.status < 400 && location;
      if (!isRedirect || options.followRedirects === false) {
        return { ...outcome, kind: "response", requestedUrl, url: current, hops };
      }
      const next = new URL(location, current).toString();
      hops.push({ url: current, status: outcome.status, location: next });
      current = next;
    }
    return { kind: "error", requestedUrl, message: `More than ${MAX_REDIRECTS} redirects`, blocked: false };
  }
  async fetchOnce(url, options) {
    const { origin } = new URL(url);
    const state = this.host(origin);
    const userAgent = options.userAgent ?? this.options.userAgent;
    const skip = this.skipReason(url, state, options);
    if (skip) return { kind: "skipped", requestedUrl: url, reason: skip };
    this.used++;
    const crawlDelayMs = (state.robots?.getCrawlDelay(this.robotsToken) ?? 0) * 1e3;
    const gap = Math.max(this.options.delayMs, crawlDelayMs);
    const now = Date.now();
    const startAt = Math.max(now, state.nextSlotAt);
    state.nextSlotAt = startAt + gap;
    if (startAt > now) await this.sleep(startAt - now);
    this.options.signal?.throwIfAborted();
    this.options.onProgress?.({ type: "fetch", url, requestsUsed: this.used });
    try {
      const response = await httpRequest(
        {
          url,
          method: options.method,
          maxBytes: options.maxBytes,
          signal: this.options.signal,
          headers: {
            "user-agent": userAgent,
            accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
          }
        },
        this.options.allowPrivateNetwork
      );
      this.noteStatus(state, response, Boolean(options.userAgent));
      return { kind: "response", requestedUrl: url, hops: [], ...response };
    } catch (error) {
      if (this.options.signal?.aborted) throw error;
      const blocked = error instanceof BlockedHostError;
      if (blocked) state.stopped = true;
      else if (!options.userAgent && ++state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) state.stopped = true;
      return { kind: "error", requestedUrl: url, message: error.message, blocked };
    }
  }
  skipReason(url, state, options) {
    if (state.stopped) return "host-stopped";
    if (!options.ignoreRobots && state.robots?.isAllowed(url, this.robotsToken) === false) return "robots";
    if ((state.robots?.getCrawlDelay(this.robotsToken) ?? 0) * 1e3 > MAX_CRAWL_DELAY_MS) return "crawl-delay";
    if (this.used >= this.options.requestLimit) {
      this.budgetExhausted = true;
      return "budget";
    }
    return void 0;
  }
  // A bot-UA probe being refused (403, or a 503 challenge page) is the finding, not a
  // sign the host is struggling, so only a 429 aimed at it slows the audit down.
  noteStatus(state, response, isProbe) {
    const throttled = response.status === 429 || response.status === 503 && !isProbe;
    if (throttled) {
      const retryAfter = Number(response.headers["retry-after"]);
      const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1e3 : Number.POSITIVE_INFINITY;
      if (waitMs > MAX_RETRY_AFTER_MS) state.stopped = true;
      else state.nextSlotAt = Math.max(state.nextSlotAt, Date.now() + waitMs);
    }
    if (isProbe) return;
    if (response.status === 403 || response.status >= 500) {
      if (++state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) state.stopped = true;
    } else {
      state.consecutiveFailures = 0;
    }
  }
};

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/resolve.ts
async function resolveHosts(fetcher, inputs) {
  const brandHosts = new Set(inputs.map(normalizeHost));
  const resolved = [];
  for (const [index, input] of inputs.entries()) {
    const host = normalizeHost(input);
    const fetched = await fetcher.get(homepageUrl(input), { ignoreRobots: true });
    if (fetched.kind !== "response") {
      resolved.push({
        host,
        outcome: "unreachable",
        hops: [],
        error: fetched.kind === "error" ? fetched.message : `Not fetched (${fetched.reason})`
      });
      continue;
    }
    const finalOrigin = new URL(fetched.url).origin;
    const finalHost = normalizeHost(finalOrigin);
    const ownedByBrand = [...brandHosts].some((brand) => finalHost === brand || finalHost.endsWith(`.${brand}`));
    const outcome = finalHost === host || index === 0 ? "site" : ownedByBrand ? "alias" : "external";
    resolved.push({ host, outcome, finalOrigin, hops: fetched.hops, homepage: fetched });
  }
  return resolved;
}

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/types.ts
var REPORT_SCHEMA_VERSION = 1;
var DEFAULT_USER_AGENT = "ElmoBot/1.0 (+https://www.elmohq.com/docs/user-guide/agent-readiness-audit#elmobot)";

// ../../../../../tmp/elmo-src/repo/packages/site-audit/src/audit.ts
var DEFAULT_REQUESTS = 75;
var DEFAULT_PAGES = 10;
var DEFAULT_DELAY_MS = 1e3;
function summarize(checks) {
  return {
    pass: checks.filter((check) => check.status === "pass").length,
    warn: checks.filter((check) => check.status === "warn").length,
    fail: checks.filter((check) => check.status === "fail").length,
    notChecked: checks.filter((check) => check.status === "not_checked").length
  };
}
function scoreChecks(checks, blockedAudit) {
  const scored = checks.filter(
    (check) => check.status === "pass" || check.status === "warn" || check.status === "fail" || blockedAudit && check.status === "not_checked"
  );
  if (scored.length === 0) return null;
  const earned = scored.reduce(
    (sum, check) => sum + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
    0
  );
  return Math.round(earned / scored.length * 100);
}
function meanScore(sites) {
  const scores = sites.map((site) => site.score).filter((score) => score !== null);
  return scores.length === 0 ? null : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}
async function auditSites(options) {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fetcher = new Fetcher({
    requestLimit: options.budget?.requests ?? DEFAULT_REQUESTS,
    delayMs: options.budget?.delayMs ?? DEFAULT_DELAY_MS,
    userAgent,
    signal: options.signal,
    onProgress: options.onProgress,
    allowPrivateNetwork: options.allowPrivateNetwork
  });
  const byHost = /* @__PURE__ */ new Map();
  const upgrade = (host) => options.allowPrivateNetwork ? host : host.trim().replace(/^http:\/\//i, "https://");
  for (const host of [options.website, ...options.additionalDomains ?? []].map(upgrade)) {
    if (!byHost.has(normalizeHost(host))) byHost.set(normalizeHost(host), host);
  }
  const inputs = [...byHost.values()];
  for (const host of inputs) options.onProgress?.({ type: "resolving", host });
  const resolved = await resolveHosts(fetcher, inputs);
  const siteOrigins = [
    ...new Set(
      resolved.filter((host) => host.outcome === "site" || host.outcome === "alias").map((host) => host.finalOrigin)
    )
  ];
  const sites = [];
  for (const origin of siteOrigins) {
    options.onProgress?.({ type: "auditing", origin });
    const aliases = resolved.filter((host) => host.outcome === "alias" && host.finalOrigin === origin);
    const homepage = resolved.find((host) => host.finalOrigin === origin && host.homepage)?.homepage;
    const artifacts = await gatherSite({
      fetcher,
      origin,
      homepage,
      priorityPages: options.extraPages ?? [],
      pageLimit: options.budget?.pages ?? DEFAULT_PAGES,
      userAgentToken: fetcher.robotsToken
    });
    const checks = [...reachChecks(artifacts, aliases), ...readChecks(artifacts), ...understandChecks(artifacts)];
    const blockedAudit = fetcher.stopped(artifacts.origin) || artifacts.robots?.isAllowed(`${artifacts.origin}/`, fetcher.robotsToken) === false;
    sites.push({
      origin: artifacts.origin,
      aliases: aliases.map(({ homepage: _homepage, ...alias }) => alias),
      pages: artifacts.pages.map((page) => page.url),
      checks,
      summary: summarize(checks),
      blockedAudit,
      score: scoreChecks(checks, blockedAudit)
    });
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    auditedAt: (/* @__PURE__ */ new Date()).toISOString(),
    userAgent,
    hosts: resolved.map(({ homepage: _homepage, ...host }) => host),
    sites,
    score: meanScore(sites),
    requests: { used: fetcher.used, limit: fetcher.limit, budgetExhausted: fetcher.budgetExhausted }
  };
}
export {
  DEFAULT_USER_AGENT,
  REPORT_SCHEMA_VERSION,
  auditSites
};
