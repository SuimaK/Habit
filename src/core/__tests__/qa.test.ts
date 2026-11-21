/**
 * QA: граничные случаи Блока 1.
 * Тесты с пометкой «ИСПРАВЛЕНО» — дефекты, найденные на проверке и исправленные.
 */
import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  dayOf,
  GameEngine,
  lastBoundary,
  levelProgress,
  loadState,
  refreshLives,
  titleFor,
  totalXpForLevel,
  weekStart,
  weekday,
  xpToReach,
  type GameState,
} from '..'
import { at, d, engine, err, habit, must } from './helpers'

/** Выполнить все привычки из списка в день `day` (ноябрь 2026, если не указан месяц). */
function doAll(e: GameEngine, ids: string[], date: Date) {
  e.startOfDay(date)
  for (const id of ids) must(e.complete(id, date))
}

describe('календарь: переходы недели/месяца/года', () => {
  it('addDays через границы месяца и года, високосный год', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11)
  })

  it('неделя, пересекающая год, начинается с понедельника', () => {
    expect(weekday('2027-01-01')).toBe(5) // пт
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
    expect(weekStart('2027-01-03')).toBe('2026-12-28')
    expect(weekStart('2027-01-04')).toBe('2027-01-04')
  })

  it('«N раз в неделю»: неделя через Новый год считается одной', () => {
    const h = habit('easy', { kind: 'timesPerWeek', times: 2 })
    const e = engine([h])
    must(e.complete(h.id, new Date(2026, 11, 30, 12)))
    must(e.complete(h.id, new Date(2027, 0, 1, 12)))
    expect(err(e.complete(h.id, new Date(2027, 0, 3, 12)))).toBe('weeklyTargetReached')
    expect(err(e.complete(h.id, new Date(2027, 0, 4, 12)))).toBe('ok')
  })

  it('серия продолжается через смену месяца и года', () => {
    const h = habit()
    const e = engine([h])
    for (let i = 0; i < 10; i++) doAll(e, [h.id], new Date(2026, 11, 26 + i, 12))
    expect(e.currentStreak(new Date(2027, 0, 4, 20))).toBe(10)
    expect(e.multiplierStreak(new Date(2027, 0, 4, 20))).toBe(9)
  })

  it('граница дня — полночь по местному времени', () => {
    const h = habit()
    const e = engine([h])
    must(e.complete(h.id, at(16, 23, 59)))
    expect(err(e.complete(h.id, at(17, 0, 0)))).toBe('ok')
    expect(dayOf(at(16, 23, 59))).toBe(d(16))
  })
})

describe('уровни и титулы', () => {
  it('суммарный XP и пороги', () => {
    expect(xpToReach(2)).toBe(283)
    expect(totalXpForLevel(10)).toBe(14168)
    expect(levelProgress(282).level).toBe(1)
    expect(levelProgress(283)).toEqual({ level: 2, xpInLevel: 0, xpForNextLevel: 520 })
    expect(levelProgress(totalXpForLevel(10) - 1).level).toBe(9)
    expect(levelProgress(totalXpForLevel(10)).level).toBe(10)
    expect(levelProgress(-50).level).toBe(1)
  })

  it('титулы на границах', () => {
    expect([4, 5, 9, 10, 14, 15, 19, 20, 99].map(titleFor)).toEqual([
      'Новичок', 'Ученик', 'Ученик', 'Адепт', 'Адепт', 'Мастер', 'Мастер', 'Гуру', 'Гуру',
    ])
  })
})

