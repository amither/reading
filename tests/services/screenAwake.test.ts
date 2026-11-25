import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ScreenAwake } from '../../src/services/screenAwake'

class FakeSentinel {
  released = false
  private listeners: (() => void)[] = []
  addEventListener(_t: 'release', f: () => void) {
    this.listeners.push(f)
  }
  async release() {
    if (this.released) return
    this.released = true
    this.listeners.forEach((f) => f())
  }
}

let requests: FakeSentinel[]
let visibility: 'visible' | 'hidden'
let docListeners: Record<string, (() => void)[]>

function fireVisibility(state: 'visible' | 'hidden') {
  visibility = state
  ;(docListeners.visibilitychange ?? []).forEach((f) => f())
}

beforeEach(() => {
  requests = []
  visibility = 'visible'
  docListeners = {}
  vi.stubGlobal('navigator', {
    wakeLock: {
      request: async () => {
        const s = new FakeSentinel()
        requests.push(s)
        return s
      },
    },
  })
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility
    },
    addEventListener: (t: string, f: () => void) => (docListeners[t] ??= []).push(f),
    removeEventListener: (t: string, f: () => void) => {
      docListeners[t] = (docListeners[t] ?? []).filter((g) => g !== f)
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('ScreenAwake', () => {
  it('acquires the lock and reports it', async () => {
    const a = new ScreenAwake()
    const states: boolean[] = []
    a.onChange = (s) => states.push(s)
    await a.acquire()
    expect(a.active).toBe(true)
    expect(requests).toHaveLength(1)
    expect(states).toEqual([true])
  })

  it('re-acquires after the browser releases it when the page is backgrounded', async () => {
    const a = new ScreenAwake()
    const states: boolean[] = []
    a.onChange = (s) => states.push(s)
    await a.acquire()
    // 切到后台：浏览器自动释放常亮锁
    fireVisibility('hidden')
    await requests[0].release()
    expect(a.active).toBe(false)
    // 回到前台：自动重新申请
    fireVisibility('visible')
    await flush()
    expect(requests).toHaveLength(2)
    expect(a.active).toBe(true)
    expect(states).toEqual([true, false, true])
  })

  it('does not request while hidden, only once visible again', async () => {
    const a = new ScreenAwake()
    await a.acquire()
    await requests[0].release()
    fireVisibility('hidden')
    await flush()
    expect(requests).toHaveLength(1)
  })

  it('stops re-acquiring after release()', async () => {
    const a = new ScreenAwake()
    await a.acquire()
    a.release()
    expect(requests[0].released).toBe(true)
    expect(a.active).toBe(false)
    fireVisibility('hidden')
    fireVisibility('visible')
    await flush()
    expect(requests).toHaveLength(1)
  })

  it('releases a lock that arrives after recording already ended', async () => {
    let resolve!: (s: FakeSentinel) => void
    ;(navigator as any).wakeLock.request = () => new Promise<FakeSentinel>((r) => (resolve = r))
    const a = new ScreenAwake()
    const p = a.acquire()
    a.release()
    const late = new FakeSentinel()
    resolve(late)
    await p
    expect(late.released).toBe(true)
    expect(a.active).toBe(false)
  })

  it('reports false when the browser has no wake lock support', async () => {
    vi.stubGlobal('navigator', {})
    const a = new ScreenAwake()
    const states: boolean[] = []
    a.onChange = (s) => states.push(s)
    await a.acquire()
    expect(ScreenAwake.supported).toBe(false)
    expect(states).toEqual([false])
  })

  it('reports false when the request is rejected', async () => {
    ;(navigator as any).wakeLock.request = async () => {
      throw new Error('NotAllowedError')
    }
    const a = new ScreenAwake()
    const states: boolean[] = []
    a.onChange = (s) => states.push(s)
    await a.acquire()
    expect(states).toEqual([false])
  })
})
