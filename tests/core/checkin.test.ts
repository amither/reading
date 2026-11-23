import { describe, it, expect } from 'vitest'
import { streakDays, makeupUsed, dayStatus, canCheckin, MAKEUP_LIMIT } from '../../src/core/checkin'
import type { Checkin } from '../../src/types'

const mk = (date: string, isMakeup = false, taskId: 'chinese' | 'english' = 'chinese'): Checkin => ({
  taskId, date, submittedAt: 1, isMakeup, durationSec: 10, audioId: date,
})
const TODAY = '2026-11-12' // 周四，本周 11-09 ~ 11-15

describe('streakDays', () => {
  it('counts only this period and this task', () => {
    const all = [mk('2026-11-09'), mk('2026-11-10', true), mk('2026-11-08'), mk('2026-11-11', false, 'english')]
    expect(streakDays(all, 'chinese', TODAY)).toBe(2)
  })
})

describe('makeupUsed', () => {
  it('counts makeup records of this period/task', () => {
    const all = [mk('2026-11-09', true), mk('2026-11-10', true), mk('2026-11-02', true), mk('2026-11-11', true, 'english')]
    expect(makeupUsed(all, 'chinese', TODAY)).toBe(2)
  })
})

describe('dayStatus', () => {
  const all = [mk('2026-11-09')]
  it('classifies days', () => {
    expect(dayStatus(all, 'chinese', '2026-11-09', TODAY)).toBe('done')
    expect(dayStatus(all, 'chinese', '2026-11-10', TODAY)).toBe('missed')
    expect(dayStatus(all, 'chinese', '2026-11-12', TODAY)).toBe('today')
    expect(dayStatus(all, 'chinese', '2026-11-13', TODAY)).toBe('future')
  })
})

describe('canCheckin', () => {
  it('allows today as normal checkin', () => {
    expect(canCheckin([], 'chinese', TODAY, TODAY)).toEqual({ ok: true, isMakeup: false })
  })
  it('rejects duplicates', () => {
    const r = canCheckin([mk(TODAY)], 'chinese', TODAY, TODAY)
    expect(r.ok).toBe(false)
  })
  it('rejects future dates', () => {
    expect(canCheckin([], 'chinese', '2026-11-13', TODAY).ok).toBe(false)
  })
  it('rejects previous week', () => {
    expect(canCheckin([], 'chinese', '2026-11-08', TODAY).ok).toBe(false)
  })
  it('allows makeup for missed day in this week', () => {
    expect(canCheckin([], 'chinese', '2026-11-10', TODAY)).toEqual({ ok: true, isMakeup: true })
  })
  it('rejects makeup when quota used up', () => {
    const all = [mk('2026-11-09', true), mk('2026-11-10', true), mk('2026-11-11', true)]
    const r = canCheckin(all, 'chinese', '2026-11-12', '2026-11-13')
    expect(MAKEUP_LIMIT).toBe(3)
    expect(r).toEqual({ ok: false, reason: '本周补卡次数已用完' })
  })
  it('quota is per task', () => {
    const all = [mk('2026-11-09', true), mk('2026-11-10', true), mk('2026-11-11', true)]
    expect(canCheckin(all, 'english', '2026-11-09', TODAY).ok).toBe(true)
  })
})
