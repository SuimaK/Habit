import type { Day } from './day'

/**
 * Мини-игры (ТЗ 3.6): партия стоит жизнь, рекорды дают бейджи (не монеты),
 * дневной лимит игры настраивается, по умолчанию 20 минут.
 */
export type GameId = 'snack' | 'bubbles' | 'blocks'
export const DEFAULT_GAME_LIMIT_MIN = 20
export const GAME_LIMIT_OPTIONS = [10, 20, 30, 45, 60, 0] as const

export interface GamesState {
  records: Partial<Record<GameId, number>>
  /** Секунды игры по дням. */
  playedByDay: Record<Day, number>
  /** Лимит в минутах в день; 0 — без лимита. */
  limitMin: number
}

export const initialGames = (): GamesState => ({ records: {}, playedByDay: {}, limitMin: DEFAULT_GAME_LIMIT_MIN })

export type GameBlock = 'noLives' | 'limitReached'

/** Сколько секунд игры осталось сегодня; Infinity — без лимита. */
export function playLeftSec(g: GamesState, day: Day): number {
  if (!g.limitMin) return Infinity
  return Math.max(0, g.limitMin * 60 - (g.playedByDay[day] ?? 0))
}

/** «Блоки» открываются на этом уровне (ТЗ 3.6). */
export const BLOCKS_LEVEL = 10
