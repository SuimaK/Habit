/**
 * «Грядка»: игра «в линию». Поле 9×9, на нём фрукты.
 * Ход — перенести один фрукт в свободную клетку, если туда есть путь
 * по свободным клеткам (вверх, вниз, влево, вправо).
 * Пять и больше одинаковых в ряд (по горизонтали, вертикали или диагонали) собираются.
 * Если ход ничего не собрал — на поле вырастают новые фрукты.
 * Поле заполнилось — партия окончена. Чистая логика без отрисовки.
 */
export const SIZE = 9
/** Фруктов на поле в начале партии. */
export const START_FRUITS = 5
/** Сколько вырастает после хода без сбора. */
export const SPAWN = 3
/** Минимальная длина ряда. */
export const MIN_LINE = 5

/** Виды — с разными значками, чтобы различать не только по цвету. */
export const FRUITS = [
  { color: '#e46f5a', icon: '🍓' },
  { color: '#e9b44c', icon: '🍋' },
  { color: '#63a36b', icon: '🥝' },
  { color: '#7b8ce0', icon: '🫐' },
  { color: '#d46fa8', icon: '🍇' },
  { color: '#e8893a', icon: '🍊' },
  { color: '#b08a66', icon: '🥥' },
] as const
export type FruitId = number // индекс в FRUITS
export type Cell = FruitId | null
export type Pos = [row: number, col: number]

export interface LinesState {
  grid: Cell[][] // grid[row][col]
  /** Что вырастет после следующего хода без сбора. */
  next: FruitId[]
  score: number
  over: boolean
}

/** Очки за собранные за раз фрукты: 5 → 10, 6 → 14, 7 → 22, 8 → 34, 9 → 50. */
export function pointsFor(n: number): number {
  if (n < MIN_LINE) return 0
  return 2 * n + 2 * (n - MIN_LINE) ** 2
}

const emptyGrid = (): Cell[][] => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null))
const randomFruit = (rnd: () => number): FruitId => Math.min(FRUITS.length - 1, Math.floor(rnd() * FRUITS.length))
const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

export function freeCells(grid: Cell[][]): Pos[] {
  const out: Pos[] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c] === null) out.push([r, c])
  return out
}

const rollNext = (rnd: () => number) => Array.from({ length: SPAWN }, () => randomFruit(rnd))

export function newLines(rnd: () => number): LinesState {
  const grid = emptyGrid()
  for (let i = 0; i < START_FRUITS; i++) {
    const free = freeCells(grid)
    const [r, c] = free[Math.min(free.length - 1, Math.floor(rnd() * free.length))]
    grid[r][c] = randomFruit(rnd)
  }
  // Стартовые фрукты в ряд не собираются: их всего пять, и такое совпадение — просто удача.
  return { grid, next: rollNext(rnd), score: 0, over: false }
}

/** Кратчайший путь по свободным клеткам (без диагоналей), включая начало и конец; null — не пройти. */
export function findPath(grid: Cell[][], from: Pos, to: Pos): Pos[] | null {
  const [fr, fc] = from
  const [tr, tc] = to
  if (!inside(fr, fc) || !inside(tr, tc)) return null
  if (grid[tr][tc] !== null) return null
  if (fr === tr && fc === tc) return null
  const prev = new Map<number, number>()
  const key = (r: number, c: number) => r * SIZE + c
  const start = key(fr, fc)
  prev.set(start, -1)
  const queue: number[] = [start]
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]
    const r = Math.floor(k / SIZE)
    const c = k % SIZE
    if (r === tr && c === tc) {
      const path: Pos[] = []
      for (let x = k; x !== -1; x = prev.get(x)!) path.push([Math.floor(x / SIZE), x % SIZE])
      return path.reverse()
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr
      const nc = c + dc
      if (!inside(nr, nc) || grid[nr][nc] !== null) continue
      const nk = key(nr, nc)
      if (prev.has(nk)) continue
      prev.set(nk, k)
      queue.push(nk)
    }
  }
  return null
}

