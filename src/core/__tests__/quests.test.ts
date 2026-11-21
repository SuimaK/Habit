import { describe, expect, it } from 'vitest'
import { BADGES, dailyProgress, generateDaily, generateWeekly, rollChest, seededRandom, weeklyProgress, type Habit } from '..'
import { at, d, engine, err, habit, must } from './helpers'

const withCat = (h: Habit, category: Habit['category']): Habit => ({ ...h, category })

describe('ежедневные квесты', () => {
  it('3 квеста под привычки дня, одинаковые при повторной генерации', () => {
    const hs = [withCat(habit('hard'), 'workout'), withCat(habit(), 'nutrition'), withCat(habit(), 'nutrition'), withCat(habit('medium'), 'meditation')]
    const q1 = generateDaily(hs, d(16))
    expect(q1).toHaveLength(3)
    expect(generateDaily(hs, d(16))).toEqual(q1)
    expect(new Set(q1.map((q) => JSON.stringify(q.goal))).size).toBe(3)
  })

  it('мало привычек — меньше квестов, без привычек — ни одного', () => {
    expect(generateDaily([habit()], d(16))).toHaveLength(1)
    expect(generateDaily([], d(16))).toEqual([])
    expect(generateDaily([{ ...habit(), archived: true }], d(16))).toEqual([])
  })

  it('не берёт привычки не по расписанию', () => {
    const h = habit('easy', { kind: 'weekdays', days: [2] }) // вторник
    expect(generateDaily([h], d(16))).toEqual([]) // понедельник
    expect(generateDaily([h], d(17))).toHaveLength(1)
  })

  it('прогресс по типам целей', () => {
    const a = withCat(habit(), 'nutrition'), b = withCat(habit(), 'nutrition'), c = withCat(habit(), 'workout')
    const e = engine([a, b, c])
    must(e.complete(a.id, at(16)))
    must(e.complete(c.id, at(16)))
    const s = e.state
    const p = (goal: Parameters<typeof dailyProgress>[0]['goal']) =>
      dailyProgress({ id: 'x', title: '', goal, claimed: false }, s.habits, s.completions, d(16))
    expect(p({ kind: 'habit', habitId: a.id }).complete).toBe(true)
    expect(p({ kind: 'habit', habitId: b.id }).complete).toBe(false)
    expect(p({ kind: 'category', category: 'nutrition', count: 2 })).toEqual({ done: 1, target: 2, complete: false })
    expect(p({ kind: 'total', count: 2 })).toEqual({ done: 2, target: 2, complete: true })
  })

  it('забрать награду: 40 XP и 5 монет, один раз, только когда выполнено', () => {
    const a = habit()
    const e = engine([a])
    e.startOfDay(at(16, 8))
    const q = e.state.quests.daily[0]
    expect(q.goal).toEqual({ kind: 'habit', habitId: a.id })
    expect(err(e.claimDaily(q.id, at(16, 9)))).toBe('notReady')
    must(e.complete(a.id, at(16, 9)))
    const xp = e.state.totalXp, coins = e.state.coins
    const r = must(e.claimDaily(q.id, at(16, 10)))
    expect([r.xp, r.coins]).toEqual([40, 5])
    expect([e.state.totalXp, e.state.coins]).toEqual([xp + 40, coins + 5])
    expect(err(e.claimDaily(q.id, at(16, 11)))).toBe('alreadyClaimed')
    expect(e.state.quests.claimedCount).toBe(1)
  })

  it('на следующий день — новые квесты, вчерашние забрать нельзя', () => {
    const a = habit()
    const e = engine([a])
    e.startOfDay(at(16, 8))
    const old = e.state.quests.daily[0].id
    must(e.complete(a.id, at(16, 9)))
    e.startOfDay(at(17, 8))
    expect(e.state.quests.dailyDay).toBe(d(17))
    expect(err(e.claimDaily(old, at(17, 9)))).toBe('notFound')
  })

  it('подстраиваются под добавленные привычки, пока ничего не забрано', () => {
    const e = engine()
    e.startOfDay(at(16, 8))
    for (const cat of ['nutrition', 'workout', 'meditation'] as const) e.addHabit(withCat(habit(), cat), at(16, 8))
    e.startOfDay(at(16, 8))
    expect(e.state.quests.daily).toHaveLength(3)
    expect(e.state.quests.weekly!.lines).toHaveLength(3)
    // после того как квест забран, набор дня фиксируется
    const q = e.state.quests.daily.find((x) => x.goal.kind === 'habit')!
    must(e.complete((q.goal as { habitId: string }).habitId, at(16, 9)))
    must(e.claimDaily(q.id, at(16, 9)))
    const snapshot = e.state.quests.daily.map((x) => x.id)
    e.addHabit(habit(), at(16, 10))
    e.startOfDay(at(16, 10))
    expect(e.state.quests.daily.map((x) => x.id)).toEqual(snapshot)
  })

  it('появляются после добавления первых привычек в тот же день', () => {
    const e = engine()
    e.startOfDay(at(16, 8))
    expect(e.state.quests.daily).toEqual([])
    e.addHabit(habit(), at(16, 9))
    e.startOfDay(at(16, 9))
    expect(e.state.quests.daily).toHaveLength(1)
  })

  it('XP квеста под дневным лимитом 500', () => {
    const a = habit()
    const e = engine([a])
    e.startOfDay(at(16, 8))
    must(e.complete(a.id, at(16, 9)))
    e.award(500, 0, at(16, 9))
    const r = must(e.claimDaily(e.state.quests.daily[0].id, at(16, 10)))
    expect(r.xp).toBe(0)
    expect(r.cappedByDailyLimit).toBe(true)
    expect(r.coins).toBe(5)
  })
})

