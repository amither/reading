import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { packBackup, unpackBackup, mergeCheckins, exportBackup, importBackup } from '../../src/storage/backup'
import { saveCheckin, listCheckins, getAudio, clearRecords, saveSettings, loadSettings, defaultSettings } from '../../src/storage/repo'
import type { Checkin, AudioRecord } from '../../src/types'

const c = (date: string, submittedAt = 1, audioId = 'a-' + date): Checkin => ({ taskId: 'chinese', date, submittedAt, isMakeup: false, durationSec: 5, audioId })
const a = (id: string, byte = 7): AudioRecord => ({ id, data: new Uint8Array([byte, byte]).buffer, mimeType: 'audio/mp4', durationSec: 5 })

beforeEach(async () => { await clearRecords() })

describe('pack/unpack', () => {
  it('roundtrips checkins, settings and audio bytes', () => {
    const s = defaultSettings(); s.name = '小明'
    const bytes = packBackup({ checkins: [c('2026-11-09')], settings: s, audios: [a('a-2026-11-09')] })
    const out = unpackBackup(bytes)
    expect(out.checkins).toHaveLength(1)
    expect(out.settings.name).toBe('小明')
    expect(new Uint8Array(out.audios[0].data)).toEqual(new Uint8Array([7, 7]))
    expect(out.audios[0].mimeType).toBe('audio/mp4')
  })
  it('rejects non-backup data', () => {
    expect(() => unpackBackup(new Uint8Array([1, 2, 3]))).toThrow()
  })
})

describe('mergeCheckins', () => {
  it('keeps newer submission per task+date', () => {
    const merged = mergeCheckins([c('2026-11-09', 10)], [c('2026-11-09', 20), c('2026-11-10', 1)])
    expect(merged.find((x) => x.date === '2026-11-09')!.submittedAt).toBe(20)
    expect(merged).toHaveLength(2)
  })
})

describe('export/import', () => {
  it('overwrite replaces current data', async () => {
    await saveCheckin(c('2026-11-09'), a('a-2026-11-09'))
    const bytes = await exportBackup()
    await clearRecords()
    await saveCheckin(c('2026-11-10'), a('a-2026-11-10'))
    await importBackup(bytes, 'overwrite')
    const list = await listCheckins()
    expect(list.map((x) => x.date)).toEqual(['2026-11-09'])
    expect(await getAudio('a-2026-11-10')).toBeUndefined()
    expect(await getAudio('a-2026-11-09')).toBeDefined()
  })
  it('merge keeps both and prefers newer on conflict', async () => {
    await saveCheckin(c('2026-11-09', 10, 'old'), a('old', 1))
    const bytes = packBackup({ checkins: [c('2026-11-09', 20, 'new'), c('2026-11-10', 5)], settings: defaultSettings(), audios: [a('new', 2), a('a-2026-11-10', 3)] })
    await importBackup(bytes, 'merge')
    const list = await listCheckins()
    expect(list).toHaveLength(2)
    expect(list.find((x) => x.date === '2026-11-09')!.audioId).toBe('new')
    expect(await getAudio('old')).toBeUndefined()
  })
  it('merge keeps existing settings, overwrite replaces them', async () => {
    const mine = defaultSettings(); mine.name = '现有'
    await saveSettings(mine)
    const other = defaultSettings(); other.name = '备份'
    const bytes = packBackup({ checkins: [], settings: other, audios: [] })
    await importBackup(bytes, 'merge')
    expect((await loadSettings()).name).toBe('现有')
    await importBackup(bytes, 'overwrite')
    expect((await loadSettings()).name).toBe('备份')
  })
})
