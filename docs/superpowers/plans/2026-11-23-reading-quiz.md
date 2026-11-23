# 阅读小测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 孩子朗读时边录边把音频分段送 DeepSeek 识别，提交后用识别文字出最多 3 道选择题，孩子点选作答。

**Architecture:** 录音时用 AudioWorklet 旁路取 PCM，降到 16kHz，每约 60 秒在静音处切段、编码 WAV、顺序调用 DeepSeek ASR。读完后拼接文字，调用 `deepseek-flash`（关闭思考、JSON 输出）出题，结果写回打卡记录。所有纯逻辑放 `src/core/`，网络调用放 `src/services/`，均可用假 `fetch` 测试。

**Tech Stack:** 沿用现有栈（Vue 3、TypeScript、Vite、Vitest、fake-indexeddb）。不新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-23-reading-quiz-design.md`

**Branch:** `feat/quiz`（已创建）。

---

## File Structure

```
src/types.ts                       修改：Checkin 增加 transcript/quiz，新增 QuizQuestion/QuizData
src/core/wav.ts                    新增：Resampler、encodeWav、findQuietCut
src/core/segmenter.ts              新增：Segmenter（按 60 秒在静音处切段）
src/core/quiz.ts                   新增：enoughText、parseQuiz、shuffleQuestion、quizScore、buildMessages
src/services/deepseek.ts           新增：transcribeWav、chatJson、generateQuiz、checkKey、ApiError
src/services/liveAsr.ts            新增：LiveAsr（边录边识别）
src/services/pcmTap.ts             新增：PcmTap（AudioWorklet 取 PCM）
src/services/recorder.ts           修改：接入 PcmTap
src/storage/repo.ts                修改：putCheckin、loadApiKey、saveApiKey
src/store.ts                       修改：apiKey、quizJobs、runQuiz、answerQuiz
src/views/Record.vue               修改：接入 LiveAsr，提交后进入答题页
src/views/Quiz.vue                 新增：答题页
src/views/CheckinRecord.vue        修改：显示答题结果
src/views/Settings.vue             修改：DeepSeek 密钥
src/router.ts                      修改：答题页路由
tests/core/wav.test.ts, segmenter.test.ts, quiz.test.ts
tests/services/deepseek.test.ts, liveAsr.test.ts
tests/store/quiz.test.ts
tests/storage/backup.test.ts       修改：增加“备份不含密钥”
```

---

### Task 1: 类型与 WAV 工具（core/wav）

**Files:**
- Modify: `src/types.ts`
- Create: `src/core/wav.ts`
- Test: `tests/core/wav.test.ts`

- [ ] **Step 1: 扩展类型**

在 `src/types.ts` 中，把 `Checkin` 接口改为：

```ts
export interface Checkin {
  taskId: TaskId
  date: string // YYYY-MM-DD，本地时区
  submittedAt: number // 真实提交时间戳
  isMakeup: boolean
  durationSec: number
  audioId: string
  transcript?: string // 语音识别出的全文
  quiz?: QuizData
}
```

并在文件末尾追加：

```ts
export interface QuizQuestion {
  q: string
  options: string[] // 恰好 3 个
  answer: number // 0..2
  explain: string
}

export interface QuizData {
  questions: QuizQuestion[]
  picks: (number | null)[] // 与 questions 等长，未答为 null
}
```

- [ ] **Step 2: 写失败的测试**

`tests/core/wav.test.ts`:
```ts
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
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/core/wav.test.ts`
Expected: FAIL，找不到 `src/core/wav`。

- [ ] **Step 4: 实现**

`src/core/wav.ts`:
```ts
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
```

- [ ] **Step 5: 运行确认通过，并类型检查**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: 全部 PASS，无类型错误。

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/core/wav.ts tests/core/wav.test.ts
git commit -m "feat(core): wav encoding, resampler and quiet-cut finder

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 分段器与出题逻辑（core/segmenter, core/quiz）

**Files:**
- Create: `src/core/segmenter.ts`, `src/core/quiz.ts`
- Test: `tests/core/segmenter.test.ts`, `tests/core/quiz.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/core/segmenter.test.ts`:
```ts
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
```

`tests/core/quiz.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildMessages, enoughText, parseQuiz, quizScore, shuffleQuestion } from '../../src/core/quiz'
import type { QuizQuestion } from '../../src/types'

const good = { q: '小兔子喜欢吃什么？', options: ['胡萝卜', '石头', '铅笔'], answer: 0, explain: '小兔子爱吃胡萝卜。' }

describe('enoughText', () => {
  it('rejects short text', () => expect(enoughText('小兔子你好')).toBe(false))
  it('accepts 20 Chinese characters', () => expect(enoughText('小兔子在草地上快乐地跳来跳去找好吃的胡萝卜')).toBe(true))
  it('counts English words', () => expect(enoughText('the little rabbit likes to eat carrots and jump on the green grass every single day')).toBe(true))
  it('does not accept 19 characters', () => expect(enoughText('一二三四五六七八九十一二三四五六七八九')).toBe(false))
})

describe('parseQuiz', () => {
  it('parses a valid object', () => {
    expect(parseQuiz(JSON.stringify({ questions: [good] }))).toEqual([good])
  })
  it('accepts a bare array and code fences', () => {
    expect(parseQuiz('```json\n' + JSON.stringify([good]) + '\n```')).toEqual([good])
  })
  it('drops invalid questions', () => {
    const bad = [
      { ...good, options: ['a', 'b'] },
      { ...good, answer: 3 },
      { ...good, answer: 'x' },
      { ...good, options: ['a', 'a', 'b'] },
      { ...good, q: '  ' },
      { ...good, options: ['a', '', 'b'] },
    ]
    expect(parseQuiz(JSON.stringify({ questions: [...bad, good] }))).toEqual([good])
  })
  it('keeps at most 3 questions', () => {
    expect(parseQuiz(JSON.stringify({ questions: [good, good, good, good] }))).toHaveLength(3)
  })
  it('returns [] for garbage, blanks and wrong shapes', () => {
    expect(parseQuiz('not json')).toEqual([])
    expect(parseQuiz('     ')).toEqual([])
    expect(parseQuiz('{"questions":"x"}')).toEqual([])
    expect(parseQuiz('{"questions":[]}')).toEqual([])
  })
})