const DIRS: Pos[] = [[0, 1], [1, 0], [1, 1], [1, -1]]

/** Клетки, которые собираются вокруг (r, c): все ряды длиной от MIN_LINE через эту клетку. */
export function linesThrough(grid: Cell[][], r: number, c: number): Pos[] {
  const v = grid[r][c]
  if (v === null) return []
  const out: Pos[] = []
  for (const [dr, dc] of DIRS) {
    const run: Pos[] = [[r, c]]
    for (const sign of [1, -1]) {
      let nr = r + dr * sign
      let nc = c + dc * sign
      while (inside(nr, nc) && grid[nr][nc] === v) {
        run.push([nr, nc])
        nr += dr * sign
        nc += dc * sign
      }
    }
    if (run.length >= MIN_LINE) out.push(...run)
  }
  return out
}

/** Убрать собранные ряды через указанные клетки. Возвращает убранные клетки (без повторов). */
function harvest(grid: Cell[][], at: Pos[]): { cells: Pos[]; fruits: FruitId[] } {
  const seen = new Set<number>()
  const cells: Pos[] = []
  for (const [r, c] of at) {
    const found = linesThrough(grid, r, c)
    for (const [fr, fc] of found) {
      const k = fr * SIZE + fc
      if (seen.has(k)) continue
      seen.add(k)
      cells.push([fr, fc])
    }
  }
  const fruits = cells.map(([r, c]) => grid[r][c] as FruitId)
  for (const [r, c] of cells) grid[r][c] = null
  return { cells, fruits }
}

export interface MoveResult {
  state: LinesState
  /** Путь фрукта, включая начало и конец. */
  path: Pos[]
  /** Собранные клетки (после хода или после того, как выросли новые). */
  cleared: Pos[]
  clearedFruits: FruitId[]
  /** Где выросли новые фрукты. */
  spawned: Pos[]
  points: number
}

/** Ход: перенести фрукт. null — ход невозможен (нет фрукта, клетка занята, нет пути). */
export function move(s: LinesState, from: Pos, to: Pos, rnd: () => number): MoveResult | null {
  if (s.over) return null
  const [fr, fc] = from
  if (!inside(fr, fc) || s.grid[fr][fc] === null) return null
  const path = findPath(s.grid, from, to)
  if (!path) return null
  const grid = s.grid.map((row) => row.slice())
  const [tr, tc] = to
  grid[tr][tc] = grid[fr][fc]
  grid[fr][fc] = null

  let score = s.score
  let next = s.next
  const spawned: Pos[] = []
  const grow = () => {
    for (const f of next) {
      const free = freeCells(grid)
      if (!free.length) break
      const [r, c] = free[Math.min(free.length - 1, Math.floor(rnd() * free.length))]
      grid[r][c] = f
      spawned.push([r, c])
    }
    next = rollNext(rnd)
  }
  let got = harvest(grid, [to])
  if (got.cells.length) {
    score += pointsFor(got.cells.length)
    // Собрали всё до последнего — сразу растут новые, иначе ходить нечем.
    if (freeCells(grid).length === SIZE * SIZE) grow()
  } else {
    // Ничего не собрали — растут новые; если они сами встали в ряд, тоже собираются.
    grow()
    got = harvest(grid, spawned)
    score += pointsFor(got.cells.length)
  }
  const over = freeCells(grid).length === 0
  return {
    state: { grid, next, score, over },
    path,
    cleared: got.cells,
    clearedFruits: got.fruits,
    spawned: spawned.filter(([r, c]) => grid[r][c] !== null),
    points: score - s.score,
  }
}

/** Есть ли у фрукта хоть одна свободная соседняя клетка (иначе его не сдвинуть). */
export function canMove(grid: Cell[][], [r, c]: Pos): boolean {
  if (grid[r]?.[c] == null) return false
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => inside(r + dr, c + dc) && grid[r + dr][c + dc] === null)
}
