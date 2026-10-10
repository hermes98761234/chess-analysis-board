import { useMemo, useState } from 'react'
import { boardOf, kingInCheck, legalTargets, sqIndex, sqName, type Piece } from './lib/game'
import type { T } from './i18n'

const GLYPH: Record<Piece['type'], string> = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' }
const PROMO: Piece['type'][] = ['q', 'r', 'b', 'n']
const PROMO_NAME: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }

export interface BoardProps {
  fen: string
  flipped: boolean
  lastMove: { from: string; to: string } | null
  arrow: { from: string; to: string } | null
  disabled: boolean
  onMove: (m: { from: string; to: string; promotion?: string }) => void
  t: T
}

export default function Board({ fen, flipped, lastMove, arrow, disabled, onMove, t }: BoardProps) {
  const [sel, setSel] = useState<string | null>(null)
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const [selFen, setSelFen] = useState(fen)
  if (selFen !== fen) { setSelFen(fen); setSel(null); setPromo(null) }

  const board = useMemo(() => boardOf(fen), [fen])
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w'
  const checkSq = useMemo(() => kingInCheck(fen), [fen])
  const targets = useMemo(() => (sel ? legalTargets(fen, sel) : []), [fen, sel])

  const click = (sq: string) => {
    if (disabled) return
    const piece = board[sqIndex(sq)]
    const target = targets.find((m) => m.to === sq)
    if (sel && target) {
      if (target.promotion) setPromo({ from: sel, to: sq })
      else onMove({ from: sel, to: sq })
      setSel(null)
    } else if (piece && piece.color === turn && sq !== sel) setSel(sq)
    else setSel(null)
  }

  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i))
  const center = (sq: string) => {
    const i = sqIndex(sq)
    const x = flipped ? 7 - (i % 8) : i % 8
    const y = flipped ? 7 - Math.floor(i / 8) : Math.floor(i / 8)
    return [x * 12.5 + 6.25, y * 12.5 + 6.25]
  }

  return (
    <div className="cboard" role="grid" aria-label="Chess board">
      {order.map((idx, k) => {
        const sq = sqName(idx)
        const p = board[idx]
        const dark = (Math.floor(idx / 8) + (idx % 8)) % 2 === 1
        const cls = ['sq']
        if (dark) cls.push('dark')
        if (lastMove && (lastMove.from === sq || lastMove.to === sq)) cls.push('last')
        if (sel === sq) cls.push('sel')
        if (checkSq === sq) cls.push('check')
        const tg = targets.find((m) => m.to === sq)
        return (
          <button key={sq} className={cls.join(' ')} onClick={() => click(sq)} aria-label={`${sq}${p ? ` ${p.color === 'w' ? 'white' : 'black'} ${p.type}` : ''}`}>
            {k % 8 === 0 && <span className="coord r">{sq[1]}</span>}
            {k >= 56 && <span className="coord f">{sq[0]}</span>}
            {p && <span className={`pc ${p.color}`}>{GLYPH[p.type]}</span>}
            {tg && (p ? <span className="ring" /> : <span className="dot" />)}
          </button>
        )
      })}
      {arrow && (
        <svg className="arrows" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <marker id="ah" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0 0L4 2L0 4z" fill="rgba(30,140,60,0.85)" /></marker>
          </defs>
          {(() => {
            const [x1, y1] = center(arrow.from)
            const [x2, y2] = center(arrow.to)
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(30,140,60,0.8)" strokeWidth="2.4" strokeLinecap="round" markerEnd="url(#ah)" />
          })()}
        </svg>
      )}
      {promo && (
        <div className="promo">
          <div className="box">
            <strong style={{ color: '#fff', width: '100%', textAlign: 'center' }}>{t('Promote')}</strong>
            {PROMO.map((pt) => (
              <button key={pt} title={t(PROMO_NAME[pt])} onClick={() => { onMove({ ...promo, promotion: pt }); setPromo(null) }}>
                <span className={`pc ${turn}`}>{GLYPH[pt]}</span>
              </button>
            ))}
            <button onClick={() => setPromo(null)}>{t('Cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
