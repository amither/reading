import { findQuietCut } from './wav'

export const SEGMENT_MIN_SEC = 50
export const SEGMENT_MAX_SEC = 60
const MIN_FLUSH_SEC = 0.5

/** 把连续的 PCM 流按约 60 秒切段，切点选在第 50~60 秒里最安静的位置 */
export class Segmenter {
  private chunks: Float32Array[] = []
  private length = 0

  constructor(
    private readonly rate = 16000,
    private readonly minSec = SEGMENT_MIN_SEC,
    private readonly maxSec = SEGMENT_MAX_SEC,
  ) {}

  /** 压入 PCM，返回此刻已切好的整段 */
  push(chunk: Float32Array): Float32Array[] {
    this.chunks.push(chunk)
    this.length += chunk.length
    const out: Float32Array[] = []
    while (this.length >= this.maxSec * this.rate) {
      const all = this.concat()
      const cut = findQuietCut(all, this.rate, this.minSec, this.maxSec)
      out.push(all.slice(0, cut))
      const rest = all.slice(cut)
      this.chunks = rest.length ? [rest] : []
      this.length = rest.length
    }
    return out
  }

  /** 读完后取走剩余音频；短于 0.5 秒则丢弃 */
  flush(): Float32Array | null {
    const all = this.concat()
    this.reset()
    return all.length >= MIN_FLUSH_SEC * this.rate ? all : null
  }

  reset() {
    this.chunks = []
    this.length = 0
  }

  private concat(): Float32Array {
    const all = new Float32Array(this.length)
    let o = 0
    for (const c of this.chunks) {
      all.set(c, o)
      o += c.length
    }
    return all
  }
}
