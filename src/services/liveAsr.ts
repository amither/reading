import { Segmenter } from '../core/segmenter'
import { encodeWav } from '../core/wav'
import { ApiError, transcribeWav } from './deepseek'

const RATE = 16000
const ATTEMPTS = 3
const NO_RETRY = new Set([400, 401, 402, 413])

async function withRetry<T>(fn: () => Promise<T>, delayMs: number): Promise<T> {
  let last: unknown
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (e instanceof ApiError && NO_RETRY.has(e.status)) break
      if (i < ATTEMPTS - 1 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw last
}

/** 边录边识别：喂入 16kHz 单声道 PCM，每约 60 秒切一段并按顺序送去识别 */
export class LiveAsr {
  private seg = new Segmenter(RATE)
  private texts: string[] = []
  private chain: Promise<void> = Promise.resolve()
  private index = 0
  private cancelled = false

  constructor(
    private readonly key: string,
    private readonly f: typeof fetch = fetch,
    private readonly retryDelayMs = 800,
  ) {}

  push(pcm: Float32Array) {
    for (const s of this.seg.push(pcm)) this.enqueue(s)
  }

  /** 读完：把尾段送出，等全部识别完，返回按顺序拼好的文字 */
  async finish(): Promise<string> {
    const tail = this.seg.flush()
    if (tail) this.enqueue(tail)
    await this.chain
    return this.texts.filter(Boolean).join(' ')
  }

  /** 重录或放弃：丢掉缓冲，不再发起新请求 */
  discard() {
    this.cancelled = true
    this.seg.reset()
  }

  private enqueue(pcm: Float32Array) {
    const i = this.index++
    const wav = encodeWav(pcm, RATE)
    this.chain = this.chain.then(async () => {
      if (this.cancelled) return
      try {
        this.texts[i] = await withRetry(() => transcribeWav(wav, this.key, this.f), this.retryDelayMs)
      } catch {
        this.texts[i] = ''
      }
    })
  }
}
