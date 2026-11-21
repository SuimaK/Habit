import { describe, expect, it } from 'vitest'
import { FRUITS, SIZE, SPAWN, START_FRUITS, canMove, findPath, freeCells, linesThrough, move, newLines, pointsFor, type Cell, type LinesState } from './lines'

const rnd = () => 0

function grid(cells: [number, number, number][]): Cell[][] {
  const g: Cell[][] = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null))
  for (const [r, c, v] of cells) g[r][c] = v
  return g
}
const state = (cells: [number, number, number][], extra: Partial<LinesState> = {}): LinesState => ({ grid: grid(cells), next: [1, 2, 3], score: 0, over: false, ...extra })
const count = (g: Cell[][]) => SIZE * SIZE - freeCells(g).length

describe('«Грядка»', () => {
  it('новая партия: пять фруктов и три следующих', () => {
    let i = 0
    const s = newLines(() => ((i++ * 0.37) % 1))
    expect(count(s.grid)).toBe(START_FRUITS)
    expect(s.next).toHaveLength(SPAWN)
    expect(s.next.every((f) => f >= 0 && f < FRUITS.length)).toBe(true)
    expect(s.score).toBe(0)
    expect(s.over).toBe(false)
  })

  it('очки растут с длиной ряда', () => {
    expect([4, 5, 6, 7, 8, 9].map(pointsFor)).toEqual([0, 10, 14, 22, 34, 50])
  })

  it('путь обходит фрукты и не идёт по диагонали', () => {
    // Стена в столбце 1, кроме нижней клетки.
    const g = grid(Array.from({ length: SIZE - 1 }, (_, r) => [r, 1, 0] as [number, number, number]))
    const p = findPath(g, [0, 0], [0, 2])!
    expect(p[0]).toEqual([0, 0])
    expect(p[p.length - 1]).toEqual([0, 2])
    expect(p).toContainEqual([SIZE - 1, 1])
    for (let i = 1; i < p.length; i++) expect(Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1])).toBe(1)
    // Кратчайший: вниз 8, вправо 2, вверх 8.
    expect(p).toHaveLength(19)
  })

  it('в закрытую клетку и в занятую не пройти', () => {
    const g = grid([[0, 1, 0], [1, 0, 0], [5, 5, 1]])
    expect(findPath(g, [5, 5], [0, 0])).toBeNull()
    expect(findPath(g, [5, 5], [0, 1])).toBeNull()
    expect(move(state([[0, 1, 0], [1, 0, 0], [5, 5, 1]]), [5, 5], [0, 0], rnd)).toBeNull()
    expect(move(state([[5, 5, 1]]), [4, 4], [0, 0], rnd)).toBeNull() // в клетке нет фрукта
  })

  it('пять в ряд собираются во всех направлениях', () => {
    const row = grid([0, 1, 2, 3, 4].map((c) => [3, c, 2] as [number, number, number]))
    expect(linesThrough(row, 3, 2)).toHaveLength(5)
    const col = grid([0, 1, 2, 3, 4].map((r) => [r, 6, 2] as [number, number, number]))
    expect(linesThrough(col, 4, 6)).toHaveLength(5)
    const diag = grid([0, 1, 2, 3, 4].map((i) => [i, i, 2] as [number, number, number]))
    expect(linesThrough(diag, 0, 0)).toHaveLength(5)
    const anti = grid([0, 1, 2, 3, 4].map((i) => [i, 8 - i, 2] as [number, number, number]))
    expect(linesThrough(anti, 2, 6)).toHaveLength(5)
    const four = grid([0, 1, 2, 3].map((c) => [3, c, 2] as [number, number, number]))
    expect(linesThrough(four, 3, 0)).toEqual([])
  })

  it('ход, который собрал ряд: фрукты убраны, очки начислены, новые не выросли', () => {
    const s = state([[3, 0, 2], [3, 1, 2], [3, 2, 2], [3, 3, 2], [8, 4, 2], [0, 8, 5]])
    const res = move(s, [8, 4], [3, 4], rnd)!
    expect(res.cleared).toHaveLength(5)
    expect(res.points).toBe(10)
    expect(res.state.score).toBe(10)
    expect(res.spawned).toEqual([])
    expect(count(res.state.grid)).toBe(1)
    expect(res.state.next).toEqual(s.next) // очередь не тронута
  })

  it('уголок из двух рядов собирается целиком', () => {
    const cells: [number, number, number][] = [
      [4, 0, 1], [4, 1, 1], [4, 2, 1], [4, 3, 1],
      [0, 4, 1], [1, 4, 1], [2, 4, 1], [3, 4, 1],
      [8, 8, 1], [0, 0, 6],
    ]
    const res = move(state(cells), [8, 8], [4, 4], rnd)!
    expect(res.cleared).toHaveLength(9)
    expect(res.points).toBe(pointsFor(9))
    expect(count(res.state.grid)).toBe(1)
  })

  it('ход без сбора: вырастают три новых из очереди, очередь обновляется', () => {
    const s = state([[0, 0, 4]], { next: [1, 2, 3] })
    const res = move(s, [0, 0], [8, 8], rnd)!
    expect(res.cleared).toEqual([])
    expect(res.spawned).toHaveLength(3)
    expect(res.spawned.map(([r, c]) => res.state.grid[r][c])).toEqual([1, 2, 3])
    expect(count(res.state.grid)).toBe(4)
    expect(res.state.next).toEqual([0, 0, 0])
    expect(s.grid[0][0]).toBe(4) // исходное состояние не меняется
  })

  it('выросшие фрукты тоже собираются, если встали в ряд', () => {
    // rnd = 0 — новый фрукт встаёт в первую свободную клетку, это (0, 4).
    const s = state([[0, 0, 3], [0, 1, 3], [0, 2, 3], [0, 3, 3], [8, 8, 6]], { next: [3, 1, 1] })
    const res = move(s, [8, 8], [8, 7], rnd)!
    expect(res.cleared).toHaveLength(5)
    expect(res.points).toBe(10)
    expect(res.state.grid[0][0]).toBeNull()
  })

  it('собрали последнее — сразу вырастают новые', () => {
    const s = state([[3, 0, 2], [3, 1, 2], [3, 2, 2], [3, 3, 2], [8, 4, 2]])
    const res = move(s, [8, 4], [3, 4], rnd)!
    expect(res.cleared).toHaveLength(5)
    expect(res.spawned).toHaveLength(3)
    expect(count(res.state.grid)).toBe(3)
  })

  it('поле заполнилось — партия окончена, ходить больше нельзя', () => {
    // Всё занято, кроме трёх клеток; виды по шахматке, рядов нет.
    const cells: [number, number, number][] = []
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!(r === 8 && c >= 6)) cells.push([r, c, (r * 2 + c) % 5])
    const s = state(cells, { next: [5, 6, 5] })
    const res = move(s, [8, 5], [8, 8], rnd)!
    expect(res.state.over).toBe(true)
    expect(freeCells(res.state.grid)).toHaveLength(0)
    expect(move(res.state, [0, 0], [8, 8], rnd)).toBeNull()
  })

  it('canMove: фрукт без свободных соседей сдвинуть нельзя', () => {
    const g = grid([[0, 0, 1], [0, 1, 2], [1, 0, 3]])
    expect(canMove(g, [0, 0])).toBe(false)
    expect(canMove(g, [0, 1])).toBe(true)
    expect(canMove(g, [5, 5])).toBe(false)
  })
})
