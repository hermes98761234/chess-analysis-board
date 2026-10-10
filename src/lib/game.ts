import { Chess } from 'chess.js'
import { uciMove } from './uci'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface Node { san: string; uci: string; fen: string }
export interface Game { startFen: string; moves: Node[]; headers: Record<string, string> }

export function validFen(fen: string): boolean {
  try { new Chess(fen.trim()); return true } catch { return false }
}

export function newGame(startFen: string = START_FEN): Game {
  return { startFen, moves: [], headers: {} }
}

/** Position after `ply` half-moves (0 = start). */
export const fenAt = (g: Game, ply: number): string => (ply <= 0 || !g.moves.length ? g.startFen : g.moves[Math.min(ply, g.moves.length) - 1].fen)

/** Parses a PGN (with optional FEN header) or a bare FEN. */
export function importText(text: string): Game {
  const src = text.trim()
  if (!src) throw new Error('Nothing to import')
  if (!src.includes('[') && src.split('/').length === 8 && !/\d\.\s/.test(src)) {
    const c = new Chess(src) // throws on invalid FEN
    return newGame(c.fen())
  }
  const c = new Chess()
  c.loadPgn(src)
  const headers = c.getHeaders() as Record<string, string>
  const verbose = c.history({ verbose: true })
  const startFen = headers.FEN && headers.SetUp !== '0' ? headers.FEN : START_FEN
  return {
    startFen,
    headers,
    moves: verbose.map((m) => ({ san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fen: m.after })),
  }
}

export function toPgn(g: Game): string {
  const c = new Chess(g.startFen)
  for (const m of g.moves) c.move(m.san)
  for (const [k, v] of Object.entries(g.headers)) c.setHeader(k, v)
  if (g.startFen !== START_FEN) { c.setHeader('SetUp', '1'); c.setHeader('FEN', g.startFen) }
  return c.pgn()
}

export interface Played { game: Game; ply: number }

/** Plays a move at `ply`. If it matches the next recorded move it just advances; otherwise the line is cut and replaced. */
export function playMove(g: Game, ply: number, move: { from: string; to: string; promotion?: string }): Played | null {
  const c = new Chess(fenAt(g, ply))
  let m
  try { m = c.move(move) } catch { return null }
  const uci = m.from + m.to + (m.promotion ?? '')
  const next = g.moves[ply]
  if (next && next.uci === uci) return { game: g, ply: ply + 1 }
  const moves = [...g.moves.slice(0, ply), { san: m.san, uci, fen: c.fen() }]
  return { game: { ...g, moves }, ply: ply + 1 }
}

export function legalTargets(fen: string, from: string): { to: string; promotion: boolean }[] {
  const c = new Chess(fen)
  return (c.moves({ square: from as never, verbose: true }) as { to: string; promotion?: string }[]).map((m) => ({ to: m.to, promotion: !!m.promotion }))
}

export interface Status { over: boolean; text: 'Checkmate' | 'Stalemate' | 'Draw' | 'Check' | null }
export function statusOf(fen: string): Status {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { over: true, text: 'Checkmate' }
  if (c.isStalemate()) return { over: true, text: 'Stalemate' }
  if (c.isDraw()) return { over: true, text: 'Draw' }
  return { over: false, text: c.isCheck() ? 'Check' : null }
}

export const turnOf = (fen: string): 'w' | 'b' => (fen.split(' ')[1] === 'b' ? 'b' : 'w')

/** Converts a UCI principal variation to SAN, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[], max = 10): string[] {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of pv.slice(0, max)) {
    const m = uciMove(u)
    if (!m) break
    try { out.push(c.move(m).san) } catch { break }
  }
  return out
}

/** Prefixes SAN moves with move numbers: "12. Nf3 Nc6 13. Bb5". */
export function numbered(fen: string, sans: string[]): string {
  const parts = fen.split(' ')
  let n = +parts[5] || 1
  let white = parts[1] !== 'b'
  const out: string[] = []
  sans.forEach((s, i) => {
    if (white) out.push(`${n}.`)
    else if (i === 0) out.push(`${n}...`)
    out.push(s)
    if (!white) n++
    white = !white
  })
  return out.join(' ')
}

export type Piece = { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'; color: 'w' | 'b' }
/** 64 squares, a8 first (rank 8 → 1, file a → h). */
export function boardOf(fen: string): (Piece | null)[] {
  return new Chess(fen).board().flat() as (Piece | null)[]
}
export const sqName = (idx: number) => 'abcdefgh'[idx % 8] + (8 - Math.floor(idx / 8))
export const sqIndex = (sq: string) => (8 - +sq[1]) * 8 + 'abcdefgh'.indexOf(sq[0])
export function kingInCheck(fen: string): string | null {
  const c = new Chess(fen)
  if (!c.isCheck()) return null
  const t = c.turn()
  const b = boardOf(fen)
  const i = b.findIndex((p) => p && p.type === 'k' && p.color === t)
  return i < 0 ? null : sqName(i)
}

export const SAMPLE_PGN = `[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke of Brunswick and Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`
