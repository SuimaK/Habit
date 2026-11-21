import { describe, expect, it } from 'vitest'
import { DAILY_SWAPS_PER_DAY, dailyProgress, loadState, type Habit } from '..'
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
  it('на замену не приходит уже выполненный квест', () => {
    for (let day = 16; day <= 22; day++) {
      const hs = five()
      const e = engine(hs)
      e.startOfDay(at(day))
      // Выполняем всё, что не входит в текущие квесты-привычки.
      const inList = new Set(e.state.quests.daily.flatMap((q) => (q.goal.kind === 'habit' ? [q.goal.habitId] : [])))
      for (const h of hs) if (!inList.has(h.id)) must(e.complete(h.id, at(day)))
      const target = e.state.quests.daily.find((q) => e.canSwapDaily(q.id, at(day)))
      if (!target) continue
      const next = must(e.swapDaily(target.id, at(day)))
      expect(dailyProgress(next, e.state.habits, e.state.completions, d(day)).complete).toBe(false)
    }
  })

  it('canSwapDaily: нет вариантов или лимит — кнопки нет', () => {
    const one = engine([habit()])
    one.startOfDay(at(16))
    expect(one.canSwapDaily(one.state.quests.daily[0].id, at(16))).toBe(false)
    const e = engine(five())
    e.startOfDay(at(16))
    const id = e.state.quests.daily[0].id
    expect(e.canSwapDaily(id, at(16))).toBe(true)
    must(e.swapDaily(id, at(16)))
    expect(e.state.quests.daily.some((q) => e.canSwapDaily(q.id, at(16)))).toBe(false)
  })

  it('правка привычек после замены не возвращает убранный квест', () => {
    const hs = five()
    const e = engine(hs)
    e.startOfDay(at(16))
    const removed = e.state.quests.daily[0].id
    must(e.swapDaily(removed, at(16)))
    e.updateHabit({ ...hs[4], name: 'Дыхание' }, at(16, 13))
    e.startOfDay(at(16, 13))
    expect(e.state.quests.daily.map((q) => q.id)).not.toContain(removed)
    expect(e.state.quests.daily).toHaveLength(3)
  })

  it('часы переведены назад — замена не обновляется', () => {
    const e = engine(five())
    e.startOfDay(at(17))
    must(e.swapDaily(e.state.quests.daily[0].id, at(17)))
    expect(e.dailySwapsLeft(at(16))).toBe(0)
  })
})
