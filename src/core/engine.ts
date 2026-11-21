import { addDays, dayOf, type Day } from './day'
import { levelProgress, type LevelProgress } from './leveling'
import { initialLives, LIFE_PACKS, refreshLives, type LifePack, type LivesState } from './lives'
import { DIFFICULTY_REWARD, type Completion, type Habit } from './models'
import { Plan, type DayResult } from './plan'
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
  /** Итоги закрытых дней — не пересчитываются при изменении привычек. */
  dayResults: Record<Day, DayResult>
  /** Лучшая серия среди закрытых дней. */
  bestPastStreak: number
  /** Лучшая серия с учётом сегодняшнего дня. */
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
  dayResults: {},
  bestPastStreak: 0,
  bestStreak: 0,
})

/** Загрузить сохранённое состояние: недостающие поля (из старых версий) берутся по умолчанию. */
export function loadState(raw: unknown): GameState {
  const base = initialState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const r = raw as Partial<Record<keyof GameState, unknown>>
  const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d)
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const obj = <T extends object>(v: unknown, d: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? { ...d, ...(v as Partial<T>) } : d
  const day = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    version: 1,
    habits: arr<Habit>(r.habits, []).filter((h) => h && typeof h === 'object' && typeof h.id === 'string'),
    completions: arr<Completion>(r.completions, []).filter((c) => c && typeof c === 'object'),
    totalXp: num(r.totalXp, 0),
    coins: Math.max(0, num(r.coins, 0)),
    xpByDay: obj(r.xpByDay, {}),
    bonusByDay: obj(r.bonusByDay, {}),
    lives: obj(r.lives, base.lives),
    shields: {
      purchased: num(obj<Partial<ShieldsState>>(r.shields, {}).purchased, 0),
      freeUsedWeeks: arr<Day>(obj<Partial<ShieldsState>>(r.shields, {}).freeUsedWeeks, []),
    },
    shieldedDays: arr<Day>(r.shieldedDays, []),
    lastProcessedDay: day(r.lastProcessedDay),
    startDay: day(r.startDay),
    dayResults: obj(r.dayResults, {}),
    // В старых сохранениях был только bestStreak.
    bestPastStreak: num(r.bestPastStreak, num(r.bestStreak, 0)),
    bestStreak: num(r.bestStreak, 0),
  }
}