describe('дневной лимит и отмена', () => {
  it('отмена после бонуса при упёршемся лимите возвращает ровно начисленное', () => {
    const a = habit('hard'), b = habit('hard')
    const e = engine([a, b])
    e.award(440, 0, at(16)) // квесты
    must(e.complete(a.id, at(16))) // +50 → 490
    const r = must(e.complete(b.id, at(16))) // +10 (срез), бонус 0 XP
    expect([r.xp, r.bonusXp, r.cappedByDailyLimit]).toEqual([10, 0, true])
    expect(e.xpEarned(d(16))).toBe(500)
    must(e.undo(b.id, at(16)))
    expect(e.xpEarned(d(16))).toBe(490)
    expect(e.state.totalXp).toBe(490)
    // повторная отметка снова упирается в лимит, не превышая его
    must(e.complete(b.id, at(16)))
    expect(e.xpEarned(d(16))).toBe(500)
    expect(e.state.totalXp).toBe(500)
  })

  it('цикл отмена/отметка не даёт лишних XP и монет', () => {
    const a = habit('medium'), b = habit('easy')
    const e = engine([a, b])
    must(e.complete(a.id, at(16)))
    must(e.complete(b.id, at(16)))
    const snapshot = { xp: e.state.totalXp, coins: e.state.coins }
    for (let i = 0; i < 5; i++) {
      must(e.undo(b.id, at(16)))
      must(e.complete(b.id, at(16)))
    }
    expect({ xp: e.state.totalXp, coins: e.state.coins }).toEqual(snapshot)
  })

  it('повторная отмена — ошибка, отмена вчерашней отметки — ошибка', () => {
    const h = habit()
    const e = engine([h])
    must(e.complete(h.id, at(16)))
    must(e.undo(h.id, at(16)))
    expect(err(e.undo(h.id, at(16)))).toBe('notCompletedToday')
    must(e.complete(h.id, at(16)))
    expect(err(e.undo(h.id, at(17)))).toBe('notCompletedToday')
    expect(e.state.coins).toBe(1 + 5)
  })

  it('лимит отдельный на каждый день', () => {
    const e = engine()
    e.award(600, 0, at(16, 23, 59))
    e.award(600, 0, at(17, 0, 1))
    expect(e.state.totalXp).toBe(1000)
  })

  it('ИСПРАВЛЕНО: отмена «N раз в неделю» требует монеты и на бонус, который не отзывается', () => {
    const a = habit('easy'), f = habit('easy', { kind: 'timesPerWeek', times: 3 })
    const e = engine([a, f])
    must(e.complete(a.id, at(16))) // +1 монета, бонус +5
    must(e.complete(f.id, at(16))) // +1 монета
    e.state.coins = 1 // потратили 6 монет на что-то
    // У f есть 1 монета для возврата, бонус при отмене f не отзывается (a выполнена).
    expect(err(e.undo(f.id, at(16)))).toBe('ok')
  })

  it('ИСПРАВЛЕНО: отрицательные монеты через award', () => {
    const e = engine()
    e.award(0, -10, at(16))
    expect(e.state.coins).toBeGreaterThanOrEqual(0)
  })
})

describe('лучшая серия', () => {
  it('ИСПРАВЛЕНО: отмена сегодняшней отметки оставляет завышенную лучшую серию', () => {
    const h = habit()
    const e = engine([h])
    doAll(e, [h.id], at(16))
    doAll(e, [h.id], at(17))
    e.startOfDay(at(18))
    must(e.complete(h.id, at(18))) // серия 3, best = 3
    must(e.undo(h.id, at(18))) // ошибочный тап
    expect(e.currentStreak(at(18))).toBe(2)
    expect(e.state.bestStreak).toBe(2)
  })
})

