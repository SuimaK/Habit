import { addDays, daysBetween, weekStart, type Day } from './day'
import type { Difficulty } from './models'

/**
 * Свой квест (ТЗ 3.4, 5.2): своё правило на неделю, например «Без кофе после 16:00».
 * Отмечаю дни этой недели; набрала нужное число дней — забираю награду по сложности.
 * Квест повторяется каждую неделю, отметки новой недели начинаются с нуля.
 */
export const CUSTOM_QUEST_REWARD: Record<Difficulty, { xp: number; coins: number }> = {
  easy: { xp: 40, coins: 5 },
  medium: { xp: 80, coins: 10 },
  hard: { xp: 150, coins: 20 },
}
export const CUSTOM_QUEST_MAX = 5
export const CUSTOM_QUEST_NAME_MAX = 60

export interface CustomQuest {
  id: string
  name: string
  difficulty: Difficulty
  /** Сколько дней в неделю, 1–7. */
  target: number
  /** Отмеченные дни. */
  marks: Day[]
  /** Недели (по понедельнику), за которые награда уже забрана. */
  claimedWeeks: Day[]
  archived?: boolean
}

export type CustomQuestError = 'emptyName' | 'badTarget' | 'tooMany' | 'notFound' | 'notThisWeek' | 'future' | 'claimed' | 'notReady'

export function validateCustomQuest(q: Pick<CustomQuest, 'name' | 'target' | 'difficulty'>): CustomQuestError | null {
  if (!q.name.trim()) return 'emptyName'
  if (!Number.isInteger(q.target) || q.target < 1 || q.target > 7) return 'badTarget'
  return null
}

/** Дни текущей недели (Пн–Вс). */
export function weekDays(today: Day): Day[] {
  const start = weekStart(today)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function customProgress(q: CustomQuest, today: Day): { done: number; target: number; complete: boolean; claimed: boolean } {
  const start = weekStart(today)
  const done = q.marks.filter((d) => d >= start && daysBetween(start, d) < 7).length
  return { done: Math.min(done, q.target), target: q.target, complete: done >= q.target, claimed: q.claimedWeeks.includes(start) }
}
