import { describe, expect, it } from 'vitest'
import { MIN_TICK_MS, START_TICK_MS, tickMs, GOOD_POINTS, GRID, MIN_LENGTH, newGame, step, turn, type SnakeState } from './snake'

const rnd = () => 0.5
const at = (s: SnakeState, foods: SnakeState['foods']): SnakeState => ({ ...s, foods })

describe('Перекус', () => {
  it('едет вправо и растёт от овощей', () => {
    let s = newGame(rnd)
    const head = s.snake[0]
    s = at(s, [{ x: head.x + 1, y: head.y, kind: 'good', icon: '🥕' }])
    s = step(s, rnd)
    expect(s.snake).toHaveLength(4)
    expect(s.score).toBe(GOOD_POINTS)
    expect(s.foods.some((f) => f.kind === 'good')).toBe(true)
  })

  it('фастфуд укорачивает, но не короче минимума, и снимает очки', () => {
    let s = newGame(rnd)
    const h = s.snake[0]
    s = { ...at(s, [{ x: h.x + 1, y: h.y, kind: 'junk', icon: '🍔', ttl: 10 }, { x: 0, y: 0, kind: 'good', icon: '🍎' }]), score: 3 }
    s = step(s, rnd)
    expect(s.alive).toBe(true)
    expect(s.snake).toHaveLength(MIN_LENGTH)
    expect(s.score).toBe(0)
  })

  it('стена и собственный хвост — конец; разворот назад игнорируется', () => {
    let s = newGame(rnd)
    expect(turn(s, 'left')).toBe(s)
    for (let i = 0; i < GRID; i++) s = step(at(s, [{ x: 0, y: 0, kind: 'good', icon: '🍎' }]), rnd)
    expect(s.alive).toBe(false)
    // Петля в себя.
    let t: SnakeState = { ...newGame(rnd), snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }], foods: [{ x: 0, y: 0, kind: 'good', icon: '🍎' }] }
    t = turn(t, 'down')
    t = step(t, rnd)
    expect(t.alive).toBe(false)
  })

  it('в клетку уходящего хвоста заходить можно', () => {
    let t: SnakeState = { ...newGame(rnd), dir: 'up', snake: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }], foods: [{ x: 0, y: 0, kind: 'good', icon: '🍎' }] }
    t = turn(t, 'left')
    t = step(t, rnd)
    expect(t.alive).toBe(true)
  })

  it('скорость нарастает постепенно', () => {
    const g = newGame(rnd)
    const ticks = [0, 1, 2, 5, 10, 20, 40, 100].map((eaten) => tickMs({ ...g, eaten }))
    expect(ticks[0]).toBe(START_TICK_MS)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeLessThanOrEqual(ticks[i - 1])
    // Каждый шаг ускорения небольшой — не больше 10 мс.
    for (let e = 0; e < 60; e++) expect(tickMs({ ...g, eaten: e }) - tickMs({ ...g, eaten: e + 1 })).toBeLessThanOrEqual(10)
    expect(tickMs({ ...g, eaten: 100 })).toBe(MIN_TICK_MS)
  })
})