describe('изменение набора привычек переписывает историю', () => {
  it('ИСПРАВЛЕНО: добавление новой привычки обнуляет текущую серию задним числом', () => {
    const a = habit()
    const e = engine([a])
    for (let day = 16; day <= 20; day++) doAll(e, [a.id], at(day))
    e.startOfDay(at(21))
    expect(e.currentStreak(at(21))).toBe(5)
    e.addHabit(habit()) // новая ежедневная привычка сегодня
    expect(e.currentStreak(at(21))).toBe(5) // факт: 0 — прошлые дни стали 1/2 = 50%
    expect(e.multiplierStreak(at(21))).toBe(5)
  })

  it('ИСПРАВЛЕНО: архивирование выполнявшейся привычки рвёт прошлую серию', () => {
    // 4 привычки, каждый день выполнены a, b, c (75% — засчитано)
    const a = habit(), b = habit(), c = habit(), x = habit()
    const e = engine([a, b, c, x])
    for (let day = 16; day <= 20; day++) doAll(e, [a.id, b.id, c.id], at(day))
    e.startOfDay(at(21))
    expect(e.currentStreak(at(21))).toBe(5)
    e.updateHabit({ ...a, archived: true }) // убрали a: прошлые дни 2/3 = 67%
    expect(e.currentStreak(at(21))).toBe(5) // факт: 0
  })

  it('ИСПРАВЛЕНО: смена частоты меняет итоги прошлых дней', () => {
    // a — ежедневная, b — по пн/ср; в вт выполнялась только a
    const a = habit(), b = habit('easy', { kind: 'weekdays', days: [1, 3] })
    const e = engine([a, b])
    doAll(e, [a.id, b.id], at(16)) // пн
    doAll(e, [a.id], at(17)) // вт
    doAll(e, [a.id, b.id], at(18)) // ср
    e.startOfDay(at(19))
    expect(e.currentStreak(at(19))).toBe(3)
    e.updateHabit({ ...b, frequency: { kind: 'daily' } })
    expect(e.currentStreak(at(19))).toBe(3) // факт: 1 — вторник стал 1/2
  })

  it('добавление привычки после бонуса дня не забирает бонус', () => {
    const a = habit()
    const e = engine([a])
    must(e.complete(a.id, at(16)))
    e.addHabit(habit())
    expect(e.state.bonusByDay[d(16)]).toBeDefined()
    expect(e.state.totalXp).toBe(40)
  })

  it('архивирование последней невыполненной привычки сразу выдаёт бонус дня', () => {
    const a = habit(), b = habit()
    const e = engine([a, b])
    must(e.complete(a.id, at(16)))
    e.updateHabit({ ...b, archived: true }, at(16))
    expect(e.plan.allFixedDone(d(16))).toBe(true)
    expect(e.state.bonusByDay[d(16)]).toEqual({ xp: 30, coins: 5 })
  })

  it('смена частоты: из ежедневной в «раз в неделю» после отметки — повтор сегодня запрещён', () => {
    const h = habit()
    const e = engine([h])
    must(e.complete(h.id, at(16)))
    e.updateHabit({ ...h, frequency: { kind: 'timesPerWeek', times: 1 } })
    expect(err(e.complete(h.id, at(16)))).toBe('alreadyCompletedToday')
    expect(err(e.complete(h.id, at(17)))).toBe('weeklyTargetReached')
  })
})

