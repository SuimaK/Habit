import { describe, expect, it } from 'vitest'
import { needs, type Completion, type Habit } from '..'
import { d, habit } from './helpers'

const done = (h: Habit, day: number): Completion => ({ habitId: h.id, day: d(day), xp: 0, coins: 0 })

describe('шкалы-потребности', () => {
  it('считают выполнения направления за 7 дней с максимумом 10/30/10', () => {
    const w: Habit = { ...habit(), category: 'workout' }
    const n: Habit = { ...habit(), category: 'nutrition' }
    const m: Habit = { ...habit(), category: 'meditation' }
    const completions = [
      ...[10, 14, 15, 16, 17, 18, 19, 20].map((x) => done(w, x)), // 10-е вне окна → 7
      ...Array.from({ length: 35 }, () => done(n, 18)), // упирается в 30
      done(m, 20),
      done(m, 21), // завтра — не считается
    ]
    const [sila, energy, zen] = needs([w, n, m], completions, d(20))
    expect(sila).toMatchObject({ label: 'Сила', value: 7, max: 10, sad: false })
    expect(energy).toMatchObject({ label: 'Энергия', value: 30, max: 30, sad: false })
    expect(zen).toMatchObject({ label: 'Дзен', value: 1, max: 10, sad: true })
  })

  it('грусть ниже 30% максимума', () => {
    const n: Habit = { ...habit(), category: 'nutrition' }
    const at = (k: number) => needs([n], Array.from({ length: k }, () => done(n, 20)), d(20))[1].sad
    expect(at(8)).toBe(true) // 8 < 9
    expect(at(9)).toBe(false)
  })
})