/** Проверка параметров привычки. Возвращает текст ошибки или null. */
export function validateHabit(h: Habit): string | null {
  if (!h.name.trim()) return 'Нужно название'
  const f = h.frequency
  if (f.kind === 'weekdays' && (f.days.length === 0 || f.days.some((d) => d < 1 || d > 7 || !Number.isInteger(d)))) {
    return 'Выберите хотя бы один день недели'
  }
  if (f.kind === 'timesPerWeek' && (!Number.isInteger(f.times) || f.times < 1 || f.times > 7)) {
    return 'От 1 до 7 раз в неделю'
  }
  return null
}

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
    return new Plan(this.state.habits, this.state.completions, this.state.dayResults)
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
    // Часы перевели назад (или перелёт на запад): дни начиная с сегодняшнего снова открыты.
    if (this.state.lastProcessedDay && this.state.lastProcessedDay >= today) {
      for (const day of Object.keys(this.state.dayResults)) {
        if (day >= today) delete this.state.dayResults[day]
      }
      this.state.lastProcessedDay = yesterday
    }
    const earliest = this.earliest(today)
    const saved: Day[] = []
    const plan = this.plan // видит state.dayResults по ссылке, поэтому замороженные итоги сразу учитываются
    let day = this.state.lastProcessedDay ? addDays(this.state.lastProcessedDay, 1) : this.state.startDay
    for (; day <= yesterday; day = addDays(day, 1)) {
      // Закрываем день: фиксируем итог по набору привычек, который был в этот момент.
      const result = plan.liveResult(day)
      this.state.dayResults[day] = result

      if (result === 'missed' && !this.state.shieldedDays.includes(day)) {
        const before = overallStreak(addDays(day, -1), plan, this.shielded, earliest)
        if (before > 0) {
          // Пропуски подряд до ближайшего засчитанного дня (или до вчера).
          const run: Day[] = []
          for (let x = day; x <= yesterday; x = addDays(x, 1)) {
            const r = this.state.dayResults[x] ?? plan.liveResult(x)
            if (r === 'met') break
            if (r === 'missed') run.push(x)
          }
          // Щиты тратятся, только если их хватает на все пропуски — иначе серию всё равно не спасти.
          let shields: ShieldsState | null = this.state.shields
          for (const x of run) shields = shields && consumeShield(shields, x)
          if (shields) {
            this.state.shields = shields
            this.state.shieldedDays.push(...run)
            saved.push(...run)
          }
        }
      }
      this.state.bestPastStreak = Math.max(
        this.state.bestPastStreak,
        overallStreak(day, plan, this.shielded, earliest),
      )
      this.state.lastProcessedDay = day
    }
    this.checkDayBonus(today)
    this.updateBestStreak(now)
    return saved
  }

  private updateBestStreak(now: Date) {
    this.state.bestStreak = Math.max(this.state.bestPastStreak, this.currentStreak(now))
  }

  /** Бонус «все привычки дня выполнены», если он ещё не выдан. */
  private checkDayBonus(day: Day): { xp: number; coins: number } | null {
    if (this.state.bonusByDay[day] || !this.plan.allFixedDone(day)) return null
    const xp = this.grantXp(ALL_DONE_BONUS.xp, day)
    this.state.coins += ALL_DONE_BONUS.coins
    const bonus = { xp, coins: ALL_DONE_BONUS.coins }
    this.state.bonusByDay[day] = bonus
    return bonus
  }

  // ---------- Привычки ----------

  /**
   * Добавить привычку. Интерфейс всегда передаёт `now`: прошедшие дни закрываются
   * до изменения, чтобы новая привычка не попала в их итоги.
   */
  addHabit(habit: Habit, now?: Date) {
    const error = validateHabit(habit)
    if (error) throw new Error(error)
    if (now) this.startOfDay(now)
    this.state.habits.push(habit)
  }

  /**
   * Изменить привычку. Если передать `now`, сразу проверяется бонус дня
   * (например, архивировали последнюю невыполненную привычку).
   */
  updateHabit(habit: Habit, now?: Date) {
    const error = validateHabit(habit)
    if (error) throw new Error(error)
    // Сначала закрываем прошедшие дни по старому набору привычек.
    if (now) this.startOfDay(now)
    const i = this.state.habits.findIndex((h) => h.id === habit.id)
    if (i >= 0) this.state.habits[i] = habit
    if (now) this.checkDayBonus(dayOf(now))
  }

  /** Отметить привычку выполненной сегодня. */
  complete(habitId: string, now: Date): Result<RewardEvent, CompletionError> {
    const habit = this.state.habits.find((h) => h.id === habitId)
    if (!habit) return fail('habitNotFound')
    if (habit.archived) return fail('habitArchived')
    // Сначала закрываем прошедшие дни (щиты, жизни), чтобы множитель был верным.
    this.startOfDay(now)
    const today = dayOf(now)
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

    const bonus = this.checkDayBonus(today)
    if (bonus) {
      event.bonusXp = bonus.xp
      event.bonusCoins = bonus.coins
      if (bonus.xp < ALL_DONE_BONUS.xp) event.cappedByDailyLimit = true
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
    const rest = this.state.completions.filter((_, i) => i !== index)
    const bonus = this.state.bonusByDay[today]
    // Бонус дня забирается, только если без этой отметки выполнены не все привычки.
    const revokeBonus = bonus && !new Plan(this.state.habits, rest).allFixedDone(today) ? bonus : null
    if (this.state.coins < completion.coins + (revokeBonus?.coins ?? 0)) return fail('coinsAlreadySpent')

    this.state.completions = rest
    this.revokeXp(completion.xp, today)
    this.state.coins -= completion.coins
    if (revokeBonus) {
      this.revokeXp(revokeBonus.xp, today)
      this.state.coins -= revokeBonus.coins
      delete this.state.bonusByDay[today]
    }
    this.updateBestStreak(now)
    return ok(undefined)
  }

  // ---------- XP и монеты из других источников (квесты, сундуки) ----------

  award(xp: number, coins: number, now: Date): RewardEvent {
    const today = dayOf(now)
    const levelBefore = this.level.level
    const granted = this.grantXp(xp, today)
    coins = Math.max(0, coins)
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
    this.startOfDay(now)
    if (this.state.lives.count <= 0) return false
    this.state.lives = { ...this.state.lives, count: this.state.lives.count - 1 }
    return true
  }
}
