import type { Day } from './day'

/**
 * Личные награды (ТЗ 3.5): реальный подарок себе за монеты.
 * Цена назначается самой; «Взять» списывает монеты и пишет в историю.
 */
export const REWARD_MAX_PRICE = 100_000
export const REWARD_NAME_MAX = 60

export interface PersonalReward {
  id: string
  name: string
  price: number
  archived?: boolean
}

export interface Redemption {
  id: string
  rewardId: string
  /** Имя и цена на момент покупки — история не меняется при правке награды. */
  name: string
  price: number
  day: Day
}

export type RewardError = 'emptyName' | 'badPrice' | 'notFound' | 'notEnoughCoins' | 'tooLate'

export function validateReward(r: Pick<PersonalReward, 'name' | 'price'>): RewardError | null {
  if (!r.name.trim()) return 'emptyName'
  if (!Number.isInteger(r.price) || r.price < 1 || r.price > REWARD_MAX_PRICE) return 'badPrice'
  return null
}
