/**
 * Уровни и титулы (ТЗ 3.2).
 * Для перехода с уровня N−1 на уровень N нужно 100 · N^1.5 XP. При 130–150 XP в день
 * уровень 2 берётся примерно за 2 дня, уровень 10 — примерно за 3 месяца.
 */

/** XP для перехода на уровень `level` с предыдущего. Для уровня 1 — 0. */
export function xpToReach(level: number): number {
  if (level < 2) return 0
  return Math.round(100 * Math.pow(level, 1.5))
}

/** Суммарный XP с нуля, при котором достигается уровень. */
export function totalXpForLevel(level: number): number {
  let sum = 0
  for (let n = 2; n <= level; n++) sum += xpToReach(n)
  return sum
}

export interface LevelProgress {
  level: number
  /** XP, набранный внутри текущего уровня. */
  xpInLevel: number
  /** XP, нужный на весь переход к следующему уровню. */
  xpForNextLevel: number
}

export function levelProgress(totalXp: number): LevelProgress {
  let level = 1
  let remaining = Math.max(0, totalXp)
  while (remaining >= xpToReach(level + 1)) {
    remaining -= xpToReach(level + 1)
    level++
  }
  return { level, xpInLevel: remaining, xpForNextLevel: xpToReach(level + 1) }
}

/** Титул меняется каждые 5 уровней: 1–4, 5–9, 10–14, 15–19, 20+. */
export const TITLES = ['Новичок', 'Ученик', 'Адепт', 'Мастер', 'Гуру'] as const
export type Title = (typeof TITLES)[number]

export function titleFor(level: number): Title {
  const index = Math.min(Math.floor(Math.max(level, 1) / 5), TITLES.length - 1)
  return TITLES[index]
}
