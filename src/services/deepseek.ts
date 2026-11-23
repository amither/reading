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
export async function generateQuiz(transcript: string, taskId: TaskId, key: string, f: Fetch = fetch, grade = ''): Promise<QuizQuestion[]> {
  if (!enoughText(transcript)) return []
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chatJson(buildMessages(transcript, taskId, grade), key, f)
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
