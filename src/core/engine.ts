import { addDays, dayOf, type Day } from './day'
import { levelProgress, type LevelProgress } from './leveling'
import { initialLives, LIFE_PACKS, refreshLives, type LifePack, type LivesState } from './lives'
import { DIFFICULTY_REWARD, type Completion, type Habit } from './models'
import { Plan } from './plan'
import { initialShields, SHIELD_PRICE, consumeShield, type ShieldsState } from './shields'
import { currentOverallStreak, habitStreak, overallStreak, streakMultiplier } from './streaks'

export const DAILY_XP_CAP = 500
export const ALL_DONE_BONUS = { xp: 30, coins: 5 }

/** Всё состояние игры. Обычный JSON — сохраняется целиком. */
export interface GameState {
  version: 1
  habits: Habit[]
  completions: Completion[]
  totalXp: number
  coins: number
  /** XP, начисленный за день, — для лимита 500 XP. */
  xpByDay: Record<Day, number>
  /** Бонус «все привычки дня выполнены»: что начислено за день. */
  bonusByDay: Record<Day, { xp: number; coins: number }>
  lives: LivesState
  shields: ShieldsState
  shieldedDays: Day[]
  /** Последний прошедший день, к которому уже применены щиты. */
  lastProcessedDay: Day | null
  /** День начала истории. */
  startDay: Day | null
  bestStreak: number
}

export const initialState = (): GameState => ({
  version: 1,
  habits: [],
  completions: [],
  totalXp: 0,
  coins: 0,
  xpByDay: {},
  bonusByDay: {},
  lives: initialLives(),
  shields: initialShields(),
  shieldedDays: [],
  lastProcessedDay: null,
  startDay: null,
  bestStreak: 0,
})

export type CompletionError =
  | 'habitNotFound'
  | 'habitArchived'
  | 'notScheduledToday'
  | 'alreadyCompletedToday'
  | 'weeklyTargetReached'
  | 'notCompletedToday'
  /** Отменить нельзя: монеты за отметку уже потрачены. */
  | 'coinsAlreadySpent'

export type PurchaseError = 'notEnoughCoins'

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
const fail = <E>(error: E): Result<never, E> => ({ ok: false, error })

/** Что получено за действие — для экрана награды и всплывающего «+10 XP». */
export interface RewardEvent {
  xp: number
  coins: number
  bonusXp: number
  bonusCoins: number
  multiplier: number
  /** XP срезан дневным лимитом. */
  cappedByDailyLimit: boolean
  levelBefore: number
  levelAfter: number
}

/**
 * Игровая логика. Не знает про интерфейс и хранение: время передаётся снаружи,
 * методы меняют `state` на месте (интерфейс работает с копией через `clone()`).
 */
export class GameEngine {
  state: GameState

  constructor(state: GameState = initialState()) {
    this.state = state
  }

  clone(): GameEngine {
    return new GameEngine(structuredClone(this.state))
  }

  // ---------- Вычисляемые значения ----------

  get plan(): Plan {
    return new Plan(this.state.habits, this.state.completions)
  }

  get level(): LevelProgress {
    return levelProgress(this.state.totalXp)
  }

  private earliest(today: Day): Day {
    return this.state.startDay ?? today
  }

  private get shielded(): Set<Day> {
    return new Set(this.state.shieldedDays)
  }

  currentStreak(now: Date): number {
    const today = dayOf(now)
    return currentOverallStreak(today, this.plan, this.shielded, this.earliest(today))
  }

  /** Серия для множителя — по вчерашний день, чтобы множитель не менялся в течение дня. */
  multiplierStreak(now: Date): number {
    const today = dayOf(now)
    return overallStreak(addDays(today, -1), this.plan, this.shielded, this.earliest(today))
  }

  habitStreak(habitId: string, now: Date): number {
    const habit = this.state.habits.find((h) => h.id === habitId)
    if (!habit) return 0
    const today = dayOf(now)
    return habitStreak(habit, today, this.plan, this.earliest(today))
  }

  isCompleted(habitId: string, day: Day): boolean {
    return this.state.completions.some((c) => c.habitId === habitId && c.day === day)
  }

  xpEarned(day: Day): number {
    return this.state.xpByDay[day] ?? 0
  }

  // ---------- Начало дня ----------

  /**
   * Вызывать при запуске и при возврате в приложение: выдаёт жизни, применяет щиты
   * к пропущенным прошедшим дням, обновляет лучшую серию. Возвращает спасённые щитом дни.
   */
  startOfDay(now: Date): Day[] {
    const today = dayOf(now)
    this.state.startDay ??= today
    this.state.lives = refreshLives(this.state.lives, now)

    const yesterday = addDays(today, -1)
    const saved: Day[] = []
    const plan = this.plan
    let day = this.state.lastProcessedDay ? addDays(this.state.lastProcessedDay, 1) : this.state.startDay
    for (; day <= yesterday; day = addDays(day, 1)) {
      if (plan.result(day) === 'missed') {
        const before = overallStreak(addDays(day, -1), plan, this.shielded, this.earliest(today))
        // Щит тратится, только если есть что спасать.
        const next = before > 0 ? consumeShield(this.state.shields, day) : null
        if (next) {
          this.state.shields = next
          this.state.shieldedDays.push(day)
          saved.push(day)
        }
      }
      this.state.lastProcessedDay = day
    }
    this.updateBestStreak(now)
    return saved
  }

  private updateBestStreak(now: Date) {
    this.state.bestStreak = Math.max(this.state.bestStreak, this.currentStreak(now))
  }

