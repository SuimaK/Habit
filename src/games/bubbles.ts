/**
 * «Шарики» (ТЗ 3.6): стреляем шариком, 3 и больше одного цвета лопаются,
 * оторвавшиеся от верха падают. Чистая логика без отрисовки.
 *
 * Координаты в радиусах шарика: R = 1. Сетка «соты»: в нечётных (с учётом сдвига) рядах — сдвиг вправо на 1.
 */
export const COLS = 9
export const ROWS = 13 // ряд 12 — линия проигрыша
export const R = 1
export const ROW_H = Math.sqrt(3) * R
export const WIDTH = COLS * 2 * R + R
export const HEIGHT = (ROWS - 1) * ROW_H + 2 * R + 3 * R // поле + место для пушки
export const SHOOTER = { x: WIDTH / 2, y: HEIGHT - 1.5 * R }
export const START_ROWS = 5
/** Через столько выстрелов без хлопка сверху добавляется ряд. */
export const SHOTS_PER_ROW = 6
export const POP_POINTS = 10
export const DROP_POINTS = 20
/** Бонус за полностью очищенное поле. */
export const WIN_BONUS = 200

/** Цвета — с разными значками, чтобы различать не только по цвету. */
export const COLORS = [
  { color: '#e46f5a', icon: '🍅' },
  { color: '#e9b44c', icon: '🍋' },
  { color: '#63a36b', icon: '🥝' },
  { color: '#7b8ce0', icon: '🫐' },
  { color: '#d46fa8', icon: '🍇' },
] as const
export type ColorId = number // индекс в COLORS
export type Cell = ColorId | null

export interface BubblesState {
  grid: Cell[][] // grid[row][col]
  /** Чётность сдвига: меняется при добавлении ряда сверху. */
  shift: number
  current: ColorId
  next: ColorId
  score: number
  shotsSincePop: number
  over: boolean
  won: boolean
}

export interface Point {
  x: number
  y: number
}

export const isOffset = (s: Pick<BubblesState, 'shift'>, row: number) => (row + s.shift) % 2 === 1
/** В сдвинутом ряду последняя клетка не помещается. */
export const colsIn = (s: Pick<BubblesState, 'shift'>, row: number) => (isOffset(s, row) ? COLS - 1 : COLS)

export function center(s: Pick<BubblesState, 'shift'>, row: number, col: number): Point {
  return { x: R + col * 2 * R + (isOffset(s, row) ? R : 0), y: R + row * ROW_H }
}

function neighbors(s: Pick<BubblesState, 'shift'>, row: number, col: number): [number, number][] {
  const off = isOffset(s, row)
  const d = off
    ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
    : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
  return d
    .map(([dr, dc]) => [row + dr, col + dc] as [number, number])
    .filter(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < colsIn(s, r))
}

const emptyRow = (): Cell[] => Array(COLS).fill(null)

function randomRow(s: Pick<BubblesState, 'shift'>, row: number, rnd: () => number, colors: number): Cell[] {
  const r = emptyRow()
  for (let c = 0; c < colsIn(s, row); c++) r[c] = Math.floor(rnd() * colors)
  return r
}

/** Цвета, которые ещё есть на поле (в них и стреляем). */
export function colorsOnBoard(s: BubblesState): ColorId[] {
  const set = new Set<number>()
  for (const row of s.grid) for (const c of row) if (c !== null) set.add(c)
  return [...set]
}

function pickColor(s: BubblesState, rnd: () => number): ColorId {
  const on = colorsOnBoard(s)
  const list = on.length ? on : COLORS.map((_, i) => i)
  return list[Math.floor(rnd() * list.length)]
}

export function newBubbles(rnd: () => number): BubblesState {
  const s: BubblesState = { grid: [], shift: 0, current: 0, next: 0, score: 0, shotsSincePop: 0, over: false, won: false }
  for (let r = 0; r < ROWS; r++) s.grid.push(r < START_ROWS ? randomRow(s, r, rnd, 4) : emptyRow())
  s.current = pickColor(s, rnd)
  s.next = pickColor(s, rnd)
  return s
}

/** Угол выстрела ограничен, чтобы не стрелять горизонтально. dx, dy — направление от пушки. */
export function clampAim(dx: number, dy: number): Point {
  let a = Math.atan2(dy, dx) // вверх — около −π/2
  const min = -Math.PI + 0.15
  const max = -0.15
  if (a > 0) a = dx >= 0 ? max : min
  a = Math.min(max, Math.max(min, a))
  return { x: Math.cos(a), y: Math.sin(a) }
}

