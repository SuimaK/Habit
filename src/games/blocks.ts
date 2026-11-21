/**
 * «Блоки» (ТЗ 3.6): падающие фигуры, заполненные линии исчезают.
 * Свой набор фигур разного размера (от 1 до 5 клеток) — ящики с урожаем.
 * Чистая логика без отрисовки.
 */
export const COLS = 8
export const ROWS = 14

export interface Cell {
  x: number
  y: number
}

/** Фигуры: клетки относительно центра поворота, значок и цвет ящика. */
export const PIECES = [
  { id: 'dot', cells: [[0, 0]], icon: '🍒', color: '#d4605a' },
  { id: 'duo', cells: [[0, 0], [1, 0]], icon: '🍓', color: '#e0726b' },
  { id: 'line3', cells: [[-1, 0], [0, 0], [1, 0]], icon: '🥕', color: '#e8893a' },
  { id: 'corner', cells: [[0, 0], [1, 0], [0, 1]], icon: '🍋', color: '#e2b84a' },
  { id: 'square', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], icon: '🥦', color: '#68a56d' },
  { id: 'tee', cells: [[-1, 0], [0, 0], [1, 0], [0, 1]], icon: '🍆', color: '#9a7bd1' },
  { id: 'plus', cells: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]], icon: '🫐', color: '#6f86d6' },
  { id: 'step', cells: [[-1, 0], [0, 0], [0, 1], [1, 1]], icon: '🍐', color: '#9bbf5a' },
  { id: 'hook', cells: [[-1, 0], [0, 0], [1, 0], [1, 1]], icon: '🍑', color: '#d9779c' },
] as const
export type PieceId = number // индекс в PIECES

export interface Active {
  piece: PieceId
  /** Клетки после поворотов (относительно центра). */
  cells: [number, number][]
  x: number
  y: number
}

export interface BlocksState {
  /** board[y][x] — индекс фигуры, из которой ящик, или null. */
  board: (PieceId | null)[][]
  active: Active
  next: PieceId
  score: number
  lines: number
  over: boolean
}

/** Очки за одновременно убранные линии (1, 2, 3 — выше трёх клеток фигур нет). */
export const LINE_POINTS = [0, 100, 250, 450]
export const DROP_POINT = 1 // за каждую клетку быстрого спуска
export const START_TICK_MS = 800
export const MIN_TICK_MS = 150
export const SPEEDUP = 0.93 // за каждую убранную линию

export const tickMs = (s: Pick<BlocksState, 'lines'>) => Math.max(MIN_TICK_MS, Math.round(START_TICK_MS * SPEEDUP ** s.lines))

const emptyBoard = () => Array.from({ length: ROWS }, () => Array<PieceId | null>(COLS).fill(null))

const randomPiece = (rnd: () => number): PieceId => Math.min(PIECES.length - 1, Math.floor(rnd() * PIECES.length))

function spawn(piece: PieceId): Active {
  const cells = PIECES[piece].cells.map(([x, y]) => [x, y] as [number, number])
  const minY = Math.min(...cells.map(([, y]) => y))
  return { piece, cells, x: Math.floor((COLS - 1) / 2), y: -minY }
}

export function cellsOf(a: Active): Cell[] {
  return a.cells.map(([x, y]) => ({ x: a.x + x, y: a.y + y }))
}

export function fits(board: BlocksState['board'], a: Active): boolean {
  return cellsOf(a).every(({ x, y }) => x >= 0 && x < COLS && y >= 0 && y < ROWS && board[y][x] === null)
}

export function newBlocks(rnd: () => number): BlocksState {
  return { board: emptyBoard(), active: spawn(randomPiece(rnd)), next: randomPiece(rnd), score: 0, lines: 0, over: false }
}

/** Сдвиг влево/вправо; если упёрлись — без изменений. */
export function move(s: BlocksState, dx: -1 | 1): BlocksState {
  if (s.over) return s
  const a = { ...s.active, x: s.active.x + dx }
  return fits(s.board, a) ? { ...s, active: a } : s
}

/** Поворот по часовой с небольшим «отскоком» от стен и ящиков. */
export function rotate(s: BlocksState): BlocksState {
  if (s.over || PIECES[s.active.piece].id === 'square' || s.active.cells.length === 1) return s
  const cells = s.active.cells.map(([x, y]) => [-y, x] as [number, number])
  // Сдвиг максимум на клетку вбок: фигура не «перепрыгивает» через стенку из ящиков.
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0]]) {
    const a = { ...s.active, cells, x: s.active.x + dx, y: s.active.y + dy }
    if (fits(s.board, a)) return { ...s, active: a }
  }
  return s
}

export interface LockResult {
  state: BlocksState
  cleared: number[] // номера убранных линий (до сдвига)
}

/** Фигура легла: впечатываем, убираем полные линии, выпускаем следующую. */
function lock(s: BlocksState, rnd: () => number): LockResult {
  const board = s.board.map((r) => [...r])
  for (const { x, y } of cellsOf(s.active)) board[y][x] = s.active.piece
  const cleared: number[] = []
  board.forEach((row, y) => row.every((c) => c !== null) && cleared.push(y))
  const kept = board.filter((_, y) => !cleared.includes(y))
  const fresh = Array.from({ length: cleared.length }, () => Array<PieceId | null>(COLS).fill(null))
  const nextBoard = [...fresh, ...kept]
  const points = LINE_POINTS[Math.min(cleared.length, LINE_POINTS.length - 1)]
  const active = spawn(s.next)
  const over = !fits(nextBoard, active)
  return {
    state: { board: nextBoard, active, next: randomPiece(rnd), score: s.score + points, lines: s.lines + cleared.length, over },
    cleared,
  }
}

/** Шаг вниз по таймеру: падает на клетку или ложится. */
export function tick(s: BlocksState, rnd: () => number): LockResult {
  if (s.over) return { state: s, cleared: [] }
  const a = { ...s.active, y: s.active.y + 1 }
  if (fits(s.board, a)) return { state: { ...s, active: a }, cleared: [] }
  return lock(s, rnd)
}

/** Где фигура окажется при сбросе (для подсказки-тени). */
export function landing(s: BlocksState): Active {
  let a = s.active
  while (fits(s.board, { ...a, y: a.y + 1 })) a = { ...a, y: a.y + 1 }
  return a
}

/** Сбросить вниз сразу: +1 очко за клетку. */
export function drop(s: BlocksState, rnd: () => number): LockResult {
  if (s.over) return { state: s, cleared: [] }
  const a = landing(s)
  const fall = a.y - s.active.y
  return lock({ ...s, active: a, score: s.score + fall * DROP_POINT }, rnd)
}
