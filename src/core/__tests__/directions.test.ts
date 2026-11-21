import { describe, expect, it } from 'vitest'
import { DIRECTIONS_MAX, generateDaily, generateWeekly, loadState, needs, questTitle, type Habit } from '..'
import { at, d, engine, err, habit, must } from './helpers'

const inDir = (h: Habit, category: string): Habit => ({ ...h, category })

describe('направления', () => {
  it('по умолчанию три стандартных', () => {
    const e = engine()
    expect(e.directions.map((x) => x.id)).toEqual(['nutrition', 'workout', 'meditation'])
    expect(e.directions.map((x) => x.need)).toEqual(['Энергия', 'Сила', 'Дзен'])
  })

  it('свои направления: не больше 5 всего, без дублей и пустых имён', () => {
    const e = engine()
    must(e.addDirection({ name: 'Сон', icon: '😴', timer: false }, 'd1'))
    expect(err(e.addDirection({ name: ' сон ', icon: '😴', timer: false }, 'd2'))).toBe('duplicate')
    expect(err(e.addDirection({ name: 'питание', icon: '📚', timer: false }, 'd2'))).toBe('duplicate')
    expect(err(e.addDirection({ name: '  ', icon: '📚', timer: false }, 'd2'))).toBe('empty')
    must(e.addDirection({ name: 'Чтение', icon: '📚', timer: true }, 'd2'))
    expect(e.directions).toHaveLength(DIRECTIONS_MAX)
    expect(err(e.addDirection({ name: 'Музыка', icon: '🎵', timer: false }, 'd3'))).toBe('limit')
  })

  it('стандартные можно переименовать и сменить значок, но не удалить', () => {
    const e = engine()
    must(e.updateDirection('nutrition', { name: 'Еда', icon: '🌿' }))
    const n = e.directions[0]
    expect([n.name, n.icon, n.need]).toEqual(['Еда', '🌿', 'Энергия'])
    expect(err(e.removeDirection('workout'))).toBe('base')
  })

  it('удаление: нельзя с действующими привычками; с архивными — скрывается для истории', () => {
    const e = engine()
    must(e.addDirection({ name: 'Сон', icon: '😴', timer: false }, 'd1'))
    const h = inDir(habit(), 'd1')
    e.addHabit(h, at(16))
    expect(err(e.removeDirection('d1'))).toBe('hasHabits')
    e.updateHabit({ ...h, archived: true }, at(16))
    must(e.removeDirection('d1'))
    expect(e.directions.map((x) => x.id)).not.toContain('d1')
    expect(e.state.directions.custom[0].archived).toBe(true)
    // Место освободилось.
    must(e.addDirection({ name: 'Сон 2', icon: '😴', timer: false }, 'd2'))
    // Вернули привычку из архива — направление вернулось.
    e.updateHabit({ ...h, archived: false }, at(16))
    expect(e.directions.map((x) => x.id)).toContain('d1')
  })

  it('привычку нельзя добавить в несуществующее направление', () => {
    const e = engine()
    expect(() => e.addHabit(inDir(habit(), 'nope'), at(16))).toThrow()
  })

  it('шкала своего направления: максимум 10, после стандартных', () => {
    const e = engine()
    must(e.addDirection({ name: 'Сон', icon: '😴', timer: false }, 'd1'))
    const h = inDir(habit(), 'd1')
    e.addHabit(h, at(16))
    must(e.complete(h.id, at(16)))
    const bars = needs(e.state.habits, e.state.completions, d(16), e.state.directions)
    expect(bars.map((b) => b.label)).toEqual(['Сила', 'Энергия', 'Дзен', 'Сон'])
    expect(bars[3]).toMatchObject({ value: 1, max: 10, tone: 'c1' })
  })

  it('квесты: своё направление попадает в дневной и недельный квест, название — текущее', () => {
    const e = engine()
    must(e.addDirection({ name: 'Сон', icon: '😴', timer: false }, 'd1'))
    const hs = [inDir(habit(), 'd1'), inDir(habit(), 'd1')]
    const daily = generateDaily(hs, d(16), e.state.directions)
    const cat = daily.find((q) => q.goal.kind === 'category')!
    expect(cat.title).toBe('Сон: все 2 привычки за день')
    must(e.updateDirection('d1', { name: 'Отдых', icon: '😴' }))
    expect(questTitle(cat, hs, e.state.directions)).toBe('Отдых: все 2 привычки за день')
    expect(generateWeekly(hs, d(16)).lines.map((l) => l.category)).toEqual(['d1'])
  })

  it('стандартные квесты не изменились от появления направлений', () => {
    const hs = [habit('hard'), inDir(habit(), 'nutrition'), inDir(habit(), 'nutrition'), inDir(habit(), 'meditation')]
    expect(generateDaily(hs, d(16)).map((q) => q.title)).toEqual(generateDaily(hs, d(16), loadState({}).directions).map((q) => q.title))
  })

  it('loadState: чистит направления, лишние сверх лимита — в удалённые', () => {
    const s = loadState({
      habits: [inDir(habit(), 'a'), inDir(habit(), 'zzz')],
      directions: {
        base: { nutrition: { name: '  Еда  ', icon: '🐍' }, foo: { name: 'x' } },
        custom: [
          { id: 'a', name: 'A', icon: '📚', timer: 1 },
          { id: 'a', name: 'dup' },
          { id: 'workout', name: 'bad' },
          { id: 'b', name: '' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
      },
    })
    expect(s.directions.base).toEqual({ nutrition: { name: 'Еда' } })
    expect(s.directions.custom.map((c) => [c.id, !!c.archived, c.timer])).toEqual([
      ['a', false, false],
      ['b', false, false],
      ['c', true, false],
    ])
    expect(s.directions.custom[1].icon).toBe('⭐')
    expect(s.habits.map((h) => h.category)).toEqual(['a', 'nutrition'])
  })
})
