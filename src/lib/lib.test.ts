import { describe, expect, it } from 'vitest'
import { barFraction, formatScore, parseInfo, uciMove, whiteScore } from './uci'
import { SAMPLE_PGN, START_FEN, fenAt, importText, kingInCheck, legalTargets, newGame, numbered, playMove, pvToSan, statusOf, toPgn, validFen, boardOf, sqName, sqIndex } from './game'

describe('uci', () => {
  it('parses an info line', () => {
    const i = parseInfo('info depth 18 seldepth 25 multipv 2 score cp -35 nodes 123456 nps 800000 time 154 pv e7e5 g1f3 b8c6')!
    expect(i).toMatchObject({ depth: 18, multipv: 2, cp: -35, nodes: 123456, nps: 800000 })
    expect(i.pv).toEqual(['e7e5', 'g1f3', 'b8c6'])
  })
  it('parses mate scores and ignores bounds-less noise', () => {
    expect(parseInfo('info depth 5 multipv 1 score mate -3 pv a1a2')!.mate).toBe(-3)
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeNull()
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull()
  })
  it('flips scores to white perspective', () => {
    expect(whiteScore({ cp: 50 }, 'b')).toEqual({ cp: -50 })
    expect(whiteScore({ mate: 2 }, 'b')).toEqual({ mate: -2 })
    expect(whiteScore({ cp: 50 }, 'w')).toEqual({ cp: 50 })
  })
  it('formats scores', () => {
    expect(formatScore({ cp: 35 })).toBe('+0.35')
    expect(formatScore({ cp: -120 })).toBe('-1.20')
    expect(formatScore({ cp: 0 })).toBe('0.00')
    expect(formatScore({ mate: 3 })).toBe('M3')
    expect(formatScore({ mate: -5 })).toBe('-M5')
  })
  it('maps eval to the bar', () => {
    expect(barFraction({ cp: 0 })).toBeCloseTo(0.5, 6)
    expect(barFraction({ cp: 100 })).toBeCloseTo(0.591, 2)
    expect(barFraction({ cp: -100 })).toBeCloseTo(0.409, 2)
    expect(barFraction({ mate: 4 })).toBe(1)
    expect(barFraction({ mate: -1 })).toBe(0)
  })
  it('parses uci moves', () => {
    expect(uciMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
    expect(uciMove('zz')).toBeNull()
  })
})

describe('game', () => {
  it('validates FEN', () => {
    expect(validFen(START_FEN)).toBe(true)
    expect(validFen('nonsense')).toBe(false)
  })
  it('lists the 20 legal first moves', () => {
    expect(legalTargets(START_FEN, 'e2').map((m) => m.to).sort()).toEqual(['e3', 'e4'])
    expect(legalTargets(START_FEN, 'g1').map((m) => m.to).sort()).toEqual(['f3', 'h3'])
    expect(legalTargets(START_FEN, 'e1')).toEqual([])
  })
  it('imports the Opera Game PGN', () => {
    const g = importText(SAMPLE_PGN)
    expect(g.moves).toHaveLength(33)
    expect(g.moves.at(-1)!.san).toBe('Rd8#')
    expect(g.headers.White).toBe('Paul Morphy')
    expect(statusOf(g.moves.at(-1)!.fen)).toEqual({ over: true, text: 'Checkmate' })
  })
  it('imports a bare FEN and rejects junk', () => {
    const g = importText('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')
    expect(g.moves).toHaveLength(0)
    expect(g.startFen).toContain('4k3/8')
    expect(() => importText('hello')).toThrow()
  })
  it('round-trips PGN', () => {
    const g = importText(SAMPLE_PGN)
    const again = importText(toPgn(g))
    expect(again.moves.map((m) => m.san)).toEqual(g.moves.map((m) => m.san))
  })
  it('plays, advances along the line and branches', () => {
    let g = newGame()
    let r = playMove(g, 0, { from: 'e2', to: 'e4' })!
    g = r.game
    r = playMove(g, r.ply, { from: 'e7', to: 'e5' })!
    g = r.game
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
    const same = playMove(g, 0, { from: 'e2', to: 'e4' })!
    expect(same.game).toBe(g)
    expect(same.ply).toBe(1)
    const branch = playMove(g, 1, { from: 'c7', to: 'c5' })!
    expect(branch.game.moves.map((m) => m.san)).toEqual(['e4', 'c5'])
    expect(playMove(g, 0, { from: 'e2', to: 'e5' })).toBeNull()
  })
  it('detects check and finds the king', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    expect(kingInCheck(fen)).toBe('e1')
    expect(statusOf(fen).over).toBe(true) // fool's mate
  })
  it('converts a PV to numbered SAN', () => {
    const sans = pvToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'zzzz'])
    expect(sans).toEqual(['e4', 'e5', 'Nf3'])
    expect(numbered(START_FEN, sans)).toBe('1. e4 e5 2. Nf3')
    expect(numbered('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', ['e5'])).toBe('1... e5')
  })
  it('indexes squares', () => {
    expect(sqName(0)).toBe('a8')
    expect(sqName(63)).toBe('h1')
    expect(sqIndex('e2')).toBe(52)
    expect(boardOf(START_FEN)[sqIndex('e1')]).toEqual({ square: 'e1', type: 'k', color: 'w' })
    expect(fenAt(newGame(), 5)).toBe(START_FEN)
  })
})