describe('startOfDay', () => {
  it('несколько вызовов в день идемпотентны', () => {
    const h = habit()
    const e = engine([h])
    doAll(e, [h.id], at(16))
    doAll(e, [h.id], at(17))
    // 18-е пропущено
    const first = e.startOfDay(at(19, 7))
    const snapshot = structuredClone(e.state)
    for (let i = 0; i < 5; i++) expect(e.startOfDay(at(19, 8 + i))).toEqual([])
    expect(first).toEqual([d(18)])
    expect(e.state).toEqual(snapshot)
  })

  it('долгое отсутствие: серия рвётся, лучшая сохраняется, жизни до 5', () => {
    const h = habit()
    const e = engine([h])
    for (let day = 16; day <= 19; day++) doAll(e, [h.id], at(day))
    e.startGame(at(19))
    e.startGame(at(19))
    e.startOfDay(at(10, 12, 0, 12)) // 10 декабря
    expect(e.currentStreak(at(10, 12, 0, 12))).toBe(0)
    expect(e.state.bestStreak).toBe(4)
    expect(e.state.lives.count).toBe(5)
    expect(e.state.lastProcessedDay).toBe('2026-12-09')
  })

  it('ИСПРАВЛЕНО: при долгом отсутствии щиты сжигаются, хотя серию всё равно не спасти', () => {
    const h = habit()
    const e = engine([h])
    e.state.coins = 150
    for (let day = 16; day <= 19; day++) doAll(e, [h.id], at(day)) // пн–чт
    for (let i = 0; i < 3; i++) must(e.buyShield())
    // отсутствие пт 20 – пт 27 (8 дней), щитов 3 купленных + бесплатные двух недель = 5
    e.startOfDay(at(28))
    expect(e.currentStreak(at(28))).toBe(0) // серию не спасти
    expect(e.state.shields.purchased).toBe(3) // купленные щиты не сгорают впустую
  })

  it('complete без startOfDay в новый день сам закрывает прошедшие дни', () => {
    const h = habit('medium')
    const e = engine([h])
    for (let day = 16; day <= 18; day++) doAll(e, [h.id], at(day))
    // 19-е пропущено, 20-е: UI забыл startOfDay
    const r = must(e.complete(h.id, at(20)))
    expect(r.multiplier).toBe(1.1) // щит за 19-е уже применён
    expect(e.state.shieldedDays).toEqual([d(19)])
    expect(e.multiplierStreak(at(20))).toBe(3)
  })

  it('щит за пропуск в воскресенье — из старой недели, понедельник — из новой', () => {
    const h = habit()
    const e = engine([h])
    for (let day = 16; day <= 21; day++) doAll(e, [h.id], at(day)) // пн–сб
    // вс 22 и пн 23 пропущены
    expect(e.startOfDay(at(24))).toEqual([d(22), d(23)])
    expect(e.state.shields.freeUsedWeeks).toEqual([d(16), d(23)])
  })

  it('щит сохраняет, но не добавляет день', () => {
    const h = habit()
    const e = engine([h])
    doAll(e, [h.id], at(16))
    doAll(e, [h.id], at(17))
    e.startOfDay(at(19))
    must(e.complete(h.id, at(19)))
    expect(e.currentStreak(at(19))).toBe(3)
  })
})

describe('жизни', () => {
  it('первый запуск до 06:00: в 06:00 добавляются ещё 3 (до 5)', () => {
    let l = refreshLives({ count: 3, lastRefresh: null }, at(16, 5, 59))
    expect(l.count).toBe(3)
    l = refreshLives(l, at(16, 6, 0))
    expect(l.count).toBe(5)
  })

  it('ровно 06:00 — граница включительно', () => {
    expect(lastBoundary(at(16, 6, 0)).getTime()).toBe(at(16, 6, 0).getTime())
    expect(lastBoundary(at(16, 5, 59)).getTime()).toBe(at(15, 6, 0).getTime())
  })

  it('перевод часов назад не даёт и не отнимает жизни', () => {
    let l = refreshLives({ count: 0, lastRefresh: null }, at(17, 7))
    l = refreshLives(l, at(16, 7))
    expect(l.count).toBe(0)
    l = refreshLives(l, at(17, 8))
    expect(l.count).toBe(0)
    l = refreshLives(l, at(18, 6))
    expect(l.count).toBe(3)
  })

  it('0 жизней — партию не начать; после 06:00 — можно', () => {
    const e = new GameEngine()
    e.startOfDay(at(16, 7))
    for (let i = 0; i < 3; i++) expect(e.startGame(at(16, 8))).toBe(true)
    expect(e.startGame(at(16, 9))).toBe(false)
    expect(e.state.lives.count).toBe(0)
    expect(e.startGame(at(17, 6))).toBe(true)
    expect(e.state.lives.count).toBe(2)
  })

  it('покупка: 1 за 15, 5 за 60, нехватка монет', () => {
    const e = new GameEngine()
    e.state.coins = 74
    must(e.buyLives('five'))
    expect(err(e.buyLives('one'))).toBe('notEnoughCoins')
    e.state.coins += 1
    must(e.buyLives('one'))
    expect(e.state.coins).toBe(0)
    expect(e.state.lives.count).toBe(3 + 6)
  })
})

