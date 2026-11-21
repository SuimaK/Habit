import { describe, expect, it } from 'vitest'
import { addDays, freeShieldAvailable, streakMultiplier, weekday, weekStart, dayOf } from '..'
import { at, d, engine, habit, must } from './helpers'

describe('серии', () => {
  it('пороги множителя', () => {
    expect([0, 2, 3, 6, 7, 29, 30, 100].map(streakMultiplier)).toEqual([1, 1, 1.1, 1.1, 1.25, 1.25, 1.5, 1.5])
  })

  it('день засчитан при ≥70% плана', () => {
    const hs = Array.from({ length: 10 }, () => habit())
    const e = engine(hs)
    e.startOfDay(at(16, 7))
    hs.slice(0, 6).forEach((h) => must(e.complete(h.id, at(16))))
    expect(e.plan.result(d(16))).toBe('missed') // 60%
    must(e.complete(hs[6].id, at(16)))
    expect(e.plan.result(d(16))).toBe('met') // 70%
  })

  it('серия растёт, множитель применяется', () => {
    const h = habit('medium')
    const e = engine([h])
    for (const day of [16, 17, 18]) {
      e.startOfDay(at(day, 7))
      must(e.complete(h.id, at(day)))
    }
    expect(e.currentStreak(at(18))).toBe(3)
    e.startOfDay(at(19, 7))
    expect(e.currentStreak(at(19))).toBe(3) // сегодня ещё не отмечено — не рвётся
    const r = must(e.complete(h.id, at(19)))
    expect(r.multiplier).toBe(1.1)
    expect(r.xp).toBe(28) // 25 × 1,1 = 27,5 → 28
    expect(e.currentStreak(at(19))).toBe(4)
    expect(e.state.bestStreak).toBe(4)
  })

  it('пропуск без щита рвёт серию, лучшая серия остаётся', () => {
    const h = habit()
    const e = engine([h])
    e.state.shields = { purchased: 0, freeUsedWeeks: [d(16)] }
    for (const day of [16, 17, 18]) {
      e.startOfDay(at(day, 7))
      must(e.complete(h.id, at(day)))
    }
    e.startOfDay(at(20, 7)) // 19-е пропущено
    expect(e.currentStreak(at(20))).toBe(0)
    expect(e.state.bestStreak).toBe(3)
    expect(e.state.shieldedDays).toEqual([])
  })

  it('бесплатный щит спасает один пропуск в неделю', () => {
    const h = habit()
    const e = engine([h])
    for (const day of [16, 17]) {
      e.startOfDay(at(day, 7))
      must(e.complete(h.id, at(day)))
    }
    expect(e.startOfDay(at(19, 7))).toEqual([d(18)])
    expect(e.currentStreak(at(19))).toBe(2) // сохраняет, но не добавляет
    must(e.complete(h.id, at(19)))
    expect(e.currentStreak(at(19))).toBe(3)
    e.startOfDay(at(21, 7)) // второй пропуск на той же неделе — щита нет
    expect(e.currentStreak(at(21))).toBe(0)
  })

  it('после бесплатного тратится купленный', () => {
    const h = habit()
    const e = engine([h])
    e.state.shields = { purchased: 1, freeUsedWeeks: [] }
    e.startOfDay(at(16, 7))
    must(e.complete(h.id, at(16)))
    expect(e.startOfDay(at(19, 7))).toEqual([d(17), d(18)])
    expect(e.state.shields.purchased).toBe(0)
    expect(e.currentStreak(at(19))).toBe(1)
  })

  it('бесплатный щит обновляется в понедельник', () => {
    const s = { purchased: 0, freeUsedWeeks: [d(16)] }
    expect(freeShieldAvailable(s, d(22))).toBe(false) // вс той же недели
    expect(freeShieldAvailable(s, d(23))).toBe(true) // следующий пн
  })

  it('щит не тратится, если серии нет', () => {
    const h = habit()
    const e = engine([h])
    e.startOfDay(at(16, 7))
    expect(e.startOfDay(at(17, 7))).toEqual([])
    expect(freeShieldAvailable(e.state.shields, d(17))).toBe(true)
  })

  it('дни без плана нейтральны', () => {
    const h = habit('easy', { kind: 'weekdays', days: [1, 3] })
    const e = engine([h])
    e.startOfDay(at(16, 7)); must(e.complete(h.id, at(16)))
    e.startOfDay(at(18, 7)); must(e.complete(h.id, at(18)))
    expect(e.currentStreak(at(18))).toBe(2)
    expect(e.state.shieldedDays).toEqual([])
  })

  it('гибкие привычки не портят план дня и бонус', () => {
    const daily = habit(), weekly = habit('hard', { kind: 'timesPerWeek', times: 3 })
    const e = engine([daily, weekly])
    must(e.complete(daily.id, at(16)))
    expect(e.plan.result(d(16))).toBe('met')
    expect(e.state.bonusByDay[d(16)]).toBeDefined()
  })

  it('серия по ежедневной привычке', () => {
    const h = habit()
    const e = engine([h])
    e.startOfDay(at(15))
    for (const day of [15, 16, 17]) must(e.complete(h.id, at(day)))
    expect(e.habitStreak(h.id, at(18))).toBe(3)
    expect(e.habitStreak(h.id, at(19))).toBe(0)
  })

  it('серия по «N раз в неделю» считается неделями', () => {
    const h = habit('hard', { kind: 'timesPerWeek', times: 2 })
    const e = engine([h])
    e.startOfDay(at(9))
    for (const day of [9, 11, 16, 20]) must(e.complete(h.id, at(day)))
    expect(e.habitStreak(h.id, at(23))).toBe(2)
    must(e.complete(h.id, at(23))); must(e.complete(h.id, at(24)))
    expect(e.habitStreak(h.id, at(24))).toBe(3)
  })

  it('работа с днями', () => {
    expect(weekday(d(16))).toBe(1)
    expect(weekday(d(22))).toBe(7)
    expect(weekStart(d(22))).toBe(d(16))
    expect(addDays(d(30), 1)).toBe('2026-12-01')
    expect(dayOf(at(16, 23, 59))).toBe(d(16))
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30') // переход на летнее время в Европе
  })
})
