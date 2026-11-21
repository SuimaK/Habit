import { describe, expect, it } from 'vitest'
import { validateHabit } from './core'
import { fromTemplate, LIBRARY, suggestStarter, type Answers } from './library'

const base: Answers = { focus: ['nutrition', 'workout', 'meditation'], level: 'beginner', minutesPerDay: 20, timeOfDay: 'morning' }

describe('библиотека привычек', () => {
  it('все шаблоны валидны и ключи уникальны', () => {
    for (const t of LIBRARY) expect(validateHabit(fromTemplate(t))).toBeNull()
    expect(new Set(LIBRARY.map((t) => t.key)).size).toBe(LIBRARY.length)
  })

  it('стартовый набор — 3 разные привычки, по одной на каждое выбранное направление', () => {
    const s = suggestStarter(base)
    expect(s).toHaveLength(3)
    expect(new Set(s).size).toBe(3)
    expect(new Set(s.map((t) => t.category))).toEqual(new Set(['nutrition', 'workout', 'meditation']))
  })

  it('учитывает уровень и не превышает время', () => {
    for (const level of ['beginner', 'some', 'regular'] as const) {
      for (const minutesPerDay of [10, 20, 40] as const) {
        const s = suggestStarter({ ...base, level, minutesPerDay })
        expect(s).toHaveLength(3)
        s.forEach((t) => expect(t.level).toContain(level))
        expect(s.reduce((m, t) => m + t.minutes, 0)).toBeLessThanOrEqual(minutesPerDay + 3)
      }
    }
  })

  it('одно направление — все три привычки из него', () => {
    const s = suggestStarter({ ...base, focus: ['meditation'], level: 'some', minutesPerDay: 40 })
    expect(s).toHaveLength(3)
    expect(s.every((t) => t.category === 'meditation')).toBe(true)
  })

  it('без выбранного направления — подбирает из всех', () => {
    expect(suggestStarter({ ...base, focus: [] })).toHaveLength(3)
  })
})
