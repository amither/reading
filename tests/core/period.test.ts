import { describe, it, expect } from 'vitest'
import { toDateStr, addDays } from '../../src/core/date'
import { periodOf, elapsedDays } from '../../src/core/period'

describe('date', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03')
  })
  it('adds days across month boundary', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })
})

describe('period', () => {
  it('Sunday belongs to the week that started on Monday', () => {
    const p = periodOf('2026-11-22')
    expect(p[0]).toBe('2026-11-16')
    expect(p[6]).toBe('2026-11-22')
    expect(p).toHaveLength(7)
  })
  it('Monday starts a new period', () => {
    expect(periodOf('2026-11-23')[0]).toBe('2026-11-23')
  })
  it('mid-week date', () => {
    expect(periodOf('2026-11-12')[0]).toBe('2026-11-09')
  })
  it('elapsedDays is 1 on Monday and 7 on Sunday', () => {
    expect(elapsedDays('2026-11-23')).toBe(1)
    expect(elapsedDays('2026-11-22')).toBe(7)
    expect(elapsedDays('2026-11-25')).toBe(3)
  })
})
