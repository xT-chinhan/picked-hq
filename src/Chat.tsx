import { ArrowUp, Check, Plus, X } from 'lucide-react'
import openai from '@lobehub/icons-static-svg/icons/openai.svg'
import claude from '@lobehub/icons-static-svg/icons/claude-color.svg'
import gemini from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import pplx from '@lobehub/icons-static-svg/icons/perplexity-color.svg'
import { RIVALS, URLS, type Answer, type Provider, type Session } from './sim'

export const BRAND: Record<Provider, { name: string; logo: string; model: string; ph: string; hello: string }> = {
  gpt: { name: 'ChatGPT', logo: openai, model: '', ph: 'Ask anything', hello: 'What can I help with?' },
  claude: { name: 'Claude', logo: claude, model: '', ph: 'Reply to Claude…', hello: 'How can I help you today?' },
  gemini: { name: 'Gemini', logo: gemini, model: '', ph: 'Ask Gemini', hello: 'Hello, xT' },
  pplx: { name: 'Perplexity', logo: pplx, model: '', ph: 'Ask a follow-up', hello: 'Where knowledge begins' },
}
export const Logo = ({ p, size = 16 }: { p: Provider; size?: number }) => (
  <img src={BRAND[p].logo} alt={BRAND[p].name} width={size} height={size} draggable={false} style={{ width: size, height: size }} />
)

/** reveal the first n characters of a structured answer */
function Reveal({ a, n, live }: { a: Answer; n: number; live: boolean }) {
  let left = n
  const take = (s: string) => { const out = s.slice(0, Math.max(0, left)); left -= s.length; return out }
  const intro = take(a.intro)
  const rows = a.items.map((it) => ({ it, name: take(it.name), reason: take(' · ' + it.reason) }))
  const last = rows.findLastIndex((r) => r.name.length > 0)
  return (
    <>
      <div className={live && last < 0 ? 'caret' : ''}>{intro}</div>
      {rows.map((r, k) => r.name && (
        <div key={k} className={`it ${r.it.me && r.name.length === r.it.name.length ? 'me' : ''}`}>
          <span>{k + 1}.</span>
          <span className={live && k === last ? 'caret' : ''}><b>{r.name}</b>{r.reason}</span>
        </div>
      ))}
    </>
  )
}

/** A faithful miniature of each assistant's web chat. Scales with `fs` (font-size, px). */
export default function Chat({ s, fs = 9 }: { s: Session; fs?: number }) {
  const b = BRAND[s.provider]
  const p = s.provider
  const sent = s.stage === 'think' || s.stage === 'answer' || s.stage === 'done'
  const live = s.stage === 'answer'
  return (
    <div className={`chat ${p}`} style={{ fontSize: fs }}>
      <div className="chrome">
        <i /><i /><i />
        <div className="url"><img src={b.logo} alt="" />{URLS[p]}</div>
        {s.stage === 'done' && (s.mentioned
          ? <span className="verdict yes pop"><Check strokeWidth={3} />Picked #{s.rank}</span>
          : <span className="verdict no pop"><X strokeWidth={3} />Not mentioned</span>)}
      </div>

      {s.stage === 'boot' ? (
        <div className="body">
          <div className="sk" style={{ height: '1.6em', width: '55%', alignSelf: 'flex-end', borderRadius: '1em' }} />
          <div className="sk" style={{ height: '1em', width: '80%' }} />
          <div className="sk" style={{ height: '1em', width: '92%' }} />
          <div className="sk" style={{ height: '1em', width: '64%' }} />
        </div>
      ) : (
        <>
          {p !== 'pplx' && <div className="top">{p === 'gemini' && <img src={b.logo} alt="" />}{b.name}<small>⌄</small></div>}
          <div className="body">
            {!sent ? (
              <div className="hello">{(p === 'claude' || p === 'pplx') && <img src={b.logo} alt="" />}{b.hello}</div>
            ) : (
              <>
                <div className="q">{s.q}</div>
                {p === 'pplx' && (
                  <div className="src">
                    {RIVALS.map((r, k) => s.stage === 'think'
                      ? <div key={k} className="sk" style={{ width: '6.5em', height: '1.6em' }} />
                      : <span key={k}>{r.d}</span>)}
                  </div>
                )}
                {s.stage === 'think' ? (
                  p === 'pplx' ? (
                    <><div className="sk" style={{ height: '.9em', width: '90%' }} /><div className="sk" style={{ height: '.9em', width: '70%' }} /></>
                  ) : (
                    <div className="think">{p === 'gpt' ? <span className="dot" /> : <img className={p === 'claude' ? 'spark' : ''} src={b.logo} alt="" />}</div>
                  )
                ) : (
                  <>
                    {p === 'pplx' && <div className="lbl"><img src={b.logo} alt="" />Answer</div>}
                    <div className="arow">
                      {p === 'gemini' && <img className={live ? 'busy' : ''} src={b.logo} alt="" />}
                      <div className="a"><Reveal a={s.ans} n={s.shown} live={live} /></div>
                    </div>
                    {p === 'claude' && <img className={live ? 'spark' : ''} src={b.logo} alt="" style={{ width: '1.6em', height: '1.6em' }} />}
                  </>
                )}
              </>
            )}
          </div>
          <div className="comp">
            {p !== 'pplx' && <span className="plus"><Plus /></span>}
            <span className={`txt ${s.stage === 'type' ? 'on caret' : ''}`}>{s.stage === 'type' ? s.q.slice(0, s.typed) : b.ph}</span>
            <span className={`send ${s.stage === 'type' ? '' : 'idle'}`}><ArrowUp strokeWidth={2.6} /></span>
          </div>
        </>
      )}
    </div>
  )
}
