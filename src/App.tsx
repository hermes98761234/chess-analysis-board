import { useEffect, useMemo, useRef, useState } from 'react'
import { Footer, Header, useShell, usePersisted } from './shell'
import { UK } from './uk'
import Board from './Board'
import { Engine } from './lib/engine'
import { SAMPLE_PGN, fenAt, importText, newGame, numbered, playMove, pvToSan, statusOf, toPgn, turnOf, type Game } from './lib/game'
import { barFraction, formatScore, uciMove, whiteScore, type Info } from './lib/uci'

const ENGINE_URL = new URL(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`, document.baseURI).href

interface Prefs { engineOn: boolean; lines: number; depth: number; flipped: boolean }
type Lines = Record<number, Info>

export default function App() {
  const shell = useShell('chess-analysis-board', UK)
  const { t } = shell
  const [prefs, setPrefs] = usePersisted<Prefs>('chess-analysis-board:prefs', { engineOn: true, lines: 3, depth: 16, flipped: false })
  const [game, setGame] = useState<Game>(() => importText(SAMPLE_PGN))
  const [ply, setPly] = useState(21)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [lines, setLines] = useState<{ key: string; byPv: Lines }>({ key: '', byPv: {} })
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [engineErr, setEngineErr] = useState('')
  const [done, setDone] = useState(false)
  const engine = useRef<Engine | null>(null)

  const fen = fenAt(game, ply)
  const status = useMemo(() => statusOf(fen), [fen])
  const turn = turnOf(fen)
  const reqKey = `${fen}|${prefs.lines}|${prefs.depth}`

  // engine lifecycle
  useEffect(() => {
    if (!prefs.engineOn) return
    const e = new Engine(ENGINE_URL)
    engine.current = e
    e.onReady = () => setEngineState('ready')
    e.onError = (m) => { setEngineErr(m); setEngineState('error') }
    e.onInfo = (info, r) => {
      const key = `${r.fen}|${r.multipv}|${r.depth}`
      setLines((p) => ({ key, byPv: p.key === key ? { ...p.byPv, [info.multipv]: info } : { [info.multipv]: info } }))
    }
    e.onDone = () => setDone(true)
    return () => { e.terminate(); engine.current = null; setEngineState('loading') }
  }, [prefs.engineOn])

  useEffect(() => {
    const e = engine.current
    if (!prefs.engineOn || engineState !== 'ready' || !e) return
    if (status.over) { e.stop(); return }
    // a fresh request: stale lines are kept on screen until the first new info arrives
    queueMicrotask(() => setDone(false))
    e.analyze({ fen, multipv: prefs.lines, depth: prefs.depth })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, engineState, prefs.engineOn, status.over])

  const current = lines.key === reqKey ? lines.byPv : {}
  const stale = lines.key !== reqKey ? lines.byPv : {}
  const shown: Lines = Object.keys(current).length ? current : stale
  const best = shown[1]
  const evalScore = best && !status.over ? whiteScore({ cp: best.cp, mate: best.mate }, turn) : null
  const bar = status.over ? (status.text === 'Checkmate' ? (turn === 'w' ? 0 : 1) : 0.5) : evalScore ? barFraction(evalScore) : 0.5
  const barLabel = status.over ? (status.text === 'Checkmate' ? (turn === 'w' ? '0-1' : '1-0') : '½') : evalScore ? formatScore(evalScore) : '…'
  const bm = best && !status.over ? uciMove(best.pv[0] ?? '') : null

  const lastMove = ply > 0 ? uciMove(game.moves[ply - 1].uci) : null
  const go = (p: number) => setPly(Math.max(0, Math.min(game.moves.length, p)))

  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
    if (e.key === 'ArrowLeft') { go(ply - 1); e.preventDefault() }
    else if (e.key === 'ArrowRight') { go(ply + 1); e.preventDefault() }
    else if (e.key === 'Home') { go(0); e.preventDefault() }
    else if (e.key === 'End') { go(game.moves.length); e.preventDefault() }
  }
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const play = (m: { from: string; to: string; promotion?: string }) => {
    const r = playMove(game, ply, m)
    if (r) { setGame(r.game); setPly(r.ply) }
  }

  const doImport = () => {
    try {
      const g = importText(text)
      setGame(g); setPly(g.moves.length); setMsg('')
    } catch (e) { setMsg(t('Could not read that: {0}', (e as Error).message)) }
  }
  const copy = async (s: string) => {
    try { await navigator.clipboard.writeText(s); setMsg(t('Copied')) } catch { setText(s) }
    setTimeout(() => setMsg(''), 2000)
  }

  const rows: { n: number; w?: number; b?: number }[] = []
  const startBlack = turnOf(game.startFen) === 'b'
  game.moves.forEach((_, i) => {
    const isBlack = (i % 2 === 1) !== startBlack
    const n = Math.floor((i + (startBlack ? 1 : 0)) / 2) + 1
    if (!isBlack) rows.push({ n, w: i + 1 })
    else if (rows.length && rows.at(-1)!.n === n && rows.at(-1)!.b === undefined && rows.at(-1)!.w !== undefined) rows.at(-1)!.b = i + 1
    else rows.push({ n, b: i + 1 })
  })

  const title = game.headers.White && game.headers.Black ? `${game.headers.White} - ${game.headers.Black}` : ''

  return (
    <div className="app">
      <Header title={t('Chess Analysis Board')} tagline={t('Stockfish in your browser')} shell={shell} />
      <div className="chess-wrap">
        <section>
          <div className="boardrow">
            <div className="evalbar" role="img" aria-label={t('Evaluation: {0}', barLabel)} title={barLabel}>
              <div className="black" style={{ height: `${(1 - bar) * 100}%` }} />
              <div className="white" style={{ height: `${bar * 100}%` }} />
              <span className={evalScore && evalScore.cp !== undefined && evalScore.cp < 0 ? 'top' : 'bot'}>{barLabel}</span>
            </div>
            <Board fen={fen} flipped={prefs.flipped} lastMove={lastMove} arrow={bm && prefs.engineOn ? bm : null} disabled={status.over} onMove={play} t={t} />
          </div>
          <div className="row no-print" style={{ marginTop: 8 }}>
            <button onClick={() => go(0)} disabled={ply === 0} aria-label={t('First')}>⏮</button>
            <button onClick={() => go(ply - 1)} disabled={ply === 0} aria-label={t('Previous')}>◀</button>
            <button onClick={() => go(ply + 1)} disabled={ply >= game.moves.length} aria-label={t('Next')}>▶</button>
            <button onClick={() => go(game.moves.length)} disabled={ply >= game.moves.length} aria-label={t('Last')}>⏭</button>
            <button onClick={() => setPrefs({ ...prefs, flipped: !prefs.flipped })}>{t('Flip')}</button>
            <span className="spacer" />
            <span className="status">{status.text ? t(status.text) : turn === 'w' ? t('White to move') : t('Black to move')}</span>
          </div>
        </section>

        <section>
          <div className="box">
            <h3>{t('Analysis')}</h3>
            <div className="row">
              <label className="inline"><input type="checkbox" checked={prefs.engineOn} onChange={(e) => setPrefs({ ...prefs, engineOn: e.target.checked })} /> {t('Engine on')}</label>
              <label className="inline">{t('Lines')}{' '}
                <select value={prefs.lines} onChange={(e) => setPrefs({ ...prefs, lines: +e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
              </label>
              <label className="inline">{t('Depth')}{' '}
                <select value={prefs.depth} onChange={(e) => setPrefs({ ...prefs, depth: +e.target.value })}>{[8, 12, 16, 20, 24].map((n) => <option key={n}>{n}</option>)}</select>
              </label>
              <span className="spacer" />
              <span className="hint">
                {!prefs.engineOn ? t('Engine is off') : status.over ? t('Game over') : engineState === 'loading' ? t('Loading engine…')
                  : engineState === 'error' ? t('Engine error: {0}', engineErr) : done ? t('Done, depth {0}', best?.depth ?? 0)
                  : t('Analysing… depth {0}/{1}', best?.depth ?? 0, prefs.depth)}
                {best?.nps ? ` · ${Math.round(best.nps / 1000)} ${t('kN/s')}` : ''}
              </span>
            </div>
            <div>
              {Array.from({ length: prefs.lines }, (_, k) => k + 1).map((k) => {
                const info = prefs.engineOn && !status.over ? shown[k] : undefined
                if (!info) return <div key={k} className="line"><span className="sc">·</span><span className="hint">…</span></div>
                const ws = whiteScore({ cp: info.cp, mate: info.mate }, turn)
                const sans = pvToSan(fen, info.pv, 12)
                const white = ws.mate !== undefined ? ws.mate > 0 : (ws.cp ?? 0) >= 0
                return (
                  <button key={k} className="line" title={t('Best move')} onClick={() => { const m = uciMove(info.pv[0]); if (m) play(m) }}>
                    <span className={`sc ${white ? 'pos' : 'neg'}`}>{formatScore(ws)}</span>
                    <span className="mono">{numbered(fen, sans)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="box" style={{ marginTop: 8 }}>
            <h3>{t('Moves')}{title ? ` · ${title}` : ''}</h3>
            <div className="movelist">
              {rows.length === 0 && <span className="hint" style={{ gridColumn: '1 / -1' }}>{t('Play a move on the board.')}</span>}
              {rows.map((r) => (
                <MoveRow key={`${r.n}-${r.w ?? 'b'}`} r={r} game={game} ply={ply} go={go} />
              ))}
            </div>
            <p className="hint">{t('Use the left and right arrow keys to move through the game.')} {t('Playing a different move from an earlier position starts a new line.')}</p>
          </div>

          <div className="box no-print" style={{ marginTop: 8 }}>
            <h3>{t('Import PGN or FEN')}</h3>
            <textarea rows={4} className="mono" value={text} placeholder={t('Paste a PGN or a FEN here')} aria-label={t('Paste a PGN or a FEN here')} onChange={(e) => setText(e.target.value)} />
            <div className="row">
              <button className="primary" onClick={doImport} disabled={!text.trim()}>{t('Import')}</button>
              <button onClick={() => copy(toPgn(game))}>{t('Copy PGN')}</button>
              <button onClick={() => copy(fen)}>{t('Copy FEN')}</button>
              <button onClick={() => { const g = importText(SAMPLE_PGN); setGame(g); setPly(21) }}>{t('Load sample game')}</button>
              <button onClick={() => { setGame(newGame()); setPly(0) }}>{t('New game')}</button>
              {msg && <span className="hint">{msg}</span>}
            </div>
          </div>
        </section>
      </div>
      <Footer repo="chess-analysis-board" note={t('Stockfish 19 (lite, single-threaded WASM, GPL-3.0) runs locally. Nothing is uploaded.')} t={t} />
    </div>
  )
}

function MoveRow({ r, game, ply, go }: { r: { n: number; w?: number; b?: number }; game: Game; ply: number; go: (p: number) => void }) {
  const cell = (p?: number) =>
    p ? <button className={ply === p ? 'cur' : ''} ref={ply === p ? (el) => { const par = el?.parentElement; if (el && par) par.scrollTop = el.offsetTop - par.clientHeight / 2 } : undefined} onClick={() => go(p)}>{game.moves[p - 1].san}</button> : <span />
  return (
    <>
      <span className="n">{r.n}.</span>
      {cell(r.w)}
      {cell(r.b)}
    </>
  )
}
