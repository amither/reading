import { describe, it, expect } from 'vitest'
import { Segmenter } from '../../src/core/segmenter'

const rate = 16000
const loud = (sec: number) => new Float32Array(Math.round(sec * rate)).fill(0.3)

function feed(seg: Segmenter, totalSec: number): Float32Array[] {
  const out: Float32Array[] = []
  for (let i = 0; i < totalSec; i++) out.push(...seg.push(loud(1)))
  return out
}

describe('Segmenter', () => {
  it('emits nothing before 60 seconds', () => {
    expect(feed(new Segmenter(), 59)).toHaveLength(0)
  })
  it('cuts one segment between 50 and 60 seconds once 60 seconds are buffered', () => {
    const segs = feed(new Segmenter(), 60)
    expect(segs).toHaveLength(1)
    expect(segs[0].length).toBeGreaterThanOrEqual(50 * rate)
    expect(segs[0].length).toBeLessThanOrEqual(60 * rate)
  })
  it('cuts at the quiet spot', () => {
    const s = loud(60)
    s.fill(0, 55.3 * rate, 55.7 * rate)
    const segs = new Segmenter().push(s)
    expect(segs).toHaveLength(1)
    expect(segs[0].length).toBeGreaterThan(55.3 * rate)
    expect(segs[0].length).toBeLessThan(55.7 * rate)
  })
  it('loses no samples across segments and the final flush', () => {
    const seg = new Segmenter()
    const segs = feed(seg, 130)
    const tail = seg.flush()
    const total = segs.reduce((n, s) => n + s.length, 0) + (tail?.length ?? 0)
    expect(segs).toHaveLength(2)
    expect(total).toBe(130 * rate)
  })
  it('drops a tail shorter than half a second', () => {
    const seg = new Segmenter()
    seg.push(loud(0.2))
    expect(seg.flush()).toBeNull()
  })
  it('reset discards buffered audio', () => {
    const seg = new Segmenter()
    seg.push(loud(30))
    seg.reset()
    expect(seg.flush()).toBeNull()
  })
})
