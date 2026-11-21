import type { Habit } from './core'
import { newId } from './id'

/**
 * Временный стартовый набор привычек (из примеров ТЗ), пока нет онбординга и конструктора (блок 3).
 */
export function starterHabits(): Habit[] {
  const h = (name: string, category: Habit['category'], difficulty: Habit['difficulty']): Habit => ({
    id: newId(),
    name,
    category,
    difficulty,
    frequency: { kind: 'daily' },
    archived: false,
  })
  return [
    h('Зарядка 7 мин', 'workout', 'medium'),
    h('Дыхание 3 мин', 'meditation', 'easy'),
    h('Без сладкого до обеда', 'nutrition', 'easy'),
    h('Овощи в ужин', 'nutrition', 'easy'),
    h('Медитация 10 мин', 'meditation', 'medium'),
  ]
}