describe('восстановление из JSON', () => {
  it('полный цикл через JSON.stringify/parse на каждом шаге', () => {
    const a = habit('medium'), f = habit('hard', { kind: 'timesPerWeek', times: 2 })
    let e = engine([a, f])
    const reload = () => (e = new GameEngine(JSON.parse(JSON.stringify(e.state)) as GameState))
    for (let day = 16; day <= 20; day++) {
      e.startOfDay(at(day))
      reload()
      must(e.complete(a.id, at(day)))
      reload()
    }
    must(e.complete(f.id, at(20)))
    reload()
    e.startOfDay(at(22)) // 21 пропущен, бесплатный щит
    reload()
    expect(e.state.shieldedDays).toEqual([d(21)])
    expect(e.currentStreak(at(22))).toBe(5)
    expect(err(e.undo(f.id, at(22)))).toBe('notCompletedToday')
    expect(e.state.bestStreak).toBe(5)
    expect(e.habitStreak(a.id, at(22))).toBe(0) // 21-е не выполнено: щит на серию привычки не действует
  })
})

describe('исправления после проверки', () => {
  it('щиты спасают серию после отсутствия, если их хватает на все пропуски', () => {
    const h = habit()
    const e = engine([h])
    e.state.coins = 100
    for (let day = 16; day <= 19; day++) doAll(e, [h.id], at(day))
    must(e.buyShield()); must(e.buyShield())
    // пт 20, сб 21, вс 22 пропущены: бесплатный + 2 купленных
    expect(e.startOfDay(at(23))).toEqual([d(20), d(21), d(22)])
    expect(e.state.shields.purchased).toBe(0)
    expect(e.currentStreak(at(23))).toBe(4)
  })

  it('loadState дополняет старое сохранение недостающими полями', () => {
    const old = { habits: [], completions: [], totalXp: 100, coins: 5 }
    const e = new GameEngine(loadState(old))
    expect(e.state.dayResults).toEqual({})
    expect(e.state.totalXp).toBe(100)
    expect(e.startOfDay(at(16))).toEqual([])
    expect(loadState(null)).toEqual(new GameEngine().state)
  })

  it('неверные параметры привычки отклоняются', () => {
    expect(() => engine([habit('easy', { kind: 'weekdays', days: [] })])).toThrow()
    expect(() => engine([habit('easy', { kind: 'timesPerWeek', times: 0 })])).toThrow()
    expect(() => engine([habit('easy', { kind: 'timesPerWeek', times: 8 })])).toThrow()
    expect(() => engine([{ ...habit(), name: '  ' }])).toThrow()
  })
})

