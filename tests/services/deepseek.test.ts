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
