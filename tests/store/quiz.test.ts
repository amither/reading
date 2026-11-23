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