describe('повторная проверка (0be6e3a): регрессии заморозки, щитов и startOfDay', () => {
  it('ИСПРАВЛЕНО: updateHabit(habit, now) меняет привычку ДО закрытия вчерашнего дня', () => {
    // Приложение открыто через полночь: последний startOfDay был 20-го.
    const a = habit(), b = habit(), c = habit(), x = habit()
    const e = engine([a, b, c, x])
    for (let day = 16; day <= 20; day++) doAll(e, [a.id, b.id, c.id], at(day)) // 3/4 = 75%
    // 21-го в 00:05, до любого startOfDay, архивируем a.
    e.updateHabit({ ...a, archived: true }, at(21, 0, 5))
    // 20-е закрылось уже по новому набору (b, c из b, c, x = 67%) — серия порвана.
    expect(e.state.dayResults[d(20)]).toBe('met')
    expect(e.currentStreak(at(21, 0, 5))).toBe(5)
  })

  it('ИСПРАВЛЕНО: addHabit до закрытия вчерашнего дня рвёт серию (нет now, startOfDay не вызывается)', () => {
    const a = habit()
    const e = engine([a])
    for (let day = 16; day <= 20; day++) doAll(e, [a.id], at(day))
    e.addHabit(habit(), at(21, 0, 5)) // 21-го в 00:05, startOfDay ещё не было; интерфейс всегда передаёт now
    e.startOfDay(at(21, 0, 5))
    expect(e.currentStreak(at(21, 0, 5))).toBe(5) // факт: 4 — 20-е заморожено как missed (1/2), сгорел бесплатный щит
    expect(e.state.shieldedDays).toEqual([])
  })

  it('ИСПРАВЛЕНО: перевод часов вперёд навсегда замораживает будущие дни как пропущенные', () => {
    const h = habit()
    const e = engine([h])
    for (let day = 16; day <= 18; day++) doAll(e, [h.id], at(day))
    e.startOfDay(at(25)) // часы ошибочно ушли на неделю вперёд
    e.startOfDay(at(19)) // часы вернули
    must(e.complete(h.id, at(19)))
    doAll(e, [h.id], at(20))
    // 19-е реально выполнено, но итог заморожен ещё до отметки
    expect(e.plan.result(d(19))).toBe('met')
    expect(e.currentStreak(at(20))).toBe(5)
  })

  it('ИСПРАВЛЕНО: loadState старого сохранения теряет bestStreak', () => {
    const h = habit()
    const old = {
      ...engine([h]).state,
      bestStreak: 12,
      startDay: d(16),
      lastProcessedDay: d(16),
    } as Partial<GameState>
    delete old.bestPastStreak
    delete old.dayResults
    const e = new GameEngine(loadState(JSON.parse(JSON.stringify(old))))
    e.startOfDay(at(17))
    expect(e.state.bestStreak).toBe(12) // факт: 0
  })

  it('щитов хватает ровно на серию пропусков через границу недели: сб, вс, пн', () => {
    const h = habit()
    const e = engine([h])
    e.state.coins = 50
    for (let day = 16; day <= 20; day++) doAll(e, [h.id], at(day)) // пн–пт
    must(e.buyShield())
    // сб 21 — бесплатный недели 16, вс 22 — купленный, пн 23 — бесплатный недели 23
    expect(e.startOfDay(at(24))).toEqual([d(21), d(22), d(23)])
    expect(e.state.shields.purchased).toBe(0)
    must(e.complete(h.id, at(24)))
    expect(e.currentStreak(at(24))).toBe(6)
  })

  it('щитов не хватает на 2 пропуска подряд — ни один не тратится, серия рвётся', () => {
    const h = habit()
    const e = engine([h])
    for (let day = 16; day <= 18; day++) doAll(e, [h.id], at(day))
    expect(e.startOfDay(at(21))).toEqual([]) // 19, 20 пропущены, есть только бесплатный
    expect(e.state.shields.freeUsedWeeks).toEqual([])
    expect(e.currentStreak(at(21))).toBe(0)
    expect(e.state.bestStreak).toBe(3)
  })

  it('пустой день внутри серии пропусков не мешает щитам', () => {
    const a = habit('easy', { kind: 'weekdays', days: [1, 2, 3, 4, 5] })
    const e = engine([a])
    e.state.coins = 50
    for (let day = 16; day <= 19; day++) doAll(e, [a.id], at(day)) // пн–чт
    must(e.buyShield())
    // пт 20 пропуск, сб/вс пусто, пн 23 пропуск: бесплатный (нед. 16) + бесплатный (нед. 23)
    expect(e.startOfDay(at(24))).toEqual([d(20), d(23)])
    expect(e.state.shields.purchased).toBe(1)
  })

  it('complete вызывает startOfDay: жизни и щиты применяются, повтор ничего не ломает', () => {
    const h = habit()
    const e = engine([h])
    doAll(e, [h.id], at(16))
    doAll(e, [h.id], at(17))
    must(e.complete(h.id, at(19))) // 18 пропущен, startOfDay не вызывали
    expect(e.state.shieldedDays).toEqual([d(18)])
    const snap = structuredClone(e.state)
    e.startOfDay(at(19, 20))
    expect(e.state).toEqual(snap)
  })

  it('отмена после заморозки: лучшая серия пересчитывается, прошлый рекорд сохраняется', () => {
    const h = habit()
    const e = engine([h])
    for (let day = 16; day <= 20; day++) doAll(e, [h.id], at(day))
    e.startOfDay(at(22)) // 21 пропущен, бесплатный щит
    must(e.complete(h.id, at(22)))
    expect(e.state.bestStreak).toBe(6)
    must(e.undo(h.id, at(22)))
    expect(e.state.bestStreak).toBe(5)
  })
})
