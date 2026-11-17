// A small, safe markdown for the chat: headings, **bold**, `code`, links, bullet and numbered lists, > quotes.
// parseMd returns plain data; the panel turns it into DOM nodes with textContent only, so page or model text can never become HTML.
export function parseInline(s) {
  const out = []; const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    const x = m[0];
    if (x.startsWith('**')) out.push({ t: 'b', v: x.slice(2, -2) });
    else if (x.startsWith('`')) out.push({ t: 'code', v: x.slice(1, -1) });
    else { const mm = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(x); out.push({ t: 'a', v: mm[1], href: mm[2] }); }
    last = m.index + x.length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}
export function parseMd(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n'), blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^#{1,3}\s+(.*)$/))) { blocks.push({ k: 'h', inline: parseInline(m[1]) }); i++; continue; }
    if (/^\s*[-*•]\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\s*[-*•]\s+/, ''))); i++; } blocks.push({ k: 'ul', items }); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))); i++; } blocks.push({ k: 'ol', items }); continue; }
    if (/^>\s?/.test(l)) { const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; } blocks.push({ k: 'quote', inline: parseInline(q.join(' ')) }); continue; }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*([-*•]|\d+[.)])\s|>)/.test(lines[i])) { p.push(lines[i]); i++; }
    blocks.push({ k: 'p', inline: parseInline(p.join('\n')) });
  }
  return blocks;
}
