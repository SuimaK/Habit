import { describe, expect, it } from 'vitest'
import { initialLives, nextBoundary, refreshLives } from '..'
import { at, engine, must } from './helpers'

describe('жизни', () => {
  it('на старте 3', () => {
    expect(refreshLives(initialLives(), at(16, 10)).count).toBe(3)
  })

  it('обновляются в 06:00 один раз в день', () => {
    let l = refreshLives(initialLives(), at(16, 10))
    l = { ...l, count: 0 }
    l = refreshLives(l, at(17, 5, 59))
    expect(l.count).toBe(0)
    l = refreshLives(l, at(17, 6))
    expect(l.count).toBe(3)
    l = refreshLives({ ...l, count: 1 }, at(17, 23))
    expect(l.count).toBe(1)
  })

  it('бесплатно не больше 5', () => {
    let l = refreshLives(initialLives(), at(16, 10))
    l = refreshLives(l, at(17, 7))
    expect(l.count).toBe(5)
    l = refreshLives(l, at(20, 7))
    expect(l.count).toBe(5)
  })

  it('несколько дней без захода', () => {
    let l = refreshLives({ count: 0, lastRefresh: null }, at(16, 10))
    l = refreshLives(l, at(19, 10))
    expect(l.count).toBe(5)
  })

  it('купленные сверх лимита не сгорают', () => {
    const e = engine()
    e.startOfDay(at(16, 10))
    e.state.coins = 60
    must(e.buyLives('five'))
    expect(e.state.lives.count).toBe(8)
    e.startOfDay(at(17, 10))
    expect(e.state.lives.count).toBe(8)
  })

  it('следующее обновление', () => {
    expect(nextBoundary(at(16, 3))).toEqual(at(16, 6))
    expect(nextBoundary(at(16, 6))).toEqual(at(17, 6))
  })
})
