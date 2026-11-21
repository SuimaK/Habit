import { afterEach, describe, expect, it } from 'vitest'
import { TEST_MODE, isTestMode, loadState } from '..'
import { at, engine, err, habit, must } from './helpers'

const MIN = 60_000

describe('безлимит жизней за квесты', () => {
  it('квест дня — 15 минут, жизни не тратятся, потом снова тратятся', () => {
    const a = habit()
    const e = engine([a])
    e.startOfDay(at(16, 8))
    must(e.complete(a.id, at(16, 9)))
    const r = must(e.claimDaily(e.state.quests.daily[0].id, at(16, 10)))
    expect(r.unlimitedMin).toBe(15)
    expect(e.unlimitedUntil(at(16, 10))?.getTime()).toBe(at(16, 10, 15).getTime())
    e.state.lives.count = 0
    expect(e.gameBlock(at(16, 10, 5))).toBeNull()
    expect(e.startGame(at(16, 10, 5))).toBe(true)
    expect(e.state.lives.count).toBe(0)
    // Выход до старта бесплатной партии жизнь не добавляет.
    e.refundLife()
    expect(e.state.lives.count).toBe(0)
    expect(e.livesUnlimited(at(16, 10, 15))).toBe(false)
    expect(e.gameBlock(at(16, 10, 15))).toBe('noLives')
  })

  it('безлимит складывается, недельный — 30 минут', () => {
    const h = habit()
    const e = engine([h])
    e.startOfDay(at(16, 8))
    for (let day = 16; day <= 22; day++) must(e.complete(h.id, at(day, 9)))
    e.state.unlimitedLivesUntil = at(22, 10, 10).getTime()
    const r = must(e.claimWeekly(at(22, 10)))
    expect(r.unlimitedMin).toBe(30)
    expect(e.state.unlimitedLivesUntil).toBe(at(22, 10, 40).getTime())
  })

  it('платная партия списывает жизнь и возвращает её при выходе до старта', () => {
    const e = engine()
    e.startOfDay(at(16, 8))
    e.state.unlimitedLivesUntil = at(16, 8).getTime() - MIN
    expect(e.startGame(at(16, 9))).toBe(true)
    expect(e.state.lives.count).toBe(4)
    e.refundLife()
    expect(e.state.lives.count).toBe(5)
  })

  it('сохраняется и загружается', () => {
    const e = engine()
    e.state.unlimitedLivesUntil = 123
    const s = loadState(JSON.parse(JSON.stringify(e.state)))
    expect(s.unlimitedLivesUntil).toBe(123)
    expect(loadState({}).unlimitedLivesUntil).toBeNull()
  })
})

describe('тестовый период', () => {
  afterEach(() => {
    TEST_MODE.until = 0
  })

  it('по умолчанию до конца 26 ноября 2026', () => {
    TEST_MODE.until = new Date(2026, 10, 27).getTime()
    expect(isTestMode(at(26, 23, 59))).toBe(true)
    expect(isTestMode(at(27, 0, 0))).toBe(false)
  })

  it('жизни не тратятся', () => {
    TEST_MODE.until = at(30).getTime()
    const e = engine()
    e.startOfDay(at(16, 8))
    e.state.lives.count = 0
    expect(e.startGame(at(16, 9))).toBe(true)
    expect(e.state.lives.count).toBe(0)
  })

  it('можно снять отметку, засчитанную в забранный квест, и с потраченными монетами', () => {
    const a = habit('hard')
    const e = engine([a])
    e.startOfDay(at(16, 8))
    must(e.complete(a.id, at(16, 9)))
    const q = e.state.quests.daily[0]
    must(e.claimDaily(q.id, at(16, 10)))
    expect(err(e.undo(a.id, at(16, 11)))).toBe('usedInQuest')

    TEST_MODE.until = at(30).getTime()
    e.state.coins = 3 // потрачено почти всё
    const xp = e.state.totalXp
    must(e.undo(a.id, at(16, 11)))
    expect(e.isCompleted(a.id, '2026-11-16')).toBe(false)
    expect(e.state.coins).toBe(0)
    expect(e.state.quests.daily[0].claimed).toBe(false)
    expect(e.state.quests.claimedCount).toBe(0)
    expect(e.state.totalXp).toBeLessThan(xp)
    expect(e.state.totalXp).toBeGreaterThanOrEqual(0)
    expect(e.unlimitedUntil(at(16, 11))).toBeNull()
    // Можно выполнить и забрать снова.
    must(e.complete(a.id, at(16, 12)))
    must(e.claimDaily(q.id, at(16, 12)))
  })

  it('отмена забирает ровно тот XP квеста, что был начислен (дневной лимит)', () => {
    TEST_MODE.until = at(30).getTime()
    const a = habit('hard')
    const e = engine([a])
    e.startOfDay(at(16, 8))
    must(e.complete(a.id, at(16, 9)))
    e.state.xpByDay['2026-11-16'] = 500 // лимит уже выбран
    const q = e.state.quests.daily[0]
    expect(must(e.claimDaily(q.id, at(16, 10))).xp).toBe(0)
    const before = e.state.totalXp
    const habitXp = e.state.completions[0].xp
    must(e.undo(a.id, at(16, 11)))
    expect(e.state.totalXp).toBe(before - habitXp - 30) // XP отметки и бонус дня, без XP квеста
  })
})