describe('shuffleQuestion', () => {
  it('keeps the correct option text and is a permutation', () => {
    for (const seed of [0, 0.2, 0.5, 0.8, 0.99]) {
      const q = shuffleQuestion(good, () => seed)
      expect(q.options[q.answer]).toBe('胡萝卜')
      expect([...q.options].sort()).toEqual([...good.options].sort())
    }
  })
})

describe('quizScore', () => {
  const questions: QuizQuestion[] = [good, { ...good, answer: 1 }, { ...good, answer: 2 }]
  it('counts answered and right', () => {
    expect(quizScore({ questions, picks: [0, 0, null] })).toEqual({ right: 1, answered: 2, total: 3 })
  })
  it('handles no quiz', () => expect(quizScore(undefined)).toEqual({ right: 0, answered: 0, total: 0 }))
})

describe('buildMessages', () => {
  it('asks for json and includes the transcript', () => {
    const m = buildMessages('今天读了小兔子', 'chinese')
    expect(m[0].role).toBe('system')
    expect(m[0].content).toContain('json')
    expect(m[1].content).toContain('今天读了小兔子')
  })
  it('mentions English for the english task', () => {
    expect(buildMessages('hello', 'english')[0].content).toContain('英语')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/segmenter.test.ts tests/core/quiz.test.ts`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现**

`src/core/segmenter.ts`:
```ts
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
```

`src/core/quiz.ts`:
```ts
import type { QuizData, QuizQuestion, TaskId } from '../types'

export const MAX_QUESTIONS = 3
const MIN_UNITS = 20

/** 识别文字太短就不出题：中文按字、英文按词 */
export function enoughText(text: string): boolean {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length
  const words = (text.replace(/[一-鿿]/g, ' ').match(/[A-Za-z']+/g) ?? []).length
  return cjk + words >= MIN_UNITS
}

/** 解析并校验模型返回的题目，不合格的题直接丢弃，最多保留 3 题 */
export function parseQuiz(raw: string): QuizQuestion[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(data) ? data : data?.questions
  if (!Array.isArray(list)) return []
  const out: QuizQuestion[] = []
  for (const it of list) {
    const q = typeof it?.q === 'string' ? it.q.trim() : ''
    const options: string[] = Array.isArray(it?.options) ? it.options.map((o: unknown) => String(o).trim()) : []
    const answer = Number(it?.answer)
    const explain = typeof it?.explain === 'string' ? it.explain.trim() : ''
    if (!q || options.length !== 3 || options.some((o) => !o)) continue
    if (!Number.isInteger(answer) || answer < 0 || answer > 2) continue
    if (new Set(options).size !== 3) continue
    out.push({ q, options, answer, explain })
    if (out.length === MAX_QUESTIONS) break
  }
  return out
}

/** 打乱选项顺序，避免模型总把正确答案放在同一个位置 */
export function shuffleQuestion(q: QuizQuestion, rng: () => number = Math.random): QuizQuestion {
  const idx = [0, 1, 2]
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) }
}

export function quizScore(quiz?: QuizData): { right: number; answered: number; total: number } {
  if (!quiz) return { right: 0, answered: 0, total: 0 }
  let right = 0
  let answered = 0
  quiz.questions.forEach((q, i) => {
    const p = quiz.picks[i]
    if (p !== null && p !== undefined) {
      answered += 1
      if (p === q.answer) right += 1
    }
  })
  return { right, answered, total: quiz.questions.length }
}

export function buildMessages(transcript: string, taskId: TaskId): { role: 'system' | 'user'; content: string }[] {
  const lang =
    taskId === 'english'
      ? '孩子读的是英语，题干用简单中文，需要时可以引用原文里的英文单词。'
      : '孩子读的是语文内容，题干用简单中文。'
  const system = [
    '你是一年级小学生的阅读老师。根据孩子刚才朗读内容的语音识别文字，出最多3道单项选择题，考察内容理解和简单的思考（比如为什么、接下来会怎样、你觉得）。',
    lang,
    '要求：每题恰好3个选项，只有1个正确；题干和选项都用一年级孩子能看懂的短句；识别文字可能有错别字或断句错误，请忽略这些错误，只依据能确定的内容出题；如果内容太少或太乱，出的题可以少于3道，甚至返回空数组。',
    '只输出 json，格式如下：{"questions":[{"q":"题干","options":["选项A","选项B","选项C"],"answer":0,"explain":"一句话讲解"}]}，其中 answer 是正确选项的下标（0到2）。',
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: `识别文字：\n${transcript}` },
  ]
}
```

- [ ] **Step 4: 运行确认通过，并类型检查**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: 全部 PASS，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/core/segmenter.ts src/core/quiz.ts tests/core/segmenter.test.ts tests/core/quiz.test.ts
git commit -m "feat(core): audio segmenter and quiz parsing/scoring

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: DeepSeek 调用与实时识别（services/deepseek, services/liveAsr）

**Files:**
- Create: `src/services/deepseek.ts`, `src/services/liveAsr.ts`
- Test: `tests/services/deepseek.test.ts`, `tests/services/liveAsr.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/services/deepseek.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ApiError, checkKey, describeError, generateQuiz, transcribeWav } from '../../src/services/deepseek'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const chat = (content: string) => json({ choices: [{ message: { content } }] })
const LONG = '小兔子在草地上快乐地跳来跳去找好吃的胡萝卜'
const quizJson = JSON.stringify({ questions: [{ q: '小兔子在找什么？', options: ['胡萝卜', '石头', '铅笔'], answer: 0, explain: '它在找胡萝卜。' }] })

describe('transcribeWav', () => {
  it('posts multipart with a bearer token and returns the text', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return json({ text: '你好', duration_ms: 1000 })
    }) as unknown as typeof fetch
    expect(await transcribeWav(new Uint8Array([1, 2, 3]), 'sk-x', f)).toBe('你好')
    expect(seen!.url).toBe('https://api.deepseek.com/v1/tools/asr')
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-x')
    expect(seen!.init.body).toBeInstanceOf(FormData)
    expect((seen!.init.body as FormData).get('file')).toBeInstanceOf(Blob)
  })
  it('throws ApiError carrying the status', async () => {
    const f = (async () => json({}, 401)) as unknown as typeof fetch
    await expect(transcribeWav(new Uint8Array(1), 'k', f)).rejects.toMatchObject({ status: 401 })
  })
})

