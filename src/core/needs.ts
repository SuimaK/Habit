import { addDays, type Day } from './day'
import type { Category, Completion, Habit } from './models'

/**
 * Шкалы-потребности персонажа: сколько привычек направления выполнено за последние 7 дней
 * (включая сегодня). Максимум — Сила 10, Энергия 30, Дзен 10.
 */
export const NEED_MAX: Record<Category, number> = { workout: 10, nutrition: 30, meditation: 10 }
export const NEED_LABEL: Record<Category, string> = { workout: 'Сила', nutrition: 'Энергия', meditation: 'Дзен' }
/** Ниже этой доли от максимума персонаж грустит. */
export const SAD_THRESHOLD = 0.3
export const NEED_WINDOW_DAYS = 7

export interface Need {
  category: Category
  label: string
  value: number
  max: number
  sad: boolean
}

export function needs(habits: Habit[], completions: Completion[], today: Day): Need[] {
  const from = addDays(today, -(NEED_WINDOW_DAYS - 1))
  const categoryOf = new Map(habits.map((h) => [h.id, h.category]))
  const counts: Record<Category, number> = { workout: 0, nutrition: 0, meditation: 0 }
  for (const c of completions) {
    const cat = categoryOf.get(c.habitId)
    if (cat && c.day >= from && c.day <= today) counts[cat]++
  }
  return (['workout', 'nutrition', 'meditation'] as const).map((category) => {
    const max = NEED_MAX[category]
    const value = Math.min(max, counts[category])
    return { category, label: NEED_LABEL[category], value, max, sad: value < max * SAD_THRESHOLD }
  })
}
