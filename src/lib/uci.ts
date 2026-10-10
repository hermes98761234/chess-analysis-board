/** UCI `info` parsing and score helpers. Pure. */

export interface Info {
  depth: number
  multipv: number
  /** Centipawns from the side to move's view (undefined when mate is set). */
  cp?: number
  /** Moves to mate from the side to move's view; negative = being mated. */
  mate?: number
  nodes?: number
  nps?: number
  pv: string[]
}

export function parseInfo(line: string): Info | null {
  if (!line.startsWith('info ') || !line.includes(' score ') || !/ pv /.test(line)) return null
  const tok = line.trim().split(/\s+/)
  const info: Info = { depth: 0, multipv: 1, pv: [] }
  for (let i = 1; i < tok.length; i++) {
    switch (tok[i]) {
      case 'depth': info.depth = +tok[++i]; break
      case 'multipv': info.multipv = +tok[++i]; break
      case 'nodes': info.nodes = +tok[++i]; break
      case 'nps': info.nps = +tok[++i]; break
      case 'score': {
        const kind = tok[++i]
        const val = +tok[++i]
        if (kind === 'cp') info.cp = val
        else if (kind === 'mate') info.mate = val
        break
      }
      case 'pv': info.pv = tok.slice(i + 1); i = tok.length; break
      default: break
    }
  }
  if (info.cp === undefined && info.mate === undefined) return null
  return info
}

export interface Score { cp?: number; mate?: number }

/** Converts a side-to-move score to White's point of view. */
export function whiteScore(s: Score, turn: 'w' | 'b'): Score {
  const k = turn === 'w' ? 1 : -1
  return s.mate !== undefined ? { mate: s.mate * k } : { cp: (s.cp ?? 0) * k }
}

/** "+0.35", "-1.20", "M3", "-M5". */
export function formatScore(s: Score): string {
  if (s.mate !== undefined) return s.mate === 0 ? '#' : `${s.mate < 0 ? '-' : ''}M${Math.abs(s.mate)}`
  const v = (s.cp ?? 0) / 100
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

/** White's share of the eval bar, 0..1 (Lichess win-probability curve). */
export function barFraction(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 1 : s.mate < 0 ? 0 : 0.5
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0))
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

export function uciMove(u: string): { from: string; to: string; promotion?: string } | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(u)
  return m ? { from: m[1], to: m[2], promotion: m[3] } : null
}
