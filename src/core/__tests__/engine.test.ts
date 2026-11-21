import { describe, expect, it } from 'vitest'
import { GameEngine } from '..'
import { at, d, engine, err, habit, must } from './helpers'

describe('отметка привычек', () => {
  it('XP и монеты по сложности, бонус за все привычки дня', () => {
    const easy = habit('easy'), medium = habit('medium'), hard = habit('hard')
    const e = engine([easy, medium, hard])
    const r1 = must(e.complete(easy.id, at(16)))
    expect([r1.xp, r1.coins]).toEqual([10, 1])
    const r2 = must(e.complete(medium.id, at(16)))
    expect([r2.xp, r2.coins, r2.bonusXp]).toEqual([25, 3, 0])
    const r3 = must(e.complete(hard.id, at(16)))
    expect([r3.xp, r3.coins, r3.bonusXp, r3.bonusCoins]).toEqual([50, 5, 30, 5])
    expect(e.state.totalXp).toBe(115)
    expect(e.state.coins).toBe(14)
  })

  it('нельзя отметить дважды за день', () => {
    const h = habit()
    const e = engine([h])
    must(e.complete(h.id, at(16, 8)))
    expect(err(e.complete(h.id, at(16, 20)))).toBe('alreadyCompletedToday')
    expect(err(e.complete(h.id, at(17, 8)))).toBe('ok')
  })

  it('неизвестная и архивная привычка', () => {
    const h = { ...habit(), archived: true }
    const e = engine([h])
    expect(err(e.complete('nope', at(16)))).toBe('habitNotFound')
    expect(err(e.complete(h.id, at(16)))).toBe('habitArchived')
  })

  it('привычка по дням недели отмечается только в свои дни', () => {
    const h = habit('easy', { kind: 'weekdays', days: [1, 3] })
    const e = engine([h])
    expect(err(e.complete(h.id, at(16)))).toBe('ok') // пн
    expect(err(e.complete(h.id, at(17)))).toBe('notScheduledToday') // вт
    expect(err(e.complete(h.id, at(18)))).toBe('ok') // ср
  })

  it('«N раз в неделю» не чаще нормы', () => {
    const h = habit('hard', { kind: 'timesPerWeek', times: 3 })
    const e = engine([h])
    for (const day of [16, 17, 19]) must(e.complete(h.id, at(day)))
    expect(err(e.complete(h.id, at(21)))).toBe('weeklyTargetReached')
    expect(err(e.complete(h.id, at(23)))).toBe('ok') // новая неделя
  })

  it('не больше 500 XP в день', () => {
    const hs = Array.from({ length: 12 }, () => habit('hard')) // 12 × 50 = 600
    const e = engine(hs)
    const events = hs.map((h) => must(e.complete(h.id, at(16))))
    expect(e.xpEarned(d(16))).toBe(500)
    expect(e.state.totalXp).toBe(500)
    const last = events[events.length - 1]
    expect(last.cappedByDailyLimit).toBe(true)
    expect(last.bonusXp).toBe(0) // бонус XP срезан лимитом
    expect(last.bonusCoins).toBe(5) // монеты не ограничены
    expect(e.state.coins).toBe(12 * 5 + 5)
    expect(must(e.complete(hs[0].id, at(17))).xp).toBe(50) // назавтра лимит свободен
  })

  it('XP из квестов тоже под дневным лимитом', () => {
    const e = engine()
    expect(e.award(450, 0, at(16)).xp).toBe(450)
    const r = e.award(150, 20, at(16))
    expect(r.xp).toBe(50)
    expect(r.cappedByDailyLimit).toBe(true)
    expect(e.state.coins).toBe(20)
  })

  it('сообщает о новом уровне', () => {
    const h = habit('hard')
    const e = engine([h])
    e.award(250, 0, at(15))
    const r = must(e.complete(h.id, at(16)))
    expect([r.levelBefore, r.levelAfter]).toEqual([1, 2])
  })

  it('отмена отметки забирает награду и бонус', () => {
    const a = habit('easy'), b = habit('medium')
    const e = engine([a, b])
    must(e.complete(a.id, at(16)))
    must(e.complete(b.id, at(16))) // + бонус
    expect([e.state.totalXp, e.state.coins]).toEqual([65, 9])
    must(e.undo(b.id, at(16)))
    expect([e.state.totalXp, e.state.coins, e.xpEarned(d(16))]).toEqual([10, 1, 10])
    expect(e.state.bonusByDay[d(16)]).toBeUndefined()
    expect(must(e.complete(b.id, at(16))).bonusXp).toBe(30) // бонус снова даётся
    expect(err(e.undo(a.id, at(17)))).toBe('notCompletedToday')
  })

  it('отмену не дать, если монеты уже потрачены', () => {
    const h = habit('hard')
    const e = engine([h])
    e.state.coins = 0
    must(e.complete(h.id, at(16))) // +5 +5 бонус = 10
    must(e.buyLives('one')) // −5 → 5
    expect(err(e.undo(h.id, at(16)))).toBe('coinsAlreadySpent')
  })
})

describe('магазин и игры', () => {
  it('покупка жизней и щитов', () => {
    const e = engine()
    e.state.coins = 24
    must(e.buyLives('five'))
    expect(e.state.coins).toBe(4)
    expect(e.state.lives.count).toBe(10) // 5 стартовых + 5
    expect(err(e.buyLives('one'))).toBe('notEnoughCoins')
    e.state.coins = 50
    must(e.buyShield())
    expect([e.state.shields.purchased, e.state.coins]).toEqual([1, 0])
    expect(err(e.buyShield())).toBe('notEnoughCoins')
  })

  it('партия стоит одну жизнь', () => {
    const e = engine()
    e.startOfDay(at(16, 9))
    for (let i = 0; i < 5; i++) expect(e.startGame(at(16, 10))).toBe(true)
    expect(e.startGame(at(16, 11))).toBe(false)
    expect(e.state.lives.count).toBe(0)
    expect(e.startGame(at(17, 6, 1))).toBe(true) // обновились в 06:00
    expect(e.state.lives.count).toBe(4)
  })

  it('состояние переживает сохранение в JSON', () => {
    const h = habit('medium', { kind: 'weekdays', days: [1, 2] })
    const e = engine([h])
    e.startOfDay(at(16))
    must(e.complete(h.id, at(16)))
    const restored = new GameEngine(JSON.parse(JSON.stringify(e.state)))
    expect(restored.state).toEqual(e.state)
    expect(restored.currentStreak(at(16))).toBe(1)
  })

  it('clone не меняет исходное состояние', () => {
    const h = habit()
    const e = engine([h])
    const copy = e.clone()
    must(copy.complete(h.id, at(16)))
    expect(e.state.completions).toHaveLength(0)
  })
})
