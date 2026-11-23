import { describe, it, expect } from 'vitest'
import { LiveAsr } from '../../src/services/liveAsr'

const rate = 16000
const pcm = (sec: number) => new Float32Array(Math.round(sec * rate)).fill(0.3)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function pushSeconds(live: LiveAsr, sec: number) {
  for (let i = 0; i < sec; i++) live.push(pcm(1))
}

describe('LiveAsr', () => {
  it('sends segments while audio is still arriving and joins texts in order', async () => {
    let n = 0
    const f = (async () => json({ text: `seg${++n}` })) as unknown as typeof fetch
    const live = new LiveAsr('k', f, 0)
    pushSeconds(live, 130)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 10))
    expect(n).toBe(2) // 录音期间已发出两段
    expect(await live.finish()).toBe('seg1 seg2 seg3')
  })
  it('skips a segment that keeps failing but keeps the others', async () => {
    const replies = [500, 500, 500, 200]
    let calls = 0
    const f = (async () => {
      const status = replies[calls++] ?? 200
      return status === 200 ? json({ text: 'tail' }) : json({}, status)
    }) as unknown as typeof fetch
    const live = new LiveAsr('k', f, 0)
    pushSeconds(live, 70)
    expect(await live.finish()).toBe('tail')
    expect(calls).toBe(4)
  })
  it('does not retry auth errors', async () => {
    let calls = 0
    const f = (async () => { calls++; return json({}, 401) }) as unknown as typeof fetch
    const live = new LiveAsr('k', f, 0)
    pushSeconds(live, 70)
    expect(await live.finish()).toBe('')
    expect(calls).toBe(2) // 一段 + 尾段，各只请求一次
  })
  it('discard stops further requests', async () => {
    let calls = 0
    const f = (async () => { calls++; return json({ text: 'x' }) }) as unknown as typeof fetch
    const live = new LiveAsr('k', f, 0)
    pushSeconds(live, 70)
    live.discard()
    await new Promise((r) => setTimeout(r, 10))
    expect(calls).toBe(0)
  })
})
