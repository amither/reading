/** 有状态降采样器：单声道 Float32 流转成目标采样率（盒式平均），跨块连续 */
export class Resampler {
  private carry = new Float32Array(0)
  private pos = 0
  private readonly ratio: number

  constructor(inRate: number, outRate: number) {
    this.ratio = inRate / outRate
  }

  process(chunk: Float32Array): Float32Array {
    const buf = new Float32Array(this.carry.length + chunk.length)
    buf.set(this.carry)
    buf.set(chunk, this.carry.length)
    const out: number[] = []
    let pos = this.pos
    while (pos + this.ratio <= buf.length) {
      const start = Math.floor(pos)
      const end = Math.max(start + 1, Math.floor(pos + this.ratio))
      let sum = 0
      for (let i = start; i < end; i++) sum += buf[i]
      out.push(sum / (end - start))
      pos += this.ratio
    }
    const drop = Math.min(Math.floor(pos), buf.length)
    this.carry = buf.slice(drop)
    this.pos = pos - drop
    return Float32Array.from(out)
  }
}

/** 单声道 16-bit PCM WAV */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(out.buffer)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // 单声道
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return out
}

/** 在 [fromSec, toSec] 内找能量最小的 windowMs 窗口，返回窗口中心的采样下标 */
export function findQuietCut(samples: Float32Array, sampleRate: number, fromSec: number, toSec: number, windowMs = 200): number {
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000))
  const lo = Math.min(Math.round(fromSec * sampleRate), Math.max(0, samples.length - win))
  const hi = Math.min(Math.round(toSec * sampleRate), samples.length) - win
  if (hi <= lo) return Math.min(Math.round(toSec * sampleRate), samples.length)
  const step = Math.max(1, Math.round(win / 4))
  let best = lo
  let bestEnergy = Infinity
  for (let s = lo; s <= hi; s += step) {
    let e = 0
    for (let i = s; i < s + win; i++) e += samples[i] * samples[i]
    if (e < bestEnergy) {
      bestEnergy = e
      best = s
    }
  }
  return best + (win >> 1)
}
