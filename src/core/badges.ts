import type { Day } from './day'
import type { Completion, Habit } from './models'

export type Rarity = 'common' | 'rare' | 'legendary'

export interface BadgeContext {
  habits: Habit[]
  completions: Completion[]
  level: number
  bestStreak: number
  /** Лучшая серия по одной привычке среди активных. */
  bestHabitStreak: number
  perfectDays: number
  questsClaimed: number
  /** Рекорды мини-игр. */
  gameRecords: Partial<Record<string, number>>
}

export interface BadgeDef {
  id: string
  title: string
  description: string
  rarity: Rarity
  icon: string
  earned: (c: BadgeContext) => boolean
}

const countCategory = (c: BadgeContext, cat: Habit['category']) => {
  const ids = new Set(c.habits.filter((h) => h.category === cat).map((h) => h.id))
  return c.completions.filter((x) => ids.has(x.habitId)).length
}

/** Бейджи первой версии (ТЗ 3.5) и бейдж за рекорд в «Перекусе» (ТЗ 3.6). */
export const BADGES: BadgeDef[] = [
  { id: 'first', title: 'Первый шаг', description: 'Первая отмеченная привычка', rarity: 'common', icon: '🌱', earned: (c) => c.completions.length > 0 },
  { id: 'perfect', title: 'Идеальный день', description: 'Все привычки дня выполнены', rarity: 'common', icon: '⭐', earned: (c) => c.perfectDays >= 1 },
  { id: 'week', title: 'Первая неделя', description: 'Серия 7 дней', rarity: 'common', icon: '📅', earned: (c) => c.bestStreak >= 7 },
  { id: 'med10', title: '10 медитаций', description: '10 отметок медитации', rarity: 'common', icon: '🧘', earned: (c) => countCategory(c, 'meditation') >= 10 },
  {
    id: 'earlybird',
    title: 'Ранняя пташка',
    description: '10 тренировок, отмеченных до 9 утра',
    rarity: 'rare',
    icon: '🐦',
    earned: (c) => {
      const ids = new Set(c.habits.filter((h) => h.category === 'workout').map((h) => h.id))
      return c.completions.filter((x) => ids.has(x.habitId) && x.at !== undefined && new Date(x.at).getHours() < 9).length >= 10
    },
  },
  { id: 'level5', title: 'Ученик', description: 'Достигнут 5-й уровень', rarity: 'common', icon: '🎓', earned: (c) => c.level >= 5 },
  { id: 'quests10', title: 'Искатель приключений', description: '10 завершённых квестов', rarity: 'rare', icon: '🗺️', earned: (c) => c.questsClaimed >= 10 },
  { id: 'level10', title: 'Адепт', description: 'Достигнут 10-й уровень', rarity: 'rare', icon: '🏅', earned: (c) => c.level >= 10 },
  { id: 'month', title: 'Месяц в ритме', description: 'Общая серия 30 дней', rarity: 'rare', icon: '🔥', earned: (c) => c.bestStreak >= 30 },
  { id: 'snack100', title: 'Гурман', description: '100 очков в «Перекусе»', rarity: 'rare', icon: '🥕', earned: (c) => (c.gameRecords.snack ?? 0) >= 100 },
  { id: 'lines500', title: 'Садовник', description: '500 очков в «Грядке»', rarity: 'rare', icon: '🧺', earned: (c) => (c.gameRecords.lines ?? 0) >= 500 },
  { id: 'blocks1000', title: 'Прораб', description: '1000 очков в «Блоках»', rarity: 'rare', icon: '🧱', earned: (c) => (c.gameRecords.blocks ?? 0) >= 1000 },
  { id: 'habit30', title: 'Железная воля', description: 'Одна привычка 30 раз подряд по плану', rarity: 'legendary', icon: '💎', earned: (c) => c.bestHabitStreak >= 30 },
]

export type BadgesState = Record<string, Day>
