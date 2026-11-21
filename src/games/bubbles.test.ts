import { describe, expect, it } from 'vitest'
import {
  COLS,
  R,
  ROWS,
  SHOTS_PER_ROW,
  START_ROWS,
  WIDTH,
  WIN_BONUS,
  clampAim,
  colorsOnBoard,
  colsIn,
  newBubbles,
  shoot,
  swap,
  trace,
  type BubblesState,
  type Cell,
} from './bubbles'

const UP = { x: 0, y: -1 }
const rnd = () => 0

function board(rows: Record<number, Record<number, number>>, extra: Partial<BubblesState> = {}): BubblesState {
  const grid: Cell[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = Array(COLS).fill(null)
    for (const [c, v] of Object.entries(rows[r] ?? {})) row[Number(c)] = v
    grid.push(row)
  }
  return { grid, shift: 0, current: 0, next: 0, score: 0, shotsSincePop: 0, over: false, won: false, ...extra }
}

describe('Шарики', () => {
  it('новая игра: 5 рядов, 4 цвета, текущий шарик есть на поле', () => {
    let seed = 1
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const s = newBubbles(r)
    for (let row = 0; row < ROWS; row++) {
      const filled = s.grid[row].slice(0, colsIn(s, row)).every((c) => c !== null)
      expect(filled).toBe(row < START_ROWS)
    }
    expect(colorsOnBoard(s).every((c) => c >= 0 && c < 4)).toBe(true)
    expect(colorsOnBoard(s)).toContain(s.current)
    expect(colorsOnBoard(s)).toContain(s.next)
  })

  it('три одного цвета лопаются', () => {
    const s = board({ 0: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 0, 6: 0, 7: 0, 8: 0 } }, { current: 1, next: 0 })
    const res = shoot(s, UP, rnd)
    expect(res.placed).toEqual({ row: 1, col: 3 })
    expect(res.popped).toHaveLength(3)
    expect(res.dropped).toHaveLength(0)
    expect(res.state.score).toBe(30)
    expect(res.state.grid[0][3]).toBeNull()
    expect(res.state.grid[0][4]).toBeNull()
    expect(res.state.grid[0][0]).toBe(0)
    expect(res.state.won).toBe(false)
  })

  it('оторвавшиеся падают и дают больше очков; пустое поле — победа', () => {
    const s = board({ 0: { 3: 1, 4: 1 }, 1: { 2: 2 } }, { current: 1, next: 2 })
    const res = shoot(s, UP, rnd)
    expect(res.popped).toHaveLength(3)
    expect(res.dropped).toEqual([[1, 2]])
    expect(res.state.score).toBe(50 + WIN_BONUS)
    expect(res.state.won).toBe(true)
    expect(res.state.over).toBe(true)
  })

  it('два одного цвета не лопаются, промах считается', () => {
    const s = board({ 0: { 4: 1 } }, { current: 1, next: 1 })
    const res = shoot(s, UP, rnd)
    expect(res.popped).toHaveLength(0)
    expect(res.state.shotsSincePop).toBe(1)
    expect(res.state.grid[1][3] ?? res.state.grid[1][4]).toBe(1)
  })

  it('шарик отскакивает от стены и не вылетает за поле', () => {
    const s = board({ 0: { 0: 0 } })
    const { path } = trace(s, clampAim(-1, -0.4))
    expect(path.length).toBeGreaterThan(2)
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(R - 1e-9)
      expect(p.x).toBeLessThanOrEqual(WIDTH - R + 1e-9)
    }
  })

  it('после 6 выстрелов без хлопка сверху добавляется ряд', () => {
    let s = board({ 0: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 } })
    const top = [...s.grid[0]]
    let added = false
    for (let i = 0; i < SHOTS_PER_ROW; i++) {
      s = { ...s, current: i % 2 ? 1 : 2 }
      const res = shoot(s, UP, rnd)
      added = res.rowAdded
      s = res.state
      if (i < SHOTS_PER_ROW - 1) expect(added).toBe(false)
    }
    expect(added).toBe(true)
    expect(s.shift).toBe(1)
    expect(s.grid[1]).toEqual(top)
    expect(s.grid[0].slice(0, colsIn(s, 0)).every((c) => c !== null)).toBe(true)
    expect(s.shotsSincePop).toBe(0)
  })

  it('добавленный ряд сохраняет сдвиг рядов (соседи не путаются)', () => {
    let s = board({ 0: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 } }, { shotsSincePop: SHOTS_PER_ROW - 1, current: 3 })
    s = shoot(s, UP, rnd).state
    // В сдвинутых рядах крайняя клетка всегда пустая.
    for (let r = 0; r < ROWS; r++) if (colsIn(s, r) < COLS) expect(s.grid[r][COLS - 1]).toBeNull()
  })

  it('шарик на последней линии — конец партии', () => {
    const rows: Record<number, Record<number, number>> = {}
    for (let r = 0; r < ROWS - 1; r++) {
      rows[r] = {}
      for (let c = 0; c < COLS; c++) rows[r][c] = r % 2
    }
    const s = board(rows, { current: 3, next: 0, shift: 0 })
    const res = shoot(s, UP, rnd)
    expect(res.placed.row).toBe(ROWS - 1)
    expect(res.state.over).toBe(true)
    expect(res.state.won).toBe(false)
  })

  it('новый ряд — из цветов, что есть на поле (не меньше трёх)', () => {
    let seed = 7
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let t = 0; t < 30; t++) {
      const s = board({ 0: { 0: 2, 1: 3, 7: 2, 8: 3 } }, { current: 4, next: 4, shotsSincePop: SHOTS_PER_ROW - 1 })
      const res = shoot(s, UP, r)
      expect(res.rowAdded).toBe(true)
      const fresh = res.state.grid[0].filter((c) => c !== null)
      // На поле 2, 3 и только что поставленный 4.
      expect(fresh.every((c) => c === 2 || c === 3 || c === 4)).toBe(true)
    }
    const two = board({ 0: { 0: 2, 8: 3 } }, { current: 2, next: 2, shotsSincePop: SHOTS_PER_ROW - 1 })
    const colors = new Set<number>()
    for (let t = 0; t < 30; t++) for (const c of shoot(two, { x: 0.3, y: -1 }, r).state.grid[0]) if (c !== null) colors.add(c)
    expect(colors.size).toBe(3)
  })

  it('поле по центру: пушка посередине, ряды упираются в обе стены', () => {
    expect(WIDTH).toBe(COLS * 2 * R)
  })

  it('прицел не уходит вниз и в горизонталь', () => {
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, 0], [-1, 0], [0, 1]]) {
      const a = clampAim(dx, dy)
      expect(a.y).toBeLessThan(-0.1)
    }
    const straight = clampAim(0, -1)
    expect(straight.x).toBeCloseTo(0)
  })

  it('следующий шарик — цвет, который есть на поле; swap меняет местами', () => {
    const s = board({ 0: { 0: 2, 8: 2 } }, { current: 2, next: 4 })
    const res = shoot(s, UP, () => 0.5)
    expect(colorsOnBoard(res.state)).toContain(res.state.current)
    expect(colorsOnBoard(res.state)).toContain(res.state.next)
    const w = swap(res.state)
    expect(w.current).toBe(res.state.next)
    expect(w.next).toBe(res.state.current)
  })
})
