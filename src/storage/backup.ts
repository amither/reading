import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { AudioRecord, Checkin, Settings } from '../types'
import { getDb } from './db'
import { listCheckins, loadSettings, saveSettings } from './repo'

const VERSION = 1

export interface BackupPayload {
  checkins: Checkin[]
  settings: Settings
  audios: AudioRecord[]
}

export function packBackup(p: BackupPayload): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const audioMeta = p.audios.map((a) => {
    files[`audios/${a.id}.bin`] = new Uint8Array(a.data)
    return { id: a.id, mimeType: a.mimeType, durationSec: a.durationSec }
  })
  files['data.json'] = strToU8(JSON.stringify({ version: VERSION, checkins: p.checkins, settings: p.settings, audios: audioMeta }))
  return zipSync(files, { level: 0 }) // 音频已压缩，不再压缩
}

export function unpackBackup(bytes: Uint8Array): BackupPayload {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('不是有效的备份文件')
  }
  if (!files['data.json']) throw new Error('备份文件缺少 data.json')
  const data = JSON.parse(strFromU8(files['data.json']))
  if (data.version !== VERSION) throw new Error(`不支持的备份版本：${data.version}`)
  const audios: AudioRecord[] = (data.audios as Omit<AudioRecord, 'data'>[]).map((m) => {
    const raw = files[`audios/${m.id}.bin`]
    if (!raw) throw new Error(`备份缺少录音：${m.id}`)
    return { ...m, data: raw.slice().buffer as ArrayBuffer }
  })
  return { checkins: data.checkins, settings: data.settings, audios }
}

/** 同任务同日期保留提交时间较新的一条 */
export function mergeCheckins(existing: Checkin[], incoming: Checkin[]): Checkin[] {
  const map = new Map<string, Checkin>()
  for (const c of [...existing, ...incoming]) {
    const key = `${c.taskId}|${c.date}`
    const prev = map.get(key)
    if (!prev || c.submittedAt > prev.submittedAt) map.set(key, c)
  }
  return [...map.values()]
}

export async function exportBackup(): Promise<Uint8Array> {
  const db = await getDb()
  return packBackup({ checkins: await listCheckins(), settings: await loadSettings(), audios: await db.getAll('audios') })
}

export async function importBackup(bytes: Uint8Array, mode: 'overwrite' | 'merge') {
  const incoming = unpackBackup(bytes)
  const db = await getDb()
  const existing = mode === 'merge' ? await listCheckins() : []
  const merged = mergeCheckins(existing, incoming.checkins)
  const keepAudioIds = new Set(merged.map((c) => c.audioId))
  const incomingAudio = new Map(incoming.audios.map((x) => [x.id, x]))

  const tx = db.transaction(['checkins', 'audios'], 'readwrite')
  const cs = tx.objectStore('checkins')
  const as = tx.objectStore('audios')
  if (mode === 'overwrite') {
    await Promise.all([cs.clear(), as.clear()])
  } else {
    for (const old of await as.getAllKeys()) if (!keepAudioIds.has(old)) await as.delete(old)
  }
  for (const c of merged) {
    await cs.put(c)
    const audio = incomingAudio.get(c.audioId)
    if (audio) await as.put(audio)
  }
  await tx.done
  if (mode === 'overwrite') await saveSettings(incoming.settings)
}
