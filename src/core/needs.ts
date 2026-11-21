import { addDays, type Day } from './day'
import { activeDirections, initialDirections, type DirectionsState } from './directions'
import type { Category, Completion, Habit } from './models'

/**
 * Шкалы-потребности персонажа: сколько привычек направления выполнено за последние 7 дней
 * (включая сегодня). Максимум — Сила 10, Энергия 30, Дзен 10, свои направления 10.
 */
/** Ниже этой доли от максимума персонаж грустит. */
export const SAD_THRESHOLD = 0.3
export const NEED_WINDOW_DAYS = 7

export interface Need {
  category: Category
  label: string
  icon: string
  tone: string
  value: number
  max: number
  sad: boolean
}

/** Порядок шкал: Сила, Энергия, Дзен, затем свои направления. */
const ORDER: Record<string, number> = { workout: 0, nutrition: 1, meditation: 2 }

export function needs(habits: Habit[], completions: Completion[], today: Day, directions: DirectionsState = initialDirections()): Need[] {
  const from = addDays(today, -(NEED_WINDOW_DAYS - 1))
  const categoryOf = new Map(habits.map((h) => [h.id, h.category]))
  const counts = new Map<Category, number>()
  for (const c of completions) {
    const cat = categoryOf.get(c.habitId)
    if (cat && c.day >= from && c.day <= today) counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  return activeDirections(directions)
    .sort((a, b) => (ORDER[a.id] ?? 9) - (ORDER[b.id] ?? 9))
    .map((d) => {
      const value = Math.min(d.needMax, counts.get(d.id) ?? 0)
      return { category: d.id, label: d.need, icon: d.icon, tone: d.tone, value, max: d.needMax, sad: value < d.needMax * SAD_THRESHOLD }
    })
}
