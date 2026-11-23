import { describe, it, expect } from 'vitest'
import { buildLeaderboard, mulberry32, hashString } from '../../src/core/leaderboard'
import { DEFAULT_NAMES } from '../../src/core/defaultNames'
import { elapsedDays } from '../../src/core/period'

const base = { names: DEFAULT_NAMES, taskId: 'chinese' as const, me: { name: '小明', days: 2 } }

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 20; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('hashString is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })
})

describe('buildLeaderboard', () => {
  it('is deterministic for same day/hour', () => {
    const a = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    const b = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    expect(a).toEqual(b)
  })
  it('includes everyone plus me', () => {
    const r = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    expect(r).toHaveLength(DEFAULT_NAMES.length + 1)
    expect(r.filter((e) => e.isMe)).toHaveLength(1)
  })
  it('excludes roster entry with same name as me', () => {
    const r = buildLeaderboard({ ...base, names: ['小明', '小红'], today: '2026-11-25', hour: 20 })
    expect(r).toHaveLength(2)
  })
  it('virtual days never exceed elapsed days', () => {
    for (const today of ['2026-11-23', '2026-11-24', '2026-11-26', '2026-11-29']) {
      const n = elapsedDays(today)
      for (const e of buildLeaderboard({ ...base, today, hour: 23 }).filter((x) => !x.isMe)) {
        expect(e.days).toBeLessThanOrEqual(n)
        expect(e.days).toBeGreaterThanOrEqual(0)
      }
    }
  })
  it('uses dense ranking sorted by days desc', () => {
    const r = buildLeaderboard({ ...base, today: '2026-11-27', hour: 20 })
    for (let i = 1; i < r.length; i++) {
      expect(r[i].days).toBeLessThanOrEqual(r[i - 1].days)
      const step = r[i].rank - r[i - 1].rank
      expect(step).toBe(r[i].days === r[i - 1].days ? 0 : 1)
    }
    expect(r[0].rank).toBe(1)
  })
  it('earlier hour never gives more days than later hour', () => {
    const early = buildLeaderboard({ ...base, today: '2026-11-26', hour: 6 })
    const late = buildLeaderboard({ ...base, today: '2026-11-26', hour: 23 })
    const sum = (r: typeof early) => r.filter((e) => !e.isMe).reduce((s, e) => s + e.days, 0)
    expect(sum(early)).toBeLessThanOrEqual(sum(late))
  })
  it('task boards differ', () => {
    const a = buildLeaderboard({ ...base, today: '2026-11-26', hour: 20 })
    const b = buildLeaderboard({ ...base, taskId: 'english', today: '2026-11-26', hour: 20 })
    expect(a.map((e) => e.name + e.days)).not.toEqual(b.map((e) => e.name + e.days))
  })
  it('avatar is stable per name across days', () => {
    const a = buildLeaderboard({ ...base, today: '2026-11-24', hour: 20 })
    const b = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    const pick = (r: typeof a) => Object.fromEntries(r.map((e) => [e.name, e.avatarKind + e.color]))
    expect(pick(a)).toEqual(pick(b))
  })
})
