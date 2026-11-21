import { describe, expect, it } from 'vitest'
import { loadState } from '..'
import { at, d, engine, err, must } from './helpers'

describe('личные награды', () => {
  it('добавление с проверкой имени и цены', () => {
    const e = engine()
    expect(err(e.addReward({ id: 'r', name: '  ', price: 10 }))).toBe('emptyName')
    expect(err(e.addReward({ id: 'r', name: 'Сериал', price: 0 }))).toBe('badPrice')
    expect(err(e.addReward({ id: 'r', name: 'Сериал', price: 1.5 }))).toBe('badPrice')
    expect(err(e.addReward({ id: 'r', name: 'Сериал', price: 100_001 }))).toBe('badPrice')
    must(e.addReward({ id: 'r', name: ' Сериал вечером ', price: 100 }))
    expect(e.state.rewards).toEqual([{ id: 'r', name: 'Сериал вечером', price: 100 }])
  })

  it('взять: списывает монеты, пишет историю; не хватает — ошибка; отмена в тот же день', () => {
    const e = engine()
    must(e.addReward({ id: 'r', name: 'Сериал', price: 100 }))
    e.state.coins = 90
    expect(err(e.redeemReward('r', 'x1', at(16)))).toBe('notEnoughCoins')
    e.state.coins = 150
    const red = must(e.redeemReward('r', 'x1', at(16)))
    expect(red).toEqual({ id: 'x1', rewardId: 'r', name: 'Сериал', price: 100, day: d(16) })
    expect(e.state.coins).toBe(50)
    expect(err(e.cancelRedemption('x1', at(17)))).toBe('tooLate')
    must(e.cancelRedemption('x1', at(16, 23)))
    expect(e.state.coins).toBe(150)
    expect(e.state.redemptions).toEqual([])
  })

  it('правка не меняет историю; удаление взятой награды только скрывает её', () => {
    const e = engine()
    must(e.addReward({ id: 'r', name: 'Сериал', price: 100 }))
    must(e.addReward({ id: 'q', name: 'Кофе', price: 30 }))
    e.state.coins = 200
    must(e.redeemReward('r', 'x1', at(16)))
    must(e.updateReward({ id: 'r', name: 'Кино', price: 120 }))
    expect(e.state.redemptions[0]).toMatchObject({ name: 'Сериал', price: 100 })
    e.removeReward('r')
    e.removeReward('q')
    expect(e.state.rewards).toEqual([{ id: 'r', name: 'Кино', price: 120, archived: true }])
    expect(err(e.redeemReward('r', 'x2', at(16)))).toBe('notFound')
    expect(err(e.updateReward({ id: 'zz', name: 'a', price: 1 }))).toBe('notFound')
  })

  it('loadState чистит награды и историю', () => {
    const s = loadState({
      habits: [],
      rewards: [{ id: 'a', name: 'x', price: -5 }, { id: 'b', name: 'y', price: 'z' }, { id: 1, name: 'z' }, null, { id: 'c', name: 'k', price: 10, archived: true }],
      redemptions: [{ id: 'q', rewardId: 'a', name: 'x', price: 5, day: d(1) }, { id: 'w', rewardId: 'a', name: 'x', price: NaN, day: d(1) }, 7],
    })
    expect(s.rewards).toEqual([{ id: 'a', name: 'x', price: 1 }, { id: 'b', name: 'y', price: 1 }, { id: 'c', name: 'k', price: 10, archived: true }])
    expect(s.redemptions).toHaveLength(1)
    expect(loadState({ habits: [] }).rewards).toEqual([])
  })
})
