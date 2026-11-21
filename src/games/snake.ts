/**
 * «Перекус» — змейка (ТЗ 3.6): собирает овощи и фрукты, фастфуд её укорачивает.
 * Чистая логика без отрисовки, чтобы её можно было проверить тестами.
 */
export const GRID = 15
export const GOOD = ['🥦', '🍎', '🥕', '🍓', '🥑', '🍌', '🫐', '🍐'] as const
export const JUNK = ['🍔', '🍟', '🍩'] as const
export const GOOD_POINTS = 10
export const JUNK_PENALTY = 5
/** Фастфуд укорачивает на столько клеток, но не короче MIN_LENGTH. */
export const JUNK_SHRINK = 2
export const MIN_LENGTH = 2
/** Сколько шагов фастфуд лежит на поле. */
export const JUNK_TTL = 40

export type Dir = 'up' | 'down' | 'left' | 'right'
export interface Cell {
  x: number
  y: number
}
export interface Food extends Cell {
  kind: 'good' | 'junk'
  icon: string
  /** Для фастфуда — сколько шагов ещё лежит. */
  ttl?: number
}
export interface SnakeState {
  snake: Cell[] // голова — первая
  dir: Dir
  /** Направление, выбранное игроком до следующего шага (не больше одного поворота за шаг). */
  queued: Dir[]
  foods: Food[]
  score: number
  eaten: number
  alive: boolean
  steps: number
}

const DELTA: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export function newGame(rnd: () => number): SnakeState {
  const mid = Math.floor(GRID / 2)
  const s: SnakeState = {
    snake: [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ],
    dir: 'right',
    queued: [],
    foods: [],
    score: 0,
    eaten: 0,
    alive: true,
    steps: 0,
  }
  s.foods.push(spawn(s, 'good', rnd)!)
  return s
}

/** Начальный шаг (мс), самый быстрый шаг и ускорение за каждый съеденный овощ или фрукт. */
export const START_TICK_MS = 230
export const MIN_TICK_MS = 90
export const SPEEDUP = 0.97

/** Тик в мс: каждый перекус ускоряет змейку на 3 %, плавно, до предела 90 мс. */
export const tickMs = (s: SnakeState) => Math.max(MIN_TICK_MS, Math.round(START_TICK_MS * SPEEDUP ** s.eaten))

/** Поворот: не больше двух в очереди, разворот назад игнорируется. */
export function turn(s: SnakeState, d: Dir): SnakeState {
  const last = s.queued.length ? s.queued[s.queued.length - 1] : s.dir
  if (d === last || d === OPPOSITE[last] || s.queued.length >= 2) return s
  return { ...s, queued: [...s.queued, d] }
}

function free(s: SnakeState, c: Cell) {
  return !s.snake.some((p) => p.x === c.x && p.y === c.y) && !s.foods.some((f) => f.x === c.x && f.y === c.y)
}

function spawn(s: SnakeState, kind: Food['kind'], rnd: () => number): Food | null {
  const cells: Cell[] = []
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (free(s, { x, y })) cells.push({ x, y })
  if (!cells.length) return null
  const c = cells[Math.floor(rnd() * cells.length)]
  const list = kind === 'good' ? GOOD : JUNK
  return { ...c, kind, icon: list[Math.floor(rnd() * list.length)], ...(kind === 'junk' ? { ttl: JUNK_TTL } : {}) }
}

export function step(prev: SnakeState, rnd: () => number): SnakeState {
  if (!prev.alive) return prev
  const [next, ...rest] = prev.queued
  const dir = next ?? prev.dir
  const d = DELTA[dir]
  const head = { x: prev.snake[0].x + d.x, y: prev.snake[0].y + d.y }
  const s: SnakeState = { ...prev, dir, queued: rest, steps: prev.steps + 1 }

  const food = prev.foods.find((f) => f.x === head.x && f.y === head.y)
  const grows = food?.kind === 'good'
  // Хвост уходит в этот же шаг, поэтому в клетку хвоста можно заходить (если не растём).
  const body = grows ? prev.snake : prev.snake.slice(0, -1)
  if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID || body.some((p) => p.x === head.x && p.y === head.y)) {
    return { ...s, alive: false }
  }
  let snake = [head, ...body]
  let foods = prev.foods
    .filter((f) => f !== food)
    .map((f) => (f.ttl !== undefined ? { ...f, ttl: f.ttl - 1 } : f))
    .filter((f) => f.ttl === undefined || f.ttl > 0)
  let score = prev.score
  let eaten = prev.eaten
  if (food?.kind === 'good') {
    score += GOOD_POINTS
    eaten++
  } else if (food?.kind === 'junk') {
    score = Math.max(0, score - JUNK_PENALTY)
    snake = snake.slice(0, Math.max(MIN_LENGTH, snake.length - JUNK_SHRINK))
  }
  const out: SnakeState = { ...s, snake, foods, score, eaten }
  if (!foods.some((f) => f.kind === 'good')) {
    const f = spawn(out, 'good', rnd)
    if (f) foods = [...foods, f]
  }
  // Фастфуд появляется изредка, после нескольких съеденных.
  if (eaten >= 2 && !foods.some((f) => f.kind === 'junk') && rnd() < 0.04) {
    const f = spawn({ ...out, foods }, 'junk', rnd)
    if (f) foods = [...foods, f]
  }
  return { ...out, foods }
}
