import { weekStart, type Day } from './day'

/** Щиты серии (ТЗ 3.3): 1 бесплатный в неделю (не копится), дополнительные — за 50 монет. */
export const SHIELD_PRICE = 50

export interface ShieldsState {
  /** Купленные щиты в запасе. */
  purchased: number
  /** Недели (по понедельнику), в которые бесплатный щит уже использован. */
  freeUsedWeeks: Day[]
}

export const initialShields = (): ShieldsState => ({ purchased: 0, freeUsedWeeks: [] })

export function freeShieldAvailable(s: ShieldsState, day: Day): boolean {
  return !s.freeUsedWeeks.includes(weekStart(day))
}

export function shieldsAvailable(s: ShieldsState, day: Day): number {
  return s.purchased + (freeShieldAvailable(s, day) ? 1 : 0)
}

/** Использовать щит на день: сначала бесплатный щит той недели, потом купленный. null — щитов нет. */
export function consumeShield(s: ShieldsState, day: Day): ShieldsState | null {
  if (freeShieldAvailable(s, day)) return { ...s, freeUsedWeeks: [...s.freeUsedWeeks, weekStart(day)] }
  if (s.purchased > 0) return { ...s, purchased: s.purchased - 1 }
  return null
}
