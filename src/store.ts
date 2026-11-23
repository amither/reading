import { reactive } from 'vue'
import type { Checkin, Meta, Settings, TaskId } from './types'
import { toDateStr } from './core/date'
import { canCheckin } from './core/checkin'
import * as repo from './storage/repo'
import { generateQuiz } from './services/deepseek'

export const state = reactive({
  ready: false,
  today: toDateStr(new Date()),
  settings: repo.defaultSettings() as Settings,
  checkins: [] as Checkin[],
  roster: null as string[] | null,
  meta: { a2hsPrompted: false } as Meta,
  apiKey: '',
  quizJobs: {} as Record<string, 'running' | 'done' | 'none'>,
})

export async function reload() {
  state.settings = await repo.loadSettings()
  state.checkins = await repo.listCheckins()
  state.roster = await repo.loadRoster()
  state.meta = await repo.loadMeta()
  state.apiKey = await repo.loadApiKey()
  state.today = toDateStr(new Date())
  state.ready = true
}

/** 回到前台或跨天时刷新“今天” */
export function refreshToday() {
  state.today = toDateStr(new Date())
}

export async function updateSettings(s: Settings) {
  await repo.saveSettings(s)
  state.settings = s
}

export async function updateRoster(names: string[] | null) {
  await repo.saveRoster(names)
  state.roster = names
}

export async function markA2hsPrompted() {
  state.meta = { ...state.meta, a2hsPrompted: true }
  await repo.saveMeta(state.meta)
}

export async function submitCheckin(
  taskId: TaskId,
  date: string,
  audio: { blob: Blob; mimeType: string; durationSec: number },
) {
  const verdict = canCheckin(state.checkins, taskId, date, state.today)
  if (!verdict.ok) throw new Error(verdict.reason)
  const audioId = crypto.randomUUID()
  const data = await audio.blob.arrayBuffer()
  const checkin: Checkin = { taskId, date, submittedAt: Date.now(), isMakeup: verdict.isMakeup, durationSec: audio.durationSec, audioId }
  await repo.saveCheckin(checkin, { id: audioId, data, mimeType: audio.mimeType, durationSec: audio.durationSec })
  state.checkins = await repo.listCheckins()
}

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
