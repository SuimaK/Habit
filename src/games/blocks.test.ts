import { describe, expect, it } from 'vitest'
import { COLS, LINE_POINTS, PIECES, ROWS, START_TICK_MS, MIN_TICK_MS, cellsOf, drop, fits, landing, move, newBlocks, rotate, tick, tickMs, type BlocksState } from './blocks'

const pick = (id: string) => PIECES.findIndex((p) => p.id === id)
const rndFor = (id: string) => () => (pick(id) + 0.5) / PIECES.length

function withPiece(id: string, s: BlocksState = newBlocks(rndFor(id))): BlocksState {
  return { ...s, active: newBlocks(rndFor(id)).active }
}

describe('Блоки', () => {
  it('новая игра: пустое поле, фигура сверху по центру', () => {
    const s = newBlocks(rndFor('plus'))
    expect(s.board.flat().every((c) => c === null)).toBe(true)
    expect(Math.min(...cellsOf(s.active).map((c) => c.y))).toBe(0)
    expect(fits(s.board, s.active)).toBe(true)
    expect(s.over).toBe(false)
  })

  it('сдвиг упирается в стену', () => {
    let s = withPiece('line3')
    for (let i = 0; i < 20; i++) s = move(s, -1)
    expect(Math.min(...cellsOf(s.active).map((c) => c.x))).toBe(0)
    for (let i = 0; i < 20; i++) s = move(s, 1)
    expect(Math.max(...cellsOf(s.active).map((c) => c.x))).toBe(COLS - 1)
  })

  it('поворот у стены отскакивает внутрь; квадрат не крутится', () => {
    let s = withPiece('line3')
    s = rotate(s) // вертикально
    for (let i = 0; i < 20; i++) s = move(s, 1)
    s = { ...s, active: { ...s.active, y: 5 } }
    const r = rotate(s)
    expect(r).not.toBe(s)
    expect(cellsOf(r.active).every((c) => c.x >= 0 && c.x < COLS)).toBe(true)
    const sq = withPiece('square')
    expect(rotate(sq)).toBe(sq)
  })

  it('фигура падает по тикам и ложится на дно', () => {
    let s = withPiece('dot')
    for (let i = 0; i < ROWS - 1; i++) s = tick(s, rndFor('dot')).state
    expect(cellsOf(s.active)[0].y).toBe(ROWS - 1)
    const r = tick(s, rndFor('dot'))
    expect(r.state.board[ROWS - 1].filter((c) => c !== null)).toHaveLength(1)
    expect(cellsOf(r.state.active)[0].y).toBe(0) // новая фигура
  })

  it('сброс: +1 за клетку, тень совпадает с местом посадки', () => {
    const s = withPiece('dot')
    const land = landing(s)
    expect(cellsOf(land)[0].y).toBe(ROWS - 1)
    const r = drop(s, rndFor('dot'))
    expect(r.state.score).toBe(ROWS - 1)
  })

  it('полная линия исчезает, всё выше опускается', () => {
    let s = withPiece('dot')
    const board = s.board.map((r) => [...r])
    for (let x = 0; x < COLS; x++) if (x !== 3) board[ROWS - 1][x] = 0
    board[ROWS - 2][0] = 1
    s = { ...s, board, active: { ...s.active, x: 3 } }
    const r = drop(s, rndFor('dot'))
    expect(r.cleared).toEqual([ROWS - 1])
    expect(r.state.lines).toBe(1)
    expect(r.state.score).toBe(LINE_POINTS[1] + (ROWS - 1))
    expect(r.state.board[ROWS - 1][0]).toBe(1)
    expect(r.state.board[ROWS - 1].filter((c) => c !== null)).toHaveLength(1)
  })

  it('две линии за раз дают больше, чем по одной', () => {
    expect(LINE_POINTS[2]).toBeGreaterThan(2 * LINE_POINTS[1])
    let s = withPiece('square')
    const board = s.board.map((r) => [...r])
    for (const y of [ROWS - 1, ROWS - 2]) for (let x = 0; x < COLS; x++) if (x !== 3 && x !== 4) board[y][x] = 0
    s = { ...s, board, active: { ...s.active, x: 3 } }
    const r = drop(s, rndFor('dot'))
    expect(r.cleared).toHaveLength(2)
    expect(r.state.board.flat().every((c) => c === null)).toBe(true)
  })

  it('некуда выпустить фигуру — конец партии', () => {
    let s = withPiece('dot')
    const board = s.board.map((r) => [...r])
    for (let y = 1; y < ROWS; y++) board[y][s.active.x] = 0
    s = { ...s, board }
    const r = tick(s, rndFor('dot'))
    expect(r.state.over).toBe(true)
    expect(move(r.state, 1)).toBe(r.state)
    expect(tick(r.state, rndFor('dot')).state).toBe(r.state)
  })

  it('скорость растёт с линиями, но не быстрее предела', () => {
    expect(tickMs({ lines: 0 })).toBe(START_TICK_MS)
    expect(tickMs({ lines: 5 })).toBeLessThan(tickMs({ lines: 4 }))
    expect(tickMs({ lines: 500 })).toBe(MIN_TICK_MS)
  })

  it('все фигуры помещаются в поле при появлении и после поворотов', () => {
    for (const p of PIECES) {
      let s = withPiece(p.id)
      expect(fits(s.board, s.active)).toBe(true)
      for (let i = 0; i < 4; i++) {
        s = { ...s, active: { ...s.active, y: 6 } }
        s = rotate(s)
        expect(fits(s.board, s.active)).toBe(true)
      }
    }
  })
})