describe('generateQuiz', () => {
  it('skips the request when the text is too short', async () => {
    let calls = 0
    const f = (async () => { calls++; return chat(quizJson) }) as unknown as typeof fetch
    expect(await generateQuiz('太短', 'chinese', 'k', f)).toEqual([])
    expect(calls).toBe(0)
  })
  it('sends the documented request and returns shuffled questions', async () => {
    let body: any
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(init.body as string); return chat(quizJson) }) as unknown as typeof fetch
    const qs = await generateQuiz(LONG, 'chinese', 'k', f)
    expect(body.model).toBe('deepseek-flash')
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(qs).toHaveLength(1)
    expect(qs[0].options[qs[0].answer]).toBe('胡萝卜')
  })
  it('retries once when the content is blank', async () => {
    const replies = [chat('      '), chat(quizJson)]
    let calls = 0
    const f = (async () => replies[calls++]) as unknown as typeof fetch
    expect(await generateQuiz(LONG, 'chinese', 'k', f)).toHaveLength(1)
    expect(calls).toBe(2)
  })
  it('does not retry when the model deliberately returns no questions', async () => {
    let calls = 0
    const f = (async () => { calls++; return chat('{"questions":[]}') }) as unknown as typeof fetch
    expect(await generateQuiz(LONG, 'chinese', 'k', f)).toEqual([])
    expect(calls).toBe(1)
  })
})

describe('error messages', () => {
  it('maps common statuses', () => {
    expect(describeError(new ApiError(401, 'x'))).toBe('密钥无效')
    expect(describeError(new ApiError(402, 'x'))).toBe('账户余额不足')
    expect(describeError(new TypeError('Failed to fetch'))).toBe('网络连接失败')
  })
  it('checkKey reports success and failure', async () => {
    const ok = (async () => chat('{"ok":true}')) as unknown as typeof fetch
    const bad = (async () => json({}, 401)) as unknown as typeof fetch
    expect(await checkKey('k', ok)).toBe('密钥可用')
    expect(await checkKey('k', bad)).toBe('密钥无效')
  })
})
```

`tests/services/liveAsr.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/services`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现 deepseek.ts**

`src/services/deepseek.ts`:
```ts
import { buildMessages, enoughText, parseQuiz, shuffleQuestion } from '../core/quiz'
import type { QuizQuestion, TaskId } from '../types'

const BASE = 'https://api.deepseek.com'
const MODEL = 'deepseek-flash'

type Fetch = typeof fetch
type Message = { role: 'system' | 'user'; content: string }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

/** 语音识别：整段 16-bit PCM WAV（不超过 120 秒） */
export async function transcribeWav(wav: Uint8Array, key: string, f: Fetch = fetch): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'segment.wav')
  const res = await f(`${BASE}/v1/tools/asr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) throw new ApiError(res.status, `ASR ${res.status}`)
  const data = await res.json()
  return typeof data?.text === 'string' ? data.text : ''
}

/** 对话（JSON 输出，关闭思考以降低延迟） */
export async function chatJson(messages: Message[], key: string, f: Fetch = fetch, maxTokens = 1500): Promise<string> {
  const res = await f(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) throw new ApiError(res.status, `Chat ${res.status}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

/** 根据识别文字出题；文字太短返回 []；内容为空白时重试一次 */
export async function generateQuiz(transcript: string, taskId: TaskId, key: string, f: Fetch = fetch): Promise<QuizQuestion[]> {
  if (!enoughText(transcript)) return []
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chatJson(buildMessages(transcript, taskId), key, f)
    const qs = parseQuiz(content)
    if (qs.length || content.trim()) return qs.map((q) => shuffleQuestion(q))
  }
  return []
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return '密钥无效'
    if (e.status === 402) return '账户余额不足'
    if (e.status === 429) return '请求太频繁，请稍后再试'
    return `服务出错（${e.status}）`
  }
  return '网络连接失败'
}

