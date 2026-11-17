import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { tick } from './ticker'

/* Text that streams in a word at a time, like a model answering. Lines already typed once show whole on a re-render. */
const typed = new Set<string>()
export function Typed({ k, text, className = '', caret }: { k: string; text: string; className?: string; caret?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null), [end, setEnd] = useState(typed.has(k))
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (typed.has(k)) { el.textContent = text; return }
    const parts = text.split(/(\s+)/); let i = 0
    el.textContent = ''
    const stop = tick(() => { i = Math.min(parts.length, i + 2); el.textContent = parts.slice(0, i).join(''); if (i >= parts.length) { stop(); typed.add(k); setEnd(true) } })
    return stop
  }, [k, text])
  return <span ref={ref} className={`${className} ${caret && !end ? 'caret' : ''}`} />
}

/* A small, safe markdown: headings, bold, italic, `code`, links, bullet and numbered lists, > quotes, --- rules, | tables |. Everything is text, never HTML. */
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<b key={i++} className="font-semibold text-ink">{t.slice(2, -2)}</b>)
    else if (t.startsWith('`')) out.push(<code key={i++} className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.86em] text-ink">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) { const mm = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(t)!; out.push(<a key={i++} href={mm[2]} target="_blank" rel="noreferrer" className="font-medium text-accent underline decoration-line underline-offset-2">{mm[1]}</a>) }
    else out.push(<i key={i++}>{t.slice(1, -1)}</i>)
    last = m.index + t.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
export function Md({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n'), blocks: ReactNode[] = []
  let i = 0, key = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    let m: RegExpMatchArray | null
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { blocks.push(<div key={key++} className={`font-semibold tracking-[-0.025em] text-ink ${m[1].length === 1 ? 'mt-1 text-[1.35em]' : 'text-[1.15em]'}`}>{inline(m[2])}</div>); i++; continue }
    if (/^\s*([-*•])\s+/.test(l)) { const items: ReactNode[] = []; while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) { items.push(<li key={i} className="flex gap-2.5"><span className="mt-[0.62em] h-1.5 w-1.5 flex-none rounded-full bg-faint" /><span>{inline(lines[i].replace(/^\s*([-*•])\s+/, ''))}</span></li>); i++ } blocks.push(<ul key={key++} className="space-y-1">{items}</ul>); continue }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items: ReactNode[] = []; let n = 1; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(<li key={i} className="flex gap-3"><span className="mt-[0.15em] grid h-6 w-6 flex-none place-items-center rounded-full bg-surface text-[0.78em] font-bold text-ink">{n++}</span><span>{inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</span></li>); i++ } blocks.push(<ol key={key++} className="space-y-1.5">{items}</ol>); continue }
    if (/^>\s?/.test(l)) { const q: string[] = []; while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++ } blocks.push(<blockquote key={key++} className="border-l-[3px] border-line bg-surface py-1.5 pl-3.5 pr-2 text-ink">{inline(q.join(' '))}</blockquote>); continue }
    if (/^-{3,}$/.test(l.trim())) { blocks.push(<hr key={key++} className="border-line" />); i++; continue }
    if (/^\|.*\|$/.test(l.trim())) {
      const rows: string[][] = []; while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { if (!/^\|[\s:|-]+\|$/.test(lines[i].trim())) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim())); i++ }
      blocks.push(<div key={key++} className="overflow-hidden rounded-xl border border-line"><table className="w-full text-left text-[0.92em]"><thead><tr className="bg-surface">{rows[0]?.map((c, k) => <th key={k} className="px-3 py-2 font-semibold text-ink">{inline(c)}</th>)}</tr></thead><tbody>{rows.slice(1).map((r, a) => <tr key={a} className="border-t border-line">{r.map((c, k) => <td key={k} className="px-3 py-2 text-mute">{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue
    }
    const p: string[] = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*([-*•]|\d+[.)])\s|>|\||-{3,}$)/.test(lines[i])) { p.push(lines[i]); i++ }
    blocks.push(<p key={key++}>{p.map((x, k) => <Fragment key={k}>{k > 0 && <br />}{inline(x)}</Fragment>)}</p>)
  }
  return <div className={`space-y-2.5 ${className}`}>{blocks}</div>
}

/** A reply streamed word by word and formatted as markdown while it types. */
export function TypedMd({ k, text, className = '' }: { k: string; text: string; className?: string }) {
  const [n, setN] = useState(typed.has(k) ? Infinity : 0), parts = text.split(/(\s+)/)
  useEffect(() => {
    if (typed.has(k)) { setN(Infinity); return }
    let i = 0
    const stop = tick(() => { i += 2; setN(i); if (i >= parts.length) { stop(); typed.add(k) } })
    return stop
  }, [k, text])
  const shown = n >= parts.length ? text : parts.slice(0, n).join('')
  return <div className={`${className} ${n < parts.length ? 'caret-md' : ''}`}><Md text={shown} /></div>
}