describe('недельный квест и сундук', () => {
  it('цели ~70% недельного плана по направлениям', () => {
    const hs = [
      withCat(habit('medium', { kind: 'timesPerWeek', times: 3 }), 'workout'),
      withCat(habit(), 'meditation'),
      withCat(habit('easy', { kind: 'weekdays', days: [1, 3] }), 'nutrition'),
    ]
    const q = generateWeekly(hs, d(18))
    expect(q.weekStart).toBe(d(16))
    expect(q.lines).toEqual([
      { category: 'workout', target: 2 },
      { category: 'meditation', target: 5 },
      { category: 'nutrition', target: 1 },
    ])
  })

  it('забрать: 150 XP + 20 монет + сундук, засчитываются только отметки этой недели', () => {
    const w = withCat(habit('medium', { kind: 'timesPerWeek', times: 2 }), 'workout')
    const e = engine([w])
    e.startOfDay(at(13, 8)) // прошлая неделя
    must(e.complete(w.id, at(13)))
    e.startOfDay(at(16, 8))
    expect(e.state.quests.weekly!.lines).toEqual([{ category: 'workout', target: 1 }])
    expect(err(e.claimWeekly(at(16, 9)))).toBe('notReady')
    must(e.complete(w.id, at(16, 9)))
    expect(weeklyProgress(e.state.quests.weekly!, e.state.habits, e.state.completions)[0].progress.done).toBe(1)
    const before = { coins: e.state.coins, lives: e.state.lives.count, shields: e.state.shields.purchased }
    const r = must(e.claimWeekly(at(16, 10)))
    expect(r.xp).toBe(150)
    expect(r.chest).toBeDefined()
    const chest = r.chest!
    if (chest.kind === 'coins') expect(e.state.coins).toBe(before.coins + 20 + chest.amount)
    if (chest.kind === 'shield') expect(e.state.shields.purchased).toBe(before.shields + 1)
    if (chest.kind === 'lives') expect(e.state.lives.count).toBe(before.lives + chest.amount)
    expect(err(e.claimWeekly(at(16, 11)))).toBe('alreadyClaimed')
    e.startOfDay(at(23, 8))
    expect(e.state.quests.weekly!.claimed).toBe(false)
    expect(e.state.quests.weekly!.weekStart).toBe(d(23))
  })

  it('сундук детерминирован и даёт все виды призов', () => {
    expect(rollChest('x')).toEqual(rollChest('x'))
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => rollChest(`w${i}`).kind))
    expect(kinds).toEqual(new Set(['coins', 'shield', 'lives']))
    for (let i = 0; i < 200; i++) {
      const p = rollChest(`c${i}`)
      if (p.kind === 'coins') expect(p.amount).toBeGreaterThanOrEqual(10)
      if (p.kind === 'coins') expect(p.amount).toBeLessThanOrEqual(30)
    }
    const r = seededRandom('s')
    for (let i = 0; i < 100; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('бейджи', () => {
  it('ровно 10, уникальные id', () => {
    expect(BADGES).toHaveLength(10)
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(10)
  })

  it('первый шаг и идеальный день выдаются при отметке и один раз', () => {
    const a = habit()
    const e = engine([a])
    const r = must(e.complete(a.id, at(16, 8)))
    expect(r.newBadges.sort()).toEqual(['first', 'perfect'])
    expect(e.state.badges.first).toBe(d(16))
    must(e.undo(a.id, at(16, 8)))
    expect(must(e.complete(a.id, at(16, 8))).newBadges).toEqual([])
  })

  it('ранняя пташка — 10 тренировок до 9 утра', () => {
    const w = withCat(habit(), 'workout')
    const e = engine([w])
    for (let day = 1; day <= 9; day++) must(e.complete(w.id, at(day, 8, 30)))
    must(e.complete(w.id, at(10, 9, 30))) // после 9 — не считается
    expect(e.state.badges.earlybird).toBeUndefined()
    must(e.complete(w.id, at(11, 7)))
    expect(e.state.badges.earlybird).toBe(d(11))
  })

  it('серия 7 дней и 10 медитаций', () => {
    const m = withCat(habit(), 'meditation')
    const e = engine([m])
    for (let day = 1; day <= 10; day++) {
      e.startOfDay(at(day, 7))
      must(e.complete(m.id, at(day, 20)))
    }
    expect(e.state.badges.week).toBe(d(7))
    expect(e.state.badges.med10).toBe(d(10))
  })
})