/** 设置页“测试密钥” */
export async function checkKey(key: string, f: Fetch = fetch): Promise<string> {
  try {
    await chatJson([{ role: 'user', content: '请只输出 json：{"ok":true}' }], key, f, 20)
    return '密钥可用'
  } catch (e) {
    return describeError(e)
  }
}
```

- [ ] **Step 4: 实现 liveAsr.ts**

`src/services/liveAsr.ts`:
```ts
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
```

- [ ] **Step 5: 运行确认通过，并类型检查**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: 全部 PASS，无类型错误。如果 `liveAsr` 的「skips a segment」用例因请求次数不是 4 而失败，先确认是不是切段点或尾段长度造成的，再按真实行为修正测试里的预期，不要改实现去迁就测试。

- [ ] **Step 6: Commit**

```bash
git add src/services/deepseek.ts src/services/liveAsr.ts tests/services
git commit -m "feat(services): DeepSeek ASR/chat client and live segmented recognition

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 存储与状态（密钥、出题落库、答题）

**Files:**
- Modify: `src/storage/repo.ts`, `src/store.ts`
- Test: `tests/store/quiz.test.ts`, `tests/storage/backup.test.ts`（追加）

- [ ] **Step 1: 写失败的测试**

`tests/store/quiz.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { answerQuiz, jobKey, reload, runQuiz, state, updateApiKey } from '../../src/store'
import { clearRecords, saveCheckin } from '../../src/storage/repo'
import type { Checkin } from '../../src/types'

const LONG = '小兔子在草地上快乐地跳来跳去找好吃的胡萝卜'
const quizJson = JSON.stringify({ questions: [{ q: '小兔子在找什么？', options: ['胡萝卜', '石头', '铅笔'], answer: 0, explain: '它在找胡萝卜。' }] })
const checkin: Checkin = { taskId: 'chinese', date: '2026-11-23', submittedAt: 1, isMakeup: false, durationSec: 30, audioId: 'a1' }

beforeEach(async () => {
  await clearRecords()
  await saveCheckin(checkin, { id: 'a1', data: new Uint8Array([1]).buffer, mimeType: 'audio/mp4', durationSec: 30 })
  await updateApiKey('sk-test')
  await reload()
})
afterEach(() => vi.unstubAllGlobals())

const stubChat = (content: string, status = 200) =>
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }))

describe('api key', () => {
  it('is kept in the store and survives reload', async () => {
    expect(state.apiKey).toBe('sk-test')
    state.apiKey = ''
    await reload()
    expect(state.apiKey).toBe('sk-test')
  })
})

describe('runQuiz', () => {
  it('saves transcript and questions on the check-in and marks the job done', async () => {
    stubChat(quizJson)
    await runQuiz('chinese', '2026-11-23', { finish: async () => LONG })
    const c = state.checkins[0]
    expect(c.transcript).toBe(LONG)
    expect(c.quiz?.questions).toHaveLength(1)
    expect(c.quiz?.picks).toEqual([null])
    expect(state.quizJobs[jobKey('chinese', '2026-11-23')]).toBe('done')
  })
  it('marks none and keeps the check-in when the text is too short', async () => {
    stubChat(quizJson)
    await runQuiz('chinese', '2026-11-23', { finish: async () => '太短' })
    expect(state.checkins).toHaveLength(1)
    expect(state.checkins[0].quiz).toBeUndefined()
    expect(state.quizJobs[jobKey('chinese', '2026-11-23')]).toBe('none')
  })
  it('marks none when the request fails', async () => {
    stubChat('', 500)
    await runQuiz('chinese', '2026-11-23', { finish: async () => LONG })
    expect(state.checkins[0].quiz).toBeUndefined()
    expect(state.quizJobs[jobKey('chinese', '2026-11-23')]).toBe('none')
  })
  it('is running while recognition is still finishing', async () => {
    stubChat(quizJson)
    let release!: (t: string) => void
    const p = runQuiz('chinese', '2026-11-23', { finish: () => new Promise<string>((r) => (release = r)) })
    expect(state.quizJobs[jobKey('chinese', '2026-11-23')]).toBe('running')
    release(LONG)
    await p
  })
})

describe('answerQuiz', () => {
  it('records a pick once and ignores later changes', async () => {
    stubChat(quizJson)
    await runQuiz('chinese', '2026-11-23', { finish: async () => LONG })
    await answerQuiz('chinese', '2026-11-23', 0, 1)
    await answerQuiz('chinese', '2026-11-23', 0, 2)
    expect(state.checkins[0].quiz?.picks).toEqual([1])
  })
})
```

在 `tests/storage/backup.test.ts` 的 import 行里增加 `saveApiKey` 与 `unpackBackup`（已导入），并在文件末尾追加：

```ts
import { strFromU8, unzipSync } from 'fflate'
import { saveApiKey } from '../../src/storage/repo'

describe('backup and the DeepSeek key', () => {
  it('never contains the api key', async () => {
    await saveApiKey('sk-super-secret')
    await saveCheckin(c('2026-11-09'), a('a-2026-11-09'))
    const bytes = await exportBackup()
    const files = unzipSync(bytes)
    for (const [name, data] of Object.entries(files)) {
      expect(strFromU8(data)).not.toContain('sk-super-secret')
      expect(name).not.toContain('key')
    }
  })
  it('keeps quiz data on check-ins through a roundtrip', async () => {
    const withQuiz = { ...c('2026-11-09'), transcript: '文字', quiz: { questions: [{ q: 'q', options: ['a', 'b', 'c'], answer: 1, explain: 'e' }], picks: [1] } }
    const bytes = packBackup({ checkins: [withQuiz], settings: defaultSettings(), audios: [a('a-2026-11-09')] })
    expect(unpackBackup(bytes).checkins[0]).toEqual(withQuiz)
  })
})
```
（`import` 语句放到文件顶部与其他 import 一起，不要留在文件中间。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/store tests/storage/backup.test.ts`
Expected: FAIL（`updateApiKey`、`runQuiz`、`saveApiKey` 等未定义）。

- [ ] **Step 3: 实现 repo 部分**

在 `src/storage/repo.ts` 的 `listCheckins` 之后追加：

```ts
/** 更新已有打卡记录（识别文字、题目、作答） */
export async function putCheckin(c: Checkin) {
  await (await getDb()).put('checkins', c)
}

