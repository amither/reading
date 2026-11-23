import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings, listCheckins, saveCheckin, getAudio, clearRecords, loadRoster, saveRoster, defaultSettings } from '../../src/storage/repo'
import type { Checkin, AudioRecord } from '../../src/types'

const checkin = (date: string): Checkin => ({ taskId: 'chinese', date, submittedAt: 5, isMakeup: false, durationSec: 12, audioId: 'a-' + date })
const audio = (date: string): AudioRecord => ({ id: 'a-' + date, data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mp4', durationSec: 12 })

beforeEach(async () => { await clearRecords() })

describe('repo', () => {
  it('returns default settings when empty and persists edits', async () => {
    expect((await loadSettings()).tasks.chinese.title).toBe(defaultSettings().tasks.chinese.title)
    const s = defaultSettings(); s.name = '小明'; s.grade = '一年级'; s.className = '2班'
    await saveSettings(s)
    expect((await loadSettings()).name).toBe('小明')
  })
  it('saves check-in with audio and reads them back', async () => {
    await saveCheckin(checkin('2026-11-09'), audio('2026-11-09'))
    expect(await listCheckins()).toHaveLength(1)
    const a = await getAudio('a-2026-11-09')
    expect(a?.mimeType).toBe('audio/mp4')
    expect(new Uint8Array(a!.data)).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('clearRecords removes check-ins and audios', async () => {
    await saveCheckin(checkin('2026-11-09'), audio('2026-11-09'))
    await clearRecords()
    expect(await listCheckins()).toHaveLength(0)
    expect(await getAudio('a-2026-11-09')).toBeUndefined()
  })
  it('roster roundtrip and clear', async () => {
    expect(await loadRoster()).toBeNull()
    await saveRoster(['甲', '乙'])
    expect(await loadRoster()).toEqual(['甲', '乙'])
    await saveRoster(null)
    expect(await loadRoster()).toBeNull()
  })
})
