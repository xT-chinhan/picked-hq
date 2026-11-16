const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const line = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
const markdown = value => line(value).replace(/[\\`*_{}\[\]()<>#!|]/g, '\\$&');

function httpUrl(value, label) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL without credentials`);
  }
}
const markdownUrl = url => url.replace(/[()<>]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

/** Convert text, including Vietnamese letters, to a lowercase ASCII URL slug. */
export function slugify(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Render a self-contained Vietnamese shop page and its crawler files without I/O. */
export function renderShopPage({ brand, slug, website, category, facts, content, baseUrl, publishedAt }) {
  const home = httpUrl(website, 'website');
  const page = httpUrl(baseUrl, 'baseUrl');
  if (!Array.isArray(facts?.facts)) throw new Error('facts must be a Facts object');
  const date = new Date(publishedAt);
  if (publishedAt == null || !Number.isFinite(date.getTime())) throw new Error('publishedAt must be a valid date');
  const lastmod = date.toISOString().slice(0, 10);
  const displayDate = lastmod.split('-').reverse().join('/');
  const sources = [...new Set(facts.facts.map(fact => httpUrl(fact.source, 'fact source')))];
  const summary = content.overview.paragraphs[0]?.text || '';
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: brand, url: home },
      { '@type': 'FAQPage', mainEntity: content.faqs.map(faq => ({
        '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })) },
    ],
  };
  const json = JSON.stringify(structured).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const sitemapUrl = new URL(page);
  sitemapUrl.pathname = `${sitemapUrl.pathname.replace(/\/$/, '')}/sitemap.xml`;
  sitemapUrl.search = '';
  sitemapUrl.hash = '';
  const bots = ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended'];
  return {
    'index.html': `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(brand)} — ${escape(category)}</title>
<meta name="description" content="${escape(summary)}">
<link rel="canonical" href="${escape(page)}">
<style>
:root{color-scheme:light;--accent:#4f46e5}*{box-sizing:border-box}body{margin:0;background:#fff;color:#242424;font:1rem/1.75 system-ui,sans-serif}main,header,footer{max-width:52rem;margin:auto;padding:2rem 1.25rem}header{padding-top:3rem;border-bottom:1px solid #eee}h1{font-size:2.4rem;line-height:1.2;margin:.5rem 0}h2{font-size:1.5rem}h3{font-size:1.1rem}h1,h2{color:var(--accent)}section{margin-bottom:3rem}article{padding:1rem 0;border-bottom:1px solid #eee}a{color:var(--accent);overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}li{margin:.75rem 0}footer{border-top:1px solid #eee;font-size:.875rem;color:#555}@media(min-width:48rem){main,header,footer{padding-left:3rem;padding-right:3rem}}
</style><script type="application/ld+json">${json}</script></head>
<body><header id="${escape(slug)}"><p>${escape(category)}</p><h1>${escape(brand)}</h1><a href="${escape(home)}">Website thương hiệu</a></header>
<main><section aria-labelledby="overview"><h2 id="overview">${escape(content.overview.title)}</h2>
${content.overview.paragraphs.map(paragraph => `<p>${escape(paragraph.text)}</p>`).join('\n')}</section>
<section aria-labelledby="faq"><h2 id="faq">Hỏi đáp</h2>
${content.faqs.map((faq, index) => `<article id="faq-${index + 1}"><h3>${escape(faq.q)}</h3><p>${escape(faq.a)}</p></article>`).join('\n')}</section>
<section><h2>Thông tin</h2><ul>${facts.facts.filter(fact => ['contact', 'price'].includes(fact.kind)).map(fact => `<li>${escape(fact.text)}</li>`).join('')}</ul></section>
<section><h2>Nguồn</h2><ul>${sources.map(source => `<li><a href="${escape(source)}">${escape(source)}</a></li>`).join('')}</ul></section></main>
<footer><p>Trang thông tin do Picked soạn từ nguồn công khai, chủ thương hiệu đã duyệt</p><p>Ngày xuất bản: <time datetime="${escape(lastmod)}">${escape(displayDate)}</time></p></footer></body></html>`,
    'llms.txt': `# ${line(brand)}\n\n> ${line(summary)}\n\n## Thông tin chính\n\n${sources.map(source => {
      const notes = facts.facts.filter(fact => httpUrl(fact.source, 'fact source') === source).map(fact => fact.text).join(' ');
      return `- [${markdown(new URL(source).hostname)}](${markdownUrl(source)}): ${markdown(notes)}`;
    }).join('\n')}\n\n## Hỏi đáp\n\n${content.faqs.map((faq, index) => `- [${markdown(faq.q)}](${markdownUrl(page.replace(/#.*$/, ''))}#faq-${index + 1}): ${markdown(faq.a)}`).join('\n')}\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(page)}</loc><lastmod>${lastmod}</lastmod></url></urlset>\n`,
    'robots.txt': `${bots.map(bot => `User-agent: ${bot}\nAllow: /`).join('\n\n')}\n\nSitemap: ${sitemapUrl.href}\n`,
  };
}