/** DeepSeek 密钥单独存放，不属于 Settings，因此不会进入备份 */
export async function loadApiKey(): Promise<string> {
  return (((await (await getDb()).get('kv', 'apiKey')) as string | undefined) ?? '')
}

export async function saveApiKey(key: string) {
  const db = await getDb()
  if (key) await db.put('kv', key, 'apiKey')
  else await db.delete('kv', 'apiKey')
}
```

- [ ] **Step 4: 实现 store 部分**

在 `src/store.ts` 中：

1. 在 import 区追加：
```ts
import { generateQuiz } from './services/deepseek'
```
2. 在 `state` 里 `meta` 一行之后追加两个字段：
```ts
  apiKey: '',
  quizJobs: {} as Record<string, 'running' | 'done' | 'none'>,
```
3. 在 `reload()` 里 `state.meta = await repo.loadMeta()` 之后追加：
```ts
  state.apiKey = await repo.loadApiKey()
```
4. 在文件末尾追加：
```ts
export const jobKey = (taskId: TaskId, date: string) => `${taskId}|${date}`

export async function updateApiKey(key: string) {
  await repo.saveApiKey(key)
  state.apiKey = key
}

async function patchCheckin(taskId: TaskId, date: string, patch: Partial<Checkin>) {
  const cur = state.checkins.find((c) => c.taskId === taskId && c.date === date)
  if (!cur) return
  await repo.putCheckin({ ...cur, ...patch })
  state.checkins = await repo.listCheckins()
}

/** 后台任务：等识别收尾 → 出题 → 写回打卡记录。任何失败都只是“没有题目” */
export async function runQuiz(taskId: TaskId, date: string, live: { finish(): Promise<string> }) {
  const key = jobKey(taskId, date)
  state.quizJobs[key] = 'running'
  try {
    const transcript = await live.finish()
    const questions = await generateQuiz(transcript, taskId, state.apiKey)
    await patchCheckin(taskId, date, {
      transcript,
      quiz: questions.length ? { questions, picks: questions.map(() => null) } : undefined,
    })
    state.quizJobs[key] = questions.length ? 'done' : 'none'
  } catch {
    state.quizJobs[key] = 'none'
  }
}

/** 记录作答；答过的题不能改 */
export async function answerQuiz(taskId: TaskId, date: string, qi: number, pick: number) {
  const cur = state.checkins.find((c) => c.taskId === taskId && c.date === date)
  if (!cur?.quiz || cur.quiz.picks[qi] !== null) return
  const picks = [...cur.quiz.picks]
  picks[qi] = pick
  await patchCheckin(taskId, date, { quiz: { ...cur.quiz, picks } })
}
```

- [ ] **Step 5: 运行确认通过，并类型检查**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: 全部 PASS，无类型错误。

- [ ] **Step 6: Commit**

```bash
git add src/storage/repo.ts src/store.ts tests/store tests/storage/backup.test.ts
git commit -m "feat(store): api key, quiz generation job and answers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 录音时取 PCM 并接入录音页（services/pcmTap, recorder, Record.vue）

这部分依赖浏览器 API，不做单元测试，用类型检查、构建和真机验证（Task 8）把关。

**Files:**
- Create: `src/services/pcmTap.ts`
- Modify: `src/services/recorder.ts`（整体替换）, `src/views/Record.vue`

- [ ] **Step 1: PcmTap**

`src/services/pcmTap.ts`:
```ts
import { Resampler } from '../core/wav'

export const PCM_RATE = 16000

// AudioWorklet 处理器：攒满 4096 个采样再发回主线程，减少消息数
const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(4096)
    this.n = 0
    this.on = true
    this.port.onmessage = (e) => { this.on = e.data === 'on' }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && this.on) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('pcm-tap', PcmTap)
`

/** 从麦克风流旁路取 16kHz 单声道 PCM，不影响 MediaRecorder */
export class PcmTap {
  private readonly ctx: AudioContext
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  /** 必须在用户点击的同步流程里创建：iOS 要求在手势里 resume */
  constructor() {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    this.ctx = new AC()
    void this.ctx.resume()
  }

  async attach(stream: MediaStream, onChunk: (pcm: Float32Array) => void) {
    if (!this.ctx.audioWorklet) throw new Error('当前浏览器不支持 AudioWorklet')
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    try {
      await this.ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const resampler = new Resampler(this.ctx.sampleRate, PCM_RATE)
    this.source = this.ctx.createMediaStreamSource(stream)
    this.node = new AudioWorkletNode(this.ctx, 'pcm-tap')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const out = resampler.process(e.data)
      if (out.length) onChunk(out)
    }
    // iOS 上没有接到输出的节点可能不会被驱动，接一个静音增益到 destination
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.source.connect(this.node)
    this.node.connect(mute)
    mute.connect(this.ctx.destination)
  }

  pause() {
    this.node?.port.postMessage('off')
  }

  resume() {
    this.node?.port.postMessage('on')
  }

  stop() {
    if (this.node) this.node.port.onmessage = null
    try {
      this.source?.disconnect()
      this.node?.disconnect()
    } catch {
      /* 已断开 */
    }
    void this.ctx.close().catch(() => {})
    this.node = null
    this.source = null
  }
}
```

- [ ] **Step 2: 用以下内容整体替换 `src/services/recorder.ts`**

```ts
import { PcmTap } from './pcmTap'

export const MIN_SECONDS = 3
export const MAX_SECONDS = 30 * 60

const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