  // ---------- Привычки ----------

  addHabit(habit: Habit) {
    this.state.habits.push(habit)
  }

  updateHabit(habit: Habit) {
    const i = this.state.habits.findIndex((h) => h.id === habit.id)
    if (i >= 0) this.state.habits[i] = habit
  }

  /** Отметить привычку выполненной сегодня. */
  complete(habitId: string, now: Date): Result<RewardEvent, CompletionError> {
    const habit = this.state.habits.find((h) => h.id === habitId)
    if (!habit) return fail('habitNotFound')
    if (habit.archived) return fail('habitArchived')
    const today = dayOf(now)
    this.state.startDay ??= today
    if (this.isCompleted(habitId, today)) return fail('alreadyCompletedToday')

    const f = habit.frequency
    if (f.kind === 'weekdays' && !this.plan.fixedHabits(today).some((h) => h.id === habitId)) {
      return fail('notScheduledToday')
    }
    if (f.kind === 'timesPerWeek' && this.plan.doneInWeek(habitId, today) >= f.times) {
      return fail('weeklyTargetReached')
    }

    const levelBefore = this.level.level
    const multiplier = streakMultiplier(this.multiplierStreak(now))
    const reward = DIFFICULTY_REWARD[habit.difficulty]
    const wantedXp = Math.round(reward.xp * multiplier)
    const xp = this.grantXp(wantedXp, today)
    this.state.coins += reward.coins
    this.state.completions.push({ habitId, day: today, xp, coins: reward.coins })

    const event: RewardEvent = {
      xp,
      coins: reward.coins,
      bonusXp: 0,
      bonusCoins: 0,
      multiplier,
      cappedByDailyLimit: xp < wantedXp,
      levelBefore,
      levelAfter: levelBefore,
    }

    if (!this.state.bonusByDay[today] && this.plan.allFixedDone(today)) {
      const bonusXp = this.grantXp(ALL_DONE_BONUS.xp, today)
      this.state.coins += ALL_DONE_BONUS.coins
      this.state.bonusByDay[today] = { xp: bonusXp, coins: ALL_DONE_BONUS.coins }
      event.bonusXp = bonusXp
      event.bonusCoins = ALL_DONE_BONUS.coins
      if (bonusXp < ALL_DONE_BONUS.xp) event.cappedByDailyLimit = true
    }

    event.levelAfter = this.level.level
    this.updateBestStreak(now)
    return ok(event)
  }

  /**
   * Снять сегодняшнюю отметку (ошибочный тап). Начисленное забирается — вместе с бонусом дня,
   * если после отмены выполнены не все привычки.
   */
  undo(habitId: string, now: Date): Result<void, CompletionError> {
    const today = dayOf(now)
    const index = this.state.completions.findIndex((c) => c.habitId === habitId && c.day === today)
    if (index < 0) return fail('notCompletedToday')
    const completion = this.state.completions[index]
    const bonus = this.state.bonusByDay[today]
    if (this.state.coins < completion.coins + (bonus?.coins ?? 0)) return fail('coinsAlreadySpent')

    this.state.completions.splice(index, 1)
    this.revokeXp(completion.xp, today)
    this.state.coins -= completion.coins
    if (bonus && !this.plan.allFixedDone(today)) {
      this.revokeXp(bonus.xp, today)
      this.state.coins -= bonus.coins
      delete this.state.bonusByDay[today]
    }
    return ok(undefined)
  }

  // ---------- XP и монеты из других источников (квесты, сундуки) ----------

  award(xp: number, coins: number, now: Date): RewardEvent {
    const today = dayOf(now)
    const levelBefore = this.level.level
    const granted = this.grantXp(xp, today)
    this.state.coins += coins
    return {
      xp: granted,
      coins,
      bonusXp: 0,
      bonusCoins: 0,
      multiplier: 1,
      cappedByDailyLimit: granted < xp,
      levelBefore,
      levelAfter: this.level.level,
    }
  }

  private grantXp(amount: number, day: Day): number {
    const room = Math.max(0, DAILY_XP_CAP - this.xpEarned(day))
    const granted = Math.min(Math.max(0, amount), room)
    this.state.totalXp += granted
    this.state.xpByDay[day] = this.xpEarned(day) + granted
    return granted
  }

  private revokeXp(amount: number, day: Day) {
    this.state.totalXp -= amount
    this.state.xpByDay[day] = this.xpEarned(day) - amount
  }

  // ---------- Магазин и игры ----------

  buyLives(pack: LifePack): Result<void, PurchaseError> {
    const { lives, price } = LIFE_PACKS[pack]
    if (this.state.coins < price) return fail('notEnoughCoins')
    this.state.coins -= price
    this.state.lives = { ...this.state.lives, count: this.state.lives.count + lives }
    return ok(undefined)
  }

  buyShield(): Result<void, PurchaseError> {
    if (this.state.coins < SHIELD_PRICE) return fail('notEnoughCoins')
    this.state.coins -= SHIELD_PRICE
    this.state.shields = { ...this.state.shields, purchased: this.state.shields.purchased + 1 }
    return ok(undefined)
  }

  /** Начать партию: обновляет жизни и списывает одну. false — жизней нет. */
  startGame(now: Date): boolean {
    this.state.lives = refreshLives(this.state.lives, now)
    if (this.state.lives.count <= 0) return false
    this.state.lives = { ...this.state.lives, count: this.state.lives.count - 1 }
    return true
  }
}
