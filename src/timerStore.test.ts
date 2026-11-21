import { beforeEach, describe, expect, it } from 'vitest'
import { defaultMinutes, fmtClock, pause, readTimer, remaining, resume, writeTimer, type TimerData } from './timerStore'
import type { Habit } from './core'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  } as Storage
})

const base: TimerData = { habitId: 'h', durationSec: 600, endAt: 1_000_000 + 600_000, pausedRemaining: 600 }

describe('таймер', () => {
  it('считает остаток по часам и переживает паузу', () => {
    expect(remaining(base, 1_000_000 + 60_000)).toBe(540)
    const p = pause(base, 1_000_000 + 60_000)
    expect(remaining(p, 9_999_999_999)).toBe(540)
    const r = resume(p, 2_000_000)
    expect(remaining(r, 2_000_000 + 40_000)).toBe(500)
    expect(remaining(r, 99_999_999)).toBe(0)
  })
  it('сохраняется и восстанавливается, мусор отбрасывается', () => {
    writeTimer(base)
    expect(readTimer()).toEqual({ ...base, moodBefore: undefined })
    mem.set('habit-game/timer', '{"habitId":1}')
    expect(readTimer()).toBeNull()
    mem.set('habit-game/timer', 'oops')
    expect(readTimer()).toBeNull()
    writeTimer(null)
    expect(readTimer()).toBeNull()
  })
  it('длительность по цели в минутах, иначе 10', () => {
    const h = { target: { amount: 25, unit: 'minutes' } } as Habit
    expect(defaultMinutes(h)).toBe(25)
    expect(defaultMinutes({ target: { amount: 3, unit: 'times' } } as Habit)).toBe(10)
    expect(defaultMinutes({ target: { amount: 500, unit: 'minutes' } } as Habit)).toBe(120)
    expect(fmtClock(452.2)).toBe('07:33')
    expect(fmtClock(0)).toBe('00:00')
  })
})