export interface RecordingResult {
  blob: Blob
  mimeType: string
  durationSec: number
}

export class Recorder {
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private tap: PcmTap | null = null
  private chunks: Blob[] = []
  private accumulatedMs = 0
  private segmentStart = 0
  private wakeLock: { release(): Promise<void> } | null = null
  private timer: number | null = null
  /** 已录时长（秒），含暂停前的累计 */
  elapsedSec = 0
  onTick: (sec: number) => void = () => {}
  onAutoStop: () => void = () => {}
  /** 设置后，录音时会同时输出 16kHz 单声道 PCM（用于实时识别） */
  onPcm: ((pcm: Float32Array) => void) | null = null
  /** PCM 旁路启动失败（如浏览器不支持）时回调，录音本身不受影响 */
  onPcmUnavailable: () => void = () => {}

  async start() {
    // AudioContext 必须在任何 await 之前创建，才算在点击手势里
    const tap = this.onPcm ? new PcmTap() : null
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      tap?.stop()
      throw e
    }
    const mime = pickMimeType()
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.accumulatedMs = 0
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(1000)
    this.segmentStart = Date.now()
    this.startTick()
    if (tap) {
      try {
        await tap.attach(this.stream, this.onPcm!)
        this.tap = tap
      } catch {
        tap.stop()
        this.onPcmUnavailable()
      }
    }
    try {
      this.wakeLock = await (navigator as any).wakeLock?.request('screen')
    } catch {
      /* 不支持或被拒绝，忽略 */
    }
  }

  pause() {
    this.rec?.pause()
    this.tap?.pause()
    this.accumulatedMs += Date.now() - this.segmentStart
    this.stopTick()
  }

  resume() {
    this.rec?.resume()
    this.tap?.resume()
    this.segmentStart = Date.now()
    this.startTick()
  }

  stop(): Promise<RecordingResult> {
    const rec = this.rec!
    const paused = rec.state === 'paused'
    if (!paused) this.accumulatedMs += Date.now() - this.segmentStart
    this.stopTick()
    return new Promise((resolve) => {
      rec.onstop = () => {
        const mimeType = rec.mimeType || pickMimeType() || 'audio/mp4'
        resolve({ blob: new Blob(this.chunks, { type: mimeType }), mimeType, durationSec: Math.round(this.accumulatedMs / 1000) })
        this.release()
      }
      rec.stop()
    })
  }

  /** 放弃录音并释放麦克风 */
  cancel() {
    this.stopTick()
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = null
      this.rec.stop()
    }
    this.release()
  }

  private release() {
    this.tap?.stop()
    this.tap = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
  }

  private startTick() {
    this.timer = window.setInterval(() => {
      this.elapsedSec = Math.floor((this.accumulatedMs + Date.now() - this.segmentStart) / 1000)
      this.onTick(this.elapsedSec)
      if (this.elapsedSec >= MAX_SECONDS) this.onAutoStop()
    }, 250)
  }

  private stopTick() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 3: 修改 `src/views/Record.vue`**

按顺序做六处改动：

1. 把 `import { state, submitCheckin } from '../store'` 改为：
```ts
import { runQuiz, state, submitCheckin } from '../store'
import { LiveAsr } from '../services/liveAsr'
```
2. 在 `let submitted = false` 下面加一行：
```ts
let live: LiveAsr | null = null
```
3. 在 `start()` 里，`await recorder.start()` 之前加：
```ts
    live = state.apiKey ? new LiveAsr(state.apiKey) : null
    recorder.onPcm = live ? (pcm) => live?.push(pcm) : null
    recorder.onPcmUnavailable = () => { live = null }
```
4. 在 `redo()` 函数体第一行加：
```ts
  live?.discard()
  live = null
```
5. 在 `submit()` 里，把 `router.replace(`/task/${taskId}`)` 这一行替换为：
```ts
    if (live) {
      void runQuiz(taskId, date, live)
      router.replace(`/task/${taskId}/quiz/${date}`)
    } else {
      router.replace(`/task/${taskId}`)
    }
```
6. 在 `onBeforeUnmount` 回调里，`recorder.cancel()` 之前加：
```ts
  if (!submitted) live?.discard()
```

- [ ] **Step 4: 类型检查与构建**

Run: `npx vue-tsc --noEmit && npx vite build 2>&1 | grep -E "built|rror" && npx vitest run 2>&1 | grep -E "Tests|Files"`
Expected: 无类型错误，构建成功，全部测试通过。（路由 `/task/:id/quiz/:date` 在 Task 6 才加，此时提交后不会走到它，因为没填密钥时 `live` 为 null。）

- [ ] **Step 5: Commit**

```bash
git add src/services/pcmTap.ts src/services/recorder.ts src/views/Record.vue
git commit -m "feat(record): tap PCM via AudioWorklet and feed live recognition

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 答题页、路由与打卡记录展示

**Files:**
- Create: `src/views/Quiz.vue`
- Modify: `src/router.ts`, `src/views/CheckinRecord.vue`

- [ ] **Step 1: 路由**

在 `src/router.ts` 的 routes 数组里，`/task/:id/rank` 一行之后追加：
```ts
    { path: '/task/:id/quiz/:date', component: () => import('./views/Quiz.vue') },
```

- [ ] **Step 2: 答题页**

`src/views/Quiz.vue`:
```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { answerQuiz, jobKey, state } from '../store'
import { quizScore } from '../core/quiz'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
const date = route.params.date as string
const LABELS = ['A', 'B', 'C']

const checkin = computed(() => state.checkins.find((c) => c.taskId === taskId && c.date === date))
const quiz = computed(() => checkin.value?.quiz)
const running = computed(() => state.quizJobs[jobKey(taskId, date)] === 'running')
const score = computed(() => quizScore(quiz.value))
const cur = ref(0)

