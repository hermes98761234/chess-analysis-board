import { parseInfo, type Info } from './uci'

export interface Request { fen: string; multipv: number; depth: number }

/** Thin UCI wrapper around the Stockfish worker. Guarantees one `bestmove` per `go`. */
export class Engine {
  private w: Worker
  private ready = false
  private searching = 0
  private queued: Request | null = null
  private current: Request | null = null
  onInfo: (i: Info, req: Request) => void = () => {}
  onDone: (req: Request) => void = () => {}
  onReady: () => void = () => {}
  onError: (msg: string) => void = () => {}

  constructor(url: string) {
    this.w = new Worker(url)
    this.w.onmessage = (e: MessageEvent) => this.line(typeof e.data === 'string' ? e.data : String(e.data))
    this.w.onerror = (e) => this.onError(e.message || 'Engine failed to load')
    this.send('uci')
  }

  private send(cmd: string) { this.w.postMessage(cmd) }

  private line(l: string) {
    if (l === 'uciok') { this.send('isready'); return }
    if (l === 'readyok') {
      if (!this.ready) { this.ready = true; this.onReady() }
      this.pump()
      return
    }
    if (l.startsWith('bestmove')) {
      this.searching = Math.max(0, this.searching - 1)
      if (this.searching === 0 && !this.queued && this.current) this.onDone(this.current)
      this.pump()
      return
    }
    const info = parseInfo(l)
    if (info && this.current && this.searching === 1 && !this.queued) this.onInfo(info, this.current)
  }

  private pump() {
    if (!this.ready || this.searching > 0 || !this.queued) return
    const r = this.queued
    this.queued = null
    this.current = r
    this.send(`setoption name MultiPV value ${r.multipv}`)
    this.send(`position fen ${r.fen}`)
    this.send(`go depth ${r.depth}`)
    this.searching = 1
  }

  analyze(r: Request) {
    this.queued = r
    if (this.searching > 0) this.send('stop')
    else this.pump()
  }

  stop() {
    this.queued = null
    this.current = null
    if (this.searching > 0) this.send('stop')
  }

  terminate() { this.w.terminate() }
}
