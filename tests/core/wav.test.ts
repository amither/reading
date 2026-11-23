import { describe, it, expect } from 'vitest'
import { Resampler, encodeWav, findQuietCut } from '../../src/core/wav'

describe('Resampler', () => {
  it('48k -> 16k keeps a constant signal and divides the length by 3', () => {
    const out = new Resampler(48000, 16000).process(new Float32Array(4800).fill(0.5))
    expect(out.length).toBe(1600)
    expect([...out].every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true)
  })
  it('gives the same output no matter how the input is chunked (48k -> 16k)', () => {
    const input = Float32Array.from({ length: 9999 }, (_, i) => Math.sin(i / 7))
    const whole = new Resampler(48000, 16000).process(input)
    const r = new Resampler(48000, 16000)
    const parts = [r.process(input.slice(0, 1000)), r.process(input.slice(1000, 1001)), r.process(input.slice(1001, 5000)), r.process(input.slice(5000))]
    const joined = parts.flatMap((p) => [...p])
    expect(joined.length).toBe(whole.length)
    expect(joined).toEqual([...whole])
  })
  it('44.1k -> 16k gives about one second of output per second of input', () => {
    const out = new Resampler(44100, 16000).process(new Float32Array(44100).fill(0.25))
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1)
    expect([...out].every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true)
  })
})

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header and clips samples', () => {
    const wav = encodeWav(Float32Array.from([1, -1, 0, 2]), 16000)
    const v = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(8)
    expect(wav.length).toBe(52)
    expect([44, 46, 48, 50].map((o) => v.getInt16(o, true))).toEqual([32767, -32768, 0, 32767])
  })
})

describe('findQuietCut', () => {
  const rate = 16000
  it('picks the quietest window inside the range', () => {
    const s = new Float32Array(60 * rate).fill(0.5)
    s.fill(0, 54.8 * rate, 55.2 * rate)
    const cut = findQuietCut(s, rate, 50, 60)
    expect(cut).toBeGreaterThan(54.8 * rate)
    expect(cut).toBeLessThan(55.2 * rate)
  })
  it('returns the buffer length when the buffer is shorter than the range', () => {
    const s = new Float32Array(10 * rate)
    expect(findQuietCut(s, rate, 50, 60)).toBe(s.length)
  })
})