// 题目到达（或进入页面时已有题目）时，定位到第一道没答的题；全答完则直接看结果
watch(
  quiz,
  (q, old) => {
    if (q && !old) {
      const first = q.picks.findIndex((p) => p === null)
      cur.value = first === -1 ? q.questions.length : first
    }
  },
  { immediate: true },
)

const total = computed(() => quiz.value?.questions.length ?? 0)
const question = computed(() => (quiz.value && cur.value < total.value ? quiz.value.questions[cur.value] : null))
const pick = computed(() => quiz.value?.picks[cur.value] ?? null)

function choose(i: number) {
  if (pick.value === null) void answerQuiz(taskId, date, cur.value, i)
}
function next() {
  cur.value += 1
}
function leave() {
  router.replace(`/task/${taskId}`)
}
</script>

<template>
  <div class="page">
    <div class="top"><button class="back" @click="leave">‹</button><span>阅读小测</span></div>

    <div v-if="question" class="card">
      <div class="progress muted">第 {{ cur + 1 }} / {{ total }} 题</div>
      <h2 class="qtext">{{ question.q }}</h2>
      <button
        v-for="(o, i) in question.options"
        :key="i"
        class="opt"
        :class="{ right: pick !== null && i === question.answer, wrong: pick !== null && i === pick && pick !== question.answer }"
        :disabled="pick !== null"
        @click="choose(i)"
      >
        <b>{{ LABELS[i] }}</b><span>{{ o }}</span>
      </button>
      <div v-if="pick !== null" class="feedback" :class="pick === question.answer ? 'ok' : 'no'">
        <div class="verdict">{{ pick === question.answer ? '答对啦！🎉' : '再想想～' }}</div>
        <div v-if="question.explain">{{ question.explain }}</div>
      </div>
    </div>

    <div v-else-if="quiz" class="card center">
      <div class="big">🌟</div>
      <h2>答对 {{ score.right }}/{{ score.total }}</h2>
    </div>

    <div v-else-if="running" class="card center">
      <div class="big spin">⭐</div>
      <h2>正在出题…</h2>
      <p class="muted">读得真棒！老师在想问题呢</p>
    </div>

    <div v-else class="card center">
      <h2>这次没有题目</h2>
    </div>

    <div class="bottom-bar">
      <button v-if="question && pick !== null" class="btn green" @click="next">{{ cur + 1 < total ? '下一题' : '完成' }}</button>
      <button v-else-if="!question" class="btn" @click="leave">{{ running ? '先不答题' : '回到打卡页' }}</button>
    </div>
  </div>
</template>

