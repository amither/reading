import { reactive } from 'vue'
import type { Checkin, Meta, Settings, TaskId } from './types'
import { toDateStr } from './core/date'
import { canCheckin } from './core/checkin'
import * as repo from './storage/repo'

export const state = reactive({
  ready: false,
  today: toDateStr(new Date()),
  settings: repo.defaultSettings() as Settings,
  checkins: [] as Checkin[],
  roster: null as string[] | null,
  meta: { a2hsPrompted: false } as Meta,
})

export async function reload() {
  state.settings = await repo.loadSettings()
  state.checkins = await repo.listCheckins()
  state.roster = await repo.loadRoster()
  state.meta = await repo.loadMeta()
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