/** Траектория до остановки: точки для анимации и клетка, куда встанет шарик. */
export function trace(s: BubblesState, dir: Point): { path: Point[]; row: number; col: number } {
  const len = Math.hypot(dir.x, dir.y) || 1
  let vx = dir.x / len
  const vy = dir.y / len
  let x = SHOOTER.x
  let y = SHOOTER.y
  const path: Point[] = [{ x, y }]
  const STEP = 0.2
  for (let i = 0; i < 4000; i++) {
    x += vx * STEP
    y += vy * STEP
    if (x < R) {
      x = 2 * R - x
      vx = -vx
      path.push({ x, y })
    } else if (x > WIDTH - R) {
      x = 2 * (WIDTH - R) - x
      vx = -vx
      path.push({ x, y })
    }
    let hit = y <= R
    if (!hit) {
      outer: for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < colsIn(s, r); c++) {
          if (s.grid[r][c] === null) continue
          const p = center(s, r, c)
          if (Math.hypot(p.x - x, p.y - y) < 1.8 * R) {
            hit = true
            break outer
          }
        }
    }
    if (hit) {
      const cell = snap(s, { x, y })
      path.push(center(s, cell.row, cell.col))
      return { path, ...cell }
    }
  }
  const cell = snap(s, { x, y })
  return { path: [...path, center(s, cell.row, cell.col)], ...cell }
}

/** Ближайшая пустая клетка, которая держится за верх или за соседа. */
function snap(s: BubblesState, p: Point): { row: number; col: number } {
  let best = { row: 0, col: 0 }
  let bestD = Infinity
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < colsIn(s, r); c++) {
      if (s.grid[r][c] !== null) continue
      const attached = r === 0 || neighbors(s, r, c).some(([nr, nc]) => s.grid[nr][nc] !== null)
      if (!attached) continue
      const q = center(s, r, c)
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < bestD) {
        bestD = d
        best = { row: r, col: c }
      }
    }
  return best
}

function group(s: BubblesState, row: number, col: number, sameColor: boolean): [number, number][] {
  const color = s.grid[row][col]
  const seen = new Set<string>([`${row},${col}`])
  const out: [number, number][] = [[row, col]]
  for (let i = 0; i < out.length; i++) {
    for (const [r, c] of neighbors(s, out[i][0], out[i][1])) {
      const k = `${r},${c}`
      if (seen.has(k) || s.grid[r][c] === null || (sameColor && s.grid[r][c] !== color)) continue
      seen.add(k)
      out.push([r, c])
    }
  }
  return out
}

export interface ShotResult {
  state: BubblesState
  path: Point[]
  placed: { row: number; col: number }
  popped: [number, number][]
  dropped: [number, number][]
  rowAdded: boolean
}

/** Выстрел текущим шариком в направлении dir. */
export function shoot(prev: BubblesState, dir: Point, rnd: () => number): ShotResult {
  const { path, row, col } = trace(prev, dir)
  const s: BubblesState = { ...prev, grid: prev.grid.map((r) => [...r]) }
  s.grid[row][col] = prev.current
  let popped: [number, number][] = []
  const dropped: [number, number][] = []
  const same = group(s, row, col, true)
  if (same.length >= 3) {
    popped = same
    for (const [r, c] of same) s.grid[r][c] = null
    // Всё, что не держится за верхний ряд, падает.
    const held = new Set<string>()
    for (let c = 0; c < colsIn(s, 0); c++)
      if (s.grid[0][c] !== null) for (const [r, cc] of group(s, 0, c, false)) held.add(`${r},${cc}`)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < colsIn(s, r); c++)
        if (s.grid[r][c] !== null && !held.has(`${r},${c}`)) {
          dropped.push([r, c])
          s.grid[r][c] = null
        }
    s.score += popped.length * POP_POINTS + dropped.length * DROP_POINTS
    s.shotsSincePop = 0
  } else {
    s.shotsSincePop++
  }

  let rowAdded = false
  if (colorsOnBoard(s).length === 0) {
    s.won = true
    s.over = true
    s.score += WIN_BONUS
  } else {
    if (s.shotsSincePop >= SHOTS_PER_ROW) {
      // Новый ряд сверху: всё сдвигается вниз, чётность меняется.
      s.shift = (s.shift + 1) % 2
      const fresh = randomRow(s, 0, rnd, Math.max(3, colorsOnBoard(s).length))
      s.grid = [fresh, ...s.grid.slice(0, ROWS - 1)]
      // В сдвинутых рядах лишняя крайняя клетка не используется.
      for (let r = 0; r < ROWS; r++) if (colsIn(s, r) < COLS) s.grid[r][COLS - 1] = null
      s.shotsSincePop = 0
      rowAdded = true
    }
    if (s.grid[ROWS - 1].some((c) => c !== null)) s.over = true
  }
  s.current = prev.next
  if (!colorsOnBoard(s).includes(s.current) && colorsOnBoard(s).length) s.current = pickColor(s, rnd)
  s.next = pickColor(s, rnd)
  return { state: s, path, placed: { row, col }, popped, dropped, rowAdded }
}

/** Поменять текущий и следующий шарик местами. */
export const swap = (s: BubblesState): BubblesState => ({ ...s, current: s.next, next: s.current })
