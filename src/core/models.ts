import type { Day } from './day'

/** Направление привычки. Каждое наполняет свою шкалу-потребность персонажа. */
export type Category = 'nutrition' | 'workout' | 'meditation' // Энергия · Сила · Дзен

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Награда за привычку по сложности (ТЗ 3.1). */
export const DIFFICULTY_REWARD: Record<Difficulty, { xp: number; coins: number }> = {
  easy: { xp: 10, coins: 1 },
  medium: { xp: 25, coins: 3 },
  hard: { xp: 50, coins: 5 },
}

export type Frequency =
  | { kind: 'daily' }
  /** В выбранные дни недели: 1 = пн … 7 = вс. */
  | { kind: 'weekdays'; days: number[] }
  /** N раз в неделю в любые дни («3 тренировки в неделю»). */
  | { kind: 'timesPerWeek'; times: number }

export interface Habit {
  id: string
  name: string
  category: Category
  difficulty: Difficulty
  frequency: Frequency
  /** Привычка в архиве не входит в план и не отмечается. */
  archived: boolean
  /** Цель на одно выполнение: «10 минут», «2 порции». Отметка всё равно одна — «сделано». */
  target?: HabitTarget
  /** Когда удобно делать — для порядка в списке «Сегодня». */
  timeOfDay?: TimeOfDay
}

export type TargetUnit = 'times' | 'minutes' | 'portions'
export interface HabitTarget {
  amount: number
  unit: TargetUnit
}
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'any'

/** Персонаж и итоги онбординга. */
export interface Profile {
  name: string
  skin: string
  hair: string
  shirt: string
  /** Дата прохождения онбординга. */
  createdDay: Day
}

/** Отметка выполнения. Хранит начисленное, чтобы корректно отменить. */
export interface Completion {
  habitId: string
  day: Day
  xp: number
  coins: number
}