<style scoped>
.card { margin: 12px; border-radius: 20px; }
.center { text-align: center; padding: 40px 16px; }
.big { font-size: 72px; }
.spin { display: inline-block; animation: spin 1.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.qtext { font-size: 26px; line-height: 1.5; margin: 8px 0 20px; }
.opt { display: flex; align-items: center; gap: 14px; width: 100%; margin-bottom: 14px; padding: 16px 18px; min-height: 68px; border: 3px solid #d9e4f5; border-radius: 16px; background: #f6f9ff; font-size: 24px; text-align: left; color: #222; }
.opt b { flex: none; width: 40px; height: 40px; line-height: 40px; text-align: center; border-radius: 50%; background: #3a7bd5; color: #fff; font-size: 22px; }
.opt:disabled { opacity: 1; }
.opt.right { border-color: #43B581; background: #e8f8f0; }
.opt.right b { background: #43B581; }
.opt.wrong { border-color: #e5534b; background: #fdeceb; }
.opt.wrong b { background: #e5534b; }
.feedback { margin-top: 8px; padding: 14px 16px; border-radius: 14px; font-size: 20px; line-height: 1.6; }
.feedback.ok { background: #e8f8f0; }
.feedback.no { background: #fff4e0; }
.verdict { font-weight: 700; font-size: 24px; margin-bottom: 4px; }
</style>
```

- [ ] **Step 3: 打卡记录页显示结果**

在 `src/views/CheckinRecord.vue` 里：

1. 在 `<script setup>` 的 import 区追加：
```ts
import { quizScore } from '../core/quiz'
```
2. 在 `const when = computed(...)` 之前追加：
```ts
const score = computed(() => quizScore(checkin.value?.quiz))
```
3. 在模板里，紧跟 `<div class="audio">…</div>`（即 `</div>` 之后、外层 `</div>` 之前）追加：
```html
      <div v-if="checkin.quiz" class="quiz-sum">
        <span>阅读小测：答对 {{ score.right }}/{{ score.total }}<template v-if="score.answered < score.total">（还有 {{ score.total - score.answered }} 题没答）</template></span>
        <router-link :to="`/task/${taskId}/quiz/${date}`">{{ score.answered < score.total ? '去答题' : '再看看' }}</router-link>
      </div>
```
4. 在 `<style scoped>` 里追加：
```css
.quiz-sum { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 16px 0 0 64px; padding: 12px 14px; border-radius: 12px; background: #fff8e6; font-size: 17px; }
.quiz-sum a { color: #3a7bd5; text-decoration: none; font-weight: 600; white-space: nowrap; }
```

- [ ] **Step 4: 类型检查与构建**

Run: `npx vue-tsc --noEmit && npx vite build 2>&1 | grep -E "built|rror" && npx vitest run 2>&1 | grep -E "Tests|Files"`
Expected: 无类型错误，构建成功，全部测试通过。

- [ ] **Step 5: Commit**

```bash
git add src/views/Quiz.vue src/router.ts src/views/CheckinRecord.vue
git commit -m "feat(quiz): quiz page, route and result summary on check-in record

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 设置页填写密钥

**Files:**
- Modify: `src/views/Settings.vue`

- [ ] **Step 1: 修改设置页**

1. 把 `import { reload, state, updateRoster, updateSettings } from '../store'` 改为：
```ts
import { reload, state, updateApiKey, updateRoster, updateSettings } from '../store'
import { checkKey } from '../services/deepseek'
```
2. 在 `// ---- 检查更新 ----` 这行注释之前追加：
```ts
// ---- 阅读小测（DeepSeek） ----
const apiKeyInput = ref(state.apiKey)
async function saveKey() {
  const key = apiKeyInput.value.trim()
  await updateApiKey(key)
  msg.value = key ? '密钥已保存' : '已清除密钥，阅读小测已关闭'
}
async function testKey() {
  busy.value = true
  msg.value = '正在测试…'
  msg.value = await checkKey(apiKeyInput.value.trim())
  busy.value = false
}

```
3. 在模板里，`<h3>应用</h3>` 所在的 `<section class="card">` 之前，插入：
```html
    <section class="card">
      <h3>阅读小测（DeepSeek）</h3>
      <p class="muted">填入密钥后，孩子朗读时会自动识别，提交后出最多 3 道选择题。朗读的音频和识别文字会发送给 DeepSeek。密钥只保存在这台设备上，不会进入备份；建议在 DeepSeek 后台给它设置额度上限。留空则关闭此功能。</p>
      <label>API 密钥<input v-model="apiKeyInput" type="password" autocomplete="off" placeholder="sk-..." /></label>
      <div class="actions">
        <button class="btn small" @click="saveKey">保存密钥</button>
        <button class="btn small" :disabled="!apiKeyInput.trim() || busy" @click="testKey">测试密钥</button>
      </div>
    </section>

```

- [ ] **Step 2: 类型检查与构建**

Run: `npx vue-tsc --noEmit && npx vite build 2>&1 | grep -E "built|rror" && npx vitest run 2>&1 | grep -E "Tests|Files"`
Expected: 无类型错误，构建成功，全部测试通过。

- [ ] **Step 3: Commit**

```bash
git add src/views/Settings.vue
git commit -m "feat(settings): DeepSeek api key with test button

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 真机验证清单（由用户在 iPad 上完成）

- [ ] 设置里填入 DeepSeek 密钥，点「测试密钥」，显示「密钥可用」。
- [ ] 朗读一段约 30 秒的内容：点「读完了」→「提交打卡」，进入答题页，先显示「正在出题…」，随后出现题目；点选后立即显示对错和讲解。
- [ ] 朗读超过 70 秒的内容：录音期间在网络面板或 DeepSeek 后台能看到识别请求在录音过程中陆续发出，而不是读完后才发。
- [ ] 录音中点「暂停」再「继续」，识别文字不会出现暂停期间的内容。
- [ ] 录音中途点「重录」，之前的识别内容不会混进新的录音。
- [ ] 读得很短（几个字）：提交后答题页显示「这次没有题目」，打卡仍然成功。
- [ ] 关掉网络再提交：打卡成功，答题页显示「这次没有题目」。
- [ ] 清空密钥后录音：不请求识别，提交后直接回到任务详情页。
- [ ] 打卡记录页显示「阅读小测：答对 X/3」；没答完的有「去答题」。
- [ ] 导出备份，用解压工具打开，确认里面搜不到密钥；清空记录后导入，题目和作答记录仍在。
- [ ] 读英语内容时，题干用简单中文并引用英文单词。
- [ ] 如果录音时 `AudioWorklet` 取不到音频（现象：能打卡但永远没有题目），把现象告诉我，我来查 iOS 的采样率和 `AudioContext` 恢复问题。

---

## Self-Review

**Spec 覆盖：**
- 边录边分段识别、静音切点、顺序发送、重试、跳过失败段：Task 1（wav）、2（segmenter）、3（liveAsr）、5（pcmTap/recorder）。
- 关闭思考、JSON 输出、空白内容重试：Task 3。
- 最多 3 题、每题 3 选项、校验、打乱、识别文字门槛：Task 2。
- 提交后后台出题、答题页、「先不答题」、答过不能改：Task 4、5、6。
- 打卡记录页显示结果：Task 6。
- 密钥填写、测试、不进备份、清空记录不删密钥：Task 4、7。
- 失败只是没有题目：Task 4 的 `runQuiz` 捕获所有错误；Task 5 里没密钥时 `live` 为 null。
- 备份格式兼容（新增可选字段）：Task 4 的备份测试。

**占位符扫描：** 无 TBD/TODO；所有代码步骤都有完整代码。Task 3 Step 5 里关于请求次数的说明是对测试预期的核对指引，不是占位。

**类型一致性：** `QuizQuestion`、`QuizData` 定义在 `src/types.ts`（Task 1），`core/quiz.ts`、`deepseek.ts`、`store.ts`、`Quiz.vue` 沿用同名；`runQuiz` 接收 `{ finish(): Promise<string> }`，与 `LiveAsr.finish()` 一致；`LiveAsr` 构造参数 `(key, f, retryDelayMs)` 在 Task 3 测试与 Task 5 的 `new LiveAsr(state.apiKey)` 中一致（后两个有默认值）；`jobKey` 在 store 导出，`Quiz.vue` 使用。

**已知取舍：**
- 页面在识别中途被关闭或刷新，未发出的音频会丢失，不做离线补识别。
- 出题状态 `running` 只在内存里，刷新后若题目还没写入就视为没有题目。
- `AudioWorklet` 在 iOS 上的行为无法在本机验证，依赖 Task 8 的真机检查。
