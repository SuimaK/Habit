import { describe, expect, it } from 'vitest'
import { loadState, playLeftSec } from '..'
import { at, d, engine } from './helpers'

describe('игры', () => {
  it('лимит времени блокирует новую партию; 0 — без лимита', () => {
    const e = engine()
    e.state.lives.count = 5
    expect(e.startGame(at(16, 10))).toBe(true)
    e.addPlayTime(20 * 60, at(16, 10))
    expect(e.gameBlock(at(16, 10))).toBe('limitReached')
    expect(e.startGame(at(16, 10))).toBe(false)
    expect(e.state.lives.count).toBe(4)
    e.setGameLimit(30)
    expect(playLeftSec(e.state.games, d(16))).toBe(600)
    e.setGameLimit(0)
    expect(e.gameBlock(at(16, 10))).toBeNull()
    e.setGameLimit(20)
    expect(e.gameBlock(at(17, 10))).toBeNull() // новый день
    e.addPlayTime(NaN, at(17))
    e.addPlayTime(-5, at(17))
    expect(e.state.games.playedByDay[d(17)]).toBeUndefined()
  })

  it('рекорд и бейдж «Гурман»', () => {
    const e = engine()
    expect(e.finishGame('snack', 40, at(16))).toEqual({ newRecord: true, record: 40, newBadges: [] })
    expect(e.finishGame('snack', 30, at(16)).newRecord).toBe(false)
    const r = e.finishGame('snack', 110, at(16))
    expect(r.newBadges).toContain('snack100')
    expect(e.state.coins).toBe(0) // монеты за игры не даются
  })

  it('рекорды игр раздельные; бейдж «Меткий глаз» за 500 в «Шариках»', () => {
    const e = engine()
    e.finishGame('snack', 300, at(16))
    expect(e.finishGame('bubbles', 120, at(16))).toEqual({ newRecord: true, record: 120, newBadges: [] })
    expect(e.finishGame('bubbles', 520, at(16)).newBadges).toContain('bubbles500')
    expect(e.state.games.records).toEqual({ snack: 300, bubbles: 520 })
  })

  it('loadState чистит игры', () => {
    const s = loadState({ habits: [], games: { records: { snack: 50.4, x: 9, blocks: -1 }, playedByDay: { [d(1)]: 30, bad: 5, [d(2)]: 'x' }, limitMin: 9999 } })
    expect(s.games).toEqual({ records: { snack: 50 }, playedByDay: { [d(1)]: 30 }, limitMin: 20 })
    expect(loadState({ habits: [] }).games.limitMin).toBe(20)
  })
})
