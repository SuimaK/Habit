/**
 * Жизни для мини-игр (ТЗ 3.6).
 * Каждый день в 06:00 запас бесплатно пополняется до 5 жизней (выше 5 бесплатно не растёт).
 * Купленные жизни добавляются сверх лимита.
 */
export const FREE_LIVES_PER_DAY = 5
export const FREE_LIVES_CAP = 5
export const LIVES_REFRESH_HOUR = 6

export const LIFE_PACKS = {
  one: { lives: 1, price: 5 },
  five: { lives: 5, price: 20 },
} as const
export type LifePack = keyof typeof LIFE_PACKS

export interface LivesState {
  count: number
  /** Граница 06:00 (мс), за которую бесплатные жизни уже выданы. */
  lastRefresh: number | null
}

export const initialLives = (): LivesState => ({ count: FREE_LIVES_PER_DAY, lastRefresh: null })

/** Последняя граница 06:00, не позже `now`. */
export function lastBoundary(now: Date): Date {
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate(), LIVES_REFRESH_HOUR)
  if (b > now) b.setDate(b.getDate() - 1)
  return b
}

/** Следующая граница 06:00 — для подписи «обновятся в 06:00». */
export function nextBoundary(now: Date): Date {
  const b = lastBoundary(now)
  b.setDate(b.getDate() + 1)
  return b
}

/** Выдаёт бесплатные жизни за все прошедшие с прошлого раза границы 06:00. */
export function refreshLives(lives: LivesState, now: Date): LivesState {
  const boundary = lastBoundary(now)
  if (lives.lastRefresh === null) {
    // Первый запуск: стартовые жизни уже есть, запоминаем границу.
    return { ...lives, lastRefresh: boundary.getTime() }
  }
  if (boundary.getTime() <= lives.lastRefresh) return lives
  let count = lives.count
  // Считаем границы календарно: с учётом перехода на летнее время сутки бывают 23/25 ч.
  const cursor = new Date(lives.lastRefresh)
  while (cursor < boundary && count < FREE_LIVES_CAP) {
    cursor.setDate(cursor.getDate() + 1)
    count = Math.min(FREE_LIVES_CAP, count + FREE_LIVES_PER_DAY)
  }
  return { count, lastRefresh: boundary.getTime() }
}
