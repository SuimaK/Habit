import { describe, expect, it } from 'vitest'
import { DAILY_SWAPS_PER_DAY, loadState, type Habit } from '..'
import { at, d, engine, err, habit, must } from './helpers'

const withCat = (h: Habit, category: Habit['category']): Habit => ({ ...h, category })
const five = () => [
  withCat(habit('hard'), 'workout'),
  withCat(habit(), 'workout'),
  withCat(habit(), 'nutrition'),
  withCat(habit(), 'nutrition'),
  withCat(habit('medium'), 'meditation'),
]

describe('замена квестов дня', () => {
  it('меняет невыполненный квест на другой, которого нет в списке', () => {
    const e = engine(five())
    e.startOfDay(at(16))
    const before = e.state.quests.daily.map((q) => q.id)
    expect(e.dailySwapsLeft(at(16))).toBe(DAILY_SWAPS_PER_DAY)
    const next = must(e.swapDaily(before[0], at(16)))
    const after = e.state.quests.daily.map((q) => q.id)
    expect(after).toHaveLength(3)
    expect(after[0]).toBe(next.id)
    expect(before).not.toContain(next.id)
    expect(after.slice(1)).toEqual(before.slice(1))
    expect(new Set(after).size).toBe(3)
  })

  it('лимит: одна замена в день, завтра снова можно', () => {
    const e = engine(five())
    e.startOfDay(at(16))
    must(e.swapDaily(e.state.quests.daily[1].id, at(16)))
    expect(e.dailySwapsLeft(at(16))).toBe(0)
    expect(err(e.swapDaily(e.state.quests.daily[2].id, at(16, 18)))).toBe('limit')
    e.startOfDay(at(17))
    expect(e.dailySwapsLeft(at(17))).toBe(1)
    expect(err(e.swapDaily(e.state.quests.daily[0].id, at(17)))).toBe('ok')
  })

  it('выполненный или забранный квест не меняется; чужой id — notFound', () => {
    const hs = five()
    const e = engine(hs)
    e.startOfDay(at(16))
    for (const h of hs) must(e.complete(h.id, at(16)))
    const q = e.state.quests.daily[0]
    expect(err(e.swapDaily(q.id, at(16)))).toBe('done')
    must(e.claimDaily(q.id, at(16)))
    expect(err(e.swapDaily(q.id, at(16)))).toBe('claimed')
    expect(err(e.swapDaily('nope', at(16)))).toBe('notFound')
    expect(e.dailySwapsLeft(at(16))).toBe(1) // попытки не тратят замену
  })

  it('нет других вариантов — сообщает об этом и не тратит замену', () => {
    const e = engine([habit()])
    e.startOfDay(at(16))
    expect(err(e.swapDaily(e.state.quests.daily[0].id, at(16)))).toBe('noAlternatives')
    expect(e.dailySwapsLeft(at(16))).toBe(1)
  })

  it('замена переживает перезагрузку, мусор в сохранении отбрасывается', () => {
    const e = engine(five())
    e.startOfDay(at(16))
    must(e.swapDaily(e.state.quests.daily[0].id, at(16)))
    const s = loadState(JSON.parse(JSON.stringify(e.state)))
    expect(s.quests.swaps).toBe(1)
    expect(s.quests.swapDay).toBe(d(16))
    const bad = loadState({ habits: [], quests: { swapDay: 'вчера', swaps: -3, swappedOut: [1, 'x'] } })
    expect(bad.quests.swapDay).toBeUndefined()
    expect(bad.quests.swaps).toBe(0)
    expect(bad.quests.swappedOut).toEqual(['x'])
  })
})
