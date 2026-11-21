import { addDays, dayOf, weekStart, type Day } from './day'
import { levelProgress, type LevelProgress } from './leveling'
import { initialLives, LIFE_PACKS, refreshLives, type LifePack, type LivesState } from './lives'
import { DIFFICULTY_REWARD, type Completion, type Habit, type Profile, type Session } from './models'
import { Plan, type DayResult } from './plan'
import { BADGES, type BadgeContext, type BadgesState } from './badges'
import {
  BASE_CATEGORIES,
  DIRECTION_ICONS,
  DIRECTION_NAME_MAX,
  DIRECTIONS_MAX,
  activeDirections,
  allDirections,
  initialDirections,
  isBaseCategory,
  validateDirectionName,
  type CustomDirection,
  type DirectionError,
  type DirectionsState,
} from './directions'
import {
  DAILY_QUEST_REWARD,
  DAILY_SWAPS_PER_DAY,
  WEEKLY_QUEST_REWARD,
  dailyProgress,
  seededRandom,
  swapCandidate,
  generateDaily,
  generateWeekly,
  habitsKey,
  initialQuests,
  questAlive,
  weeklyProgress,
  rollChest,
  weeklyComplete,
  type ChestPrize,
  type DailyQuest,
  type QuestState,
} from './quests'
import {
  CUSTOM_QUEST_MAX,
  CUSTOM_QUEST_NAME_MAX,
  CUSTOM_QUEST_REWARD,
  customClaimsThisWeek,
  customProgress,
  pendingLastWeek,
  validateCustomQuest,
  type CustomQuest,
  type CustomQuestError,
} from './customQuests'
import { DEFAULT_GAME_LIMIT_MIN, initialGames, playLeftSec, type GameBlock, type GameId, type GamesState } from './games'
import { REWARD_MAX_PRICE, REWARD_NAME_MAX, validateReward, type PersonalReward, type Redemption, type RewardError } from './rewards'
import { initialShields, SHIELD_PRICE, consumeShield, type ShieldsState } from './shields'
import { currentOverallStreak, habitStreak, overallStreak, streakMultiplier } from './streaks'

export const DAILY_XP_CAP = 500
export const MAX_TARGET = 100_000
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
  /** Персонаж. null — онбординг ещё не пройден. */
  profile: Profile | null
  quests: QuestState
  /** Полученные бейджи: id → день получения. */
  badges: BadgesState
  /** Сессии по таймеру. */
  sessions: Session[]
  /** Личные награды и история их получения. */
  rewards: PersonalReward[]
  redemptions: Redemption[]
  /** Свои квесты. */
  customQuests: CustomQuest[]
  /** Мини-игры: рекорды, время, лимит. */
  games: GamesState
  /** Направления: переименования стандартных и свои. */
  directions: DirectionsState
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
  profile: null,
  quests: initialQuests(),
  badges: {},
  sessions: [],
  rewards: [],
  redemptions: [],
  customQuests: [],
  games: initialGames(),
  directions: initialDirections(),
})

function parseDirections(v: unknown): DirectionsState {
  const d = initialDirections()
  if (!v || typeof v !== 'object' || Array.isArray(v)) return d
  const raw = v as Partial<DirectionsState>
  const text = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined)
  const icon = (x: unknown) => (typeof x === 'string' && (DIRECTION_ICONS as readonly string[]).includes(x) ? x : undefined)
  if (raw.base && typeof raw.base === 'object')
    for (const id of BASE_CATEGORIES) {
      const b = (raw.base as Record<string, unknown>)[id] as { name?: unknown; icon?: unknown } | undefined
      if (!b || typeof b !== 'object') continue
      const name = text(b.name, DIRECTION_NAME_MAX)
      const ic = icon(b.icon)
      if (name || ic) d.base[id] = { ...(name ? { name } : {}), ...(ic ? { icon: ic } : {}) }
    }
  if (Array.isArray(raw.custom)) {
    let active = BASE_CATEGORIES.length
    for (const c of raw.custom as Partial<CustomDirection>[]) {
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id || isBaseCategory(c.id)) continue
      if (d.custom.some((x) => x.id === c.id)) continue
      const name = text(c.name, DIRECTION_NAME_MAX)
      if (!name) continue
      // Сверх лимита направления сохраняются как удалённые, чтобы не потерять привычки.
      const archived = c.archived === true || active >= DIRECTIONS_MAX
      if (!archived) active++
      d.custom.push({ id: c.id, name, icon: icon(c.icon) ?? '⭐', timer: c.timer === true, ...(archived ? { archived: true } : {}) })
    }
  }
  return d
}

/** Загрузить сохранённое состояние: недостающие поля (из старых версий) берутся по умолчанию. */
/** Привычка из сохранения пригодна к работе: все обязательные поля на месте. */
function isValidHabit(h: unknown): h is Habit {
  if (!h || typeof h !== 'object') return false
  const x = h as Partial<Habit>
  const f = x.frequency as Partial<Habit['frequency']> | undefined
  const freqOk =
    !!f &&
    typeof f === 'object' &&
    (f.kind === 'daily' ||
      (f.kind === 'weekdays' && Array.isArray(f.days) && f.days.length > 0 && f.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) ||
      (f.kind === 'timesPerWeek' && Number.isInteger(f.times) && (f.times as number) >= 1 && (f.times as number) <= 7))
  return (
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.category === 'string' &&
    x.category !== '' &&
    (x.difficulty === 'easy' || x.difficulty === 'medium' || x.difficulty === 'hard') &&
    freqOk &&
    (x.archived === undefined || typeof x.archived === 'boolean')
  )
}

const isDay = (d: unknown): d is Day => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

export function loadState(raw: unknown): GameState {
  const base = initialState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const r = raw as Partial<Record<keyof GameState, unknown>>
  const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d)
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const obj = <T extends object>(v: unknown, d: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? { ...d, ...(v as Partial<T>) } : d
  const day = (v: unknown) => (typeof v === 'string' ? v : null)
  const directions = parseDirections(r.directions)
  const known = new Set(allDirections(directions).map((d) => d.id))
  return {
    version: 1,
    // Привычка с неизвестным направлением (испорченный файл) переносится в «Питание».
    habits: arr<Habit>(r.habits, [])
      .filter(isValidHabit)
      .map((h) => (known.has(h.category) ? h : { ...h, category: 'nutrition' })),
    directions,
    completions: arr<Completion>(r.completions, [])
      .filter((c) => c && typeof c === 'object' && typeof c.habitId === 'string' && isDay(c.day))
      .map((c) => ({
        ...c,
        xp: Math.max(0, num(c.xp, 0)),
        coins: Math.max(0, num(c.coins, 0)),
        ...(typeof c.at === 'number' && Number.isFinite(c.at) ? {} : { at: undefined }),
      })),
    totalXp: num(r.totalXp, 0),
    coins: Math.max(0, num(r.coins, 0)),
    xpByDay: obj(r.xpByDay, {}),
    bonusByDay: obj(r.bonusByDay, {}),
    lives: (() => {
      const l = obj<Partial<LivesState>>(r.lives, {})
      return {
        count: Math.max(0, Math.round(num(l.count, base.lives.count))),
        lastRefresh: typeof l.lastRefresh === 'number' && Number.isFinite(l.lastRefresh) ? l.lastRefresh : null,
      }
    })(),
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
    quests: (() => {
      const q = obj<Partial<QuestState>>(r.quests, {})
      return {
        dailyDay: typeof q.dailyDay === 'string' ? q.dailyDay : null,
        habitsKey: typeof q.habitsKey === 'string' ? q.habitsKey : undefined,
        daily: arr<DailyQuest>(q.daily, []).filter(
          (x) => x && typeof x === 'object' && typeof x.id === 'string' && x.goal && typeof x.goal === 'object',
        ),
        weekly:
          q.weekly && typeof q.weekly === 'object' && Array.isArray(q.weekly.lines)
            ? { ...q.weekly, lines: q.weekly.lines.filter((l) => l && typeof l === 'object' && typeof l.target === 'number') }
            : null,
        claimedCount: num(q.claimedCount, 0),
        swapDay: typeof q.swapDay === 'string' && isDay(q.swapDay) ? q.swapDay : undefined,
        swaps: q.swaps === undefined ? undefined : Math.max(0, Math.floor(num(q.swaps, 0))),
        swappedOut: q.swappedOut === undefined ? undefined : arr<string>(q.swappedOut, []).filter((x) => typeof x === 'string'),
      }
    })(),
    badges: obj(r.badges, {}),
    sessions: arr<Session>(r.sessions, [])
      .filter((x) => x && typeof x === 'object' && typeof x.habitId === 'string' && typeof x.day === 'string')
      .map((x) => {
        const mood = (m: unknown) => (typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 5 ? m : undefined)
        return { habitId: x.habitId, day: x.day, minutes: Math.max(0, num(x.minutes, 0)), moodBefore: mood(x.moodBefore), moodAfter: mood(x.moodAfter) }
      }),
    rewards: arr<PersonalReward>(r.rewards, [])
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string')
      .map((x) => ({
        id: x.id,
        name: x.name.slice(0, REWARD_NAME_MAX),
        price: Math.min(REWARD_MAX_PRICE, Math.max(1, Math.round(num(x.price, 1)))),
        ...(x.archived === true ? { archived: true } : {}),
      }))
      .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i),
    redemptions: arr<Redemption>(r.redemptions, [])
      .filter(
        (x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.rewardId === 'string' &&
          typeof x.name === 'string' && typeof x.day === 'string' && typeof x.price === 'number' && Number.isFinite(x.price) && x.price >= 0,
      )
      .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
      .map((x) => ({ ...x, price: Math.round(x.price) })),
    games: (() => {
      const g = obj<Partial<GamesState>>(r.games, {})
      const records: GamesState['records'] = {}
      for (const [k, v] of Object.entries(obj<Record<string, unknown>>(g.records, {})))
        if ((k === 'snack' || k === 'bubbles' || k === 'blocks') && typeof v === 'number' && Number.isFinite(v) && v > 0) records[k] = Math.round(v)
      const playedByDay: Record<Day, number> = {}
      for (const [k, v] of Object.entries(obj<Record<string, unknown>>(g.playedByDay, {})))
        if (isDay(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) playedByDay[k] = v
      const limit = num(g.limitMin, DEFAULT_GAME_LIMIT_MIN)
      return { records, playedByDay, limitMin: limit >= 0 && limit <= 600 ? Math.round(limit) : DEFAULT_GAME_LIMIT_MIN }
    })(),
    customQuests: arr<CustomQuest>(r.customQuests, [])
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim() !== '')
      .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
      .map((x) => ({
        id: x.id,
        name: x.name.slice(0, CUSTOM_QUEST_NAME_MAX),
        difficulty: x.difficulty === 'medium' || x.difficulty === 'hard' ? x.difficulty : 'easy',
        target: Math.min(7, Math.max(1, Math.round(num(x.target, 1)))),
        marks: [...new Set(arr<Day>(x.marks, []).filter(isDay))],
        claimedWeeks: [...new Set(arr<Day>(x.claimedWeeks, []).filter(isDay))],
        ...(x.archived === true ? { archived: true } : {}),
      })),
    profile: (() => {
      const p = r.profile as Partial<Profile> | null | undefined
      if (!p || typeof p !== 'object' || typeof p.name !== 'string') return null
      const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d)
      return {
        ...p,
        name: p.name.slice(0, 40),
        skin: color(p.skin, '#f1c7a5'),
        hair: color(p.hair, '#6b4430'),
        shirt: color(p.shirt, '#e9875f'),
        createdDay: isDay(p.createdDay) ? p.createdDay : (day(r.startDay) ?? dayOf(new Date())),
      } as Profile
    })(),
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
  if (h.target && (!Number.isInteger(h.target.amount) || h.target.amount < 1 || h.target.amount > MAX_TARGET)) {
    return `Цель — целое число от 1 до ${MAX_TARGET.toLocaleString('ru-RU')}`
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
  /** Отменить нельзя: отметка засчитана в уже забранный квест. */
  | 'usedInQuest'

export type PurchaseError = 'notEnoughCoins'
export type ClaimError = 'notFound' | 'alreadyClaimed' | 'notReady'
export type SwapError = 'notFound' | 'claimed' | 'done' | 'limit' | 'noAlternatives'

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
  /** Бейджи, полученные этим действием. */
  newBadges: string[]
  /** Приз из сундука (недельный квест). */
  chest?: ChestPrize
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
    this.updateBestStreak(now)
    this.ensureQuests(today)
    this.checkBadges(now)
    return saved
  }

  // ---------- Таймер ----------

  /** Записать сессию по таймеру. Настроение — целое 1–5, иначе не сохраняется. */
  logSession(session: Session) {
    const mood = (m?: number) => (m !== undefined && Number.isInteger(m) && m >= 1 && m <= 5 ? m : undefined)
    this.state.sessions.push({
      ...session,
      minutes: Number.isFinite(session.minutes) ? Math.max(0, Math.round(session.minutes * 10) / 10) : 0,
      moodBefore: mood(session.moodBefore),
      moodAfter: mood(session.moodAfter),
    })
  }

  /** Указать настроение после для последней сессии привычки за день. */
  setMoodAfter(habitId: string, day: Day, mood: number) {
    for (let i = this.state.sessions.length - 1; i >= 0; i--) {
      const s = this.state.sessions[i]
      if (s.habitId === habitId && s.day === day) {
        if (Number.isInteger(mood) && mood >= 1 && mood <= 5) s.moodAfter = mood
        return
      }
    }
  }

  // ---------- Квесты ----------

  /** Квесты дня и недели: создаются при смене дня/недели или если их ещё нет (новые привычки). */
  ensureQuests(today: Day) {
    const q = this.state.quests
    const key = habitsKey(this.state.habits)
    const changed = q.habitsKey !== key
    // Пока сегодня ничего не забрано, квесты подстраиваются под изменённые привычки.
    if (q.dailyDay !== today || (changed && !q.daily.some((x) => x.claimed))) {
      q.daily = generateDaily(this.state.habits, today, this.state.directions)
      if (q.dailyDay === today) this.keepSwaps(today)
      q.dailyDay = today
    } else if (changed) {
      // Часть квестов уже забрана: убираем только незабранные с привычками из архива.
      q.daily = q.daily.filter((x) => x.claimed || questAlive(x, this.state.habits))
    }
    if (!q.weekly || q.weekly.weekStart !== weekStart(today) || (changed && !q.weekly.claimed)) {
      q.weekly = generateWeekly(this.state.habits, today, q.weekly)
    }
    q.habitsKey = key
  }

  /**
   * Квесты дня пересобрались (изменились привычки): убранные сегодня квесты не должны вернуться.
   * Если заменить нечем — квест остаётся, а замена возвращается.
   */
  private keepSwaps(today: Day) {
    const q = this.state.quests
    if (q.swapDay !== today || !q.swappedOut?.length) return
    q.daily = q.daily.map((x) => {
      if (!q.swappedOut!.includes(x.id)) return x
      const next = swapCandidate(this.state.habits, this.state.completions, today, q.daily, q.swappedOut!, seededRandom(`swap:${today}:keep:${x.id}`), this.state.directions)
      if (next && !q.swappedOut!.includes(next.id)) return next
      q.swaps = Math.max(0, (q.swaps ?? 0) - 1)
      return x
    })
  }

  /** Сколько замен квестов дня осталось сегодня (Infinity — без ограничений). */
  dailySwapsLeft(now: Date): number {
    if (!DAILY_SWAPS_PER_DAY) return Infinity
    const q = this.state.quests
    // Дата замены «из будущего» (часы переводили назад) тоже считается.
    const used = q.swapDay && q.swapDay >= dayOf(now) ? (q.swaps ?? 0) : 0
    return Math.max(0, DAILY_SWAPS_PER_DAY - used)
  }

  /** Можно ли заменить этот квест прямо сейчас (без изменений состояния). */
  canSwapDaily(questId: string, now: Date): boolean {
    const today = dayOf(now)
    const q = this.state.quests
    const quest = q.daily.find((x) => x.id === questId)
    if (!quest || q.dailyDay !== today || quest.claimed || this.dailySwapsLeft(now) <= 0) return false
    if (dailyProgress(quest, this.state.habits, this.state.completions, today).complete) return false
    const out = q.swapDay === today ? [...(q.swappedOut ?? []), quest.id] : [quest.id]
    return swapCandidate(this.state.habits, this.state.completions, today, q.daily, out, () => 0, this.state.directions) !== null
  }

  /** Заменить невыполненный квест дня другим, подходящим под привычки этого дня. */
  swapDaily(questId: string, now: Date): Result<DailyQuest, SwapError> {
    this.startOfDay(now)
    const today = dayOf(now)
    const q = this.state.quests
    const i = q.daily.findIndex((x) => x.id === questId)
    if (i < 0 || q.dailyDay !== today) return fail('notFound')
    const quest = q.daily[i]
    if (quest.claimed) return fail('claimed')
    if (dailyProgress(quest, this.state.habits, this.state.completions, today).complete) return fail('done')
    if (this.dailySwapsLeft(now) <= 0) return fail('limit')
    if (q.swapDay !== today) {
      q.swapDay = today
      q.swaps = 0
      q.swappedOut = []
    }
    const out = [...(q.swappedOut ?? []), quest.id]
    const next = swapCandidate(this.state.habits, this.state.completions, today, q.daily, out, seededRandom(`swap:${today}:${q.swaps}:${quest.id}`), this.state.directions)
    if (!next) return fail('noAlternatives')
    q.daily = q.daily.map((x, k) => (k === i ? next : x))
    q.swaps = (q.swaps ?? 0) + 1
    q.swappedOut = out
    return ok(next)
  }

  claimDaily(questId: string, now: Date): Result<RewardEvent, ClaimError> {
    this.startOfDay(now)
    const today = dayOf(now)
    const quest = this.state.quests.daily.find((x) => x.id === questId)
    if (!quest || this.state.quests.dailyDay !== today) return fail('notFound')
    if (quest.claimed) return fail('alreadyClaimed')
    if (!dailyProgress(quest, this.state.habits, this.state.completions, today).complete) return fail('notReady')
    quest.claimed = true
    this.state.quests.claimedCount++
    const ev = this.award(DAILY_QUEST_REWARD.xp, DAILY_QUEST_REWARD.coins, now)
    ev.newBadges = this.checkBadges(now)
    return ok(ev)
  }

  claimWeekly(now: Date): Result<RewardEvent, ClaimError> {
    this.startOfDay(now)
    const quest = this.state.quests.weekly
    if (!quest) return fail('notFound')
    if (quest.claimed) return fail('alreadyClaimed')
    if (!weeklyComplete(quest, this.state.habits, this.state.completions)) return fail('notReady')
    quest.claimed = true
    this.state.quests.claimedCount++
    const ev = this.award(WEEKLY_QUEST_REWARD.xp, WEEKLY_QUEST_REWARD.coins, now)
    const chest = rollChest(quest.weekStart)
    quest.chest = chest
    if (chest.kind === 'coins') this.state.coins += chest.amount
    else if (chest.kind === 'shield') this.state.shields = { ...this.state.shields, purchased: this.state.shields.purchased + 1 }
    else this.state.lives = { ...this.state.lives, count: this.state.lives.count + chest.amount }
    ev.chest = chest
    ev.newBadges = this.checkBadges(now)
    return ok(ev)
  }

  // ---------- Свои квесты ----------

  addCustomQuest(q: Pick<CustomQuest, 'id' | 'name' | 'difficulty' | 'target'>): Result<void, CustomQuestError> {
    const bad = validateCustomQuest(q)
    if (bad) return fail(bad)
    if (this.state.customQuests.filter((x) => !x.archived).length >= CUSTOM_QUEST_MAX) return fail('tooMany')
    this.state.customQuests.push({
      id: q.id,
      name: q.name.trim().slice(0, CUSTOM_QUEST_NAME_MAX),
      difficulty: q.difficulty,
      target: q.target,
      marks: [],
      claimedWeeks: [],
    })
    return ok(undefined)
  }

  updateCustomQuest(q: Pick<CustomQuest, 'id' | 'name' | 'difficulty' | 'target'>): Result<void, CustomQuestError> {
    const cur = this.state.customQuests.find((x) => x.id === q.id && !x.archived)
    if (!cur) return fail('notFound')
    const bad = validateCustomQuest(q)
    if (bad) return fail(bad)
    cur.name = q.name.trim().slice(0, CUSTOM_QUEST_NAME_MAX)
    cur.difficulty = q.difficulty
    cur.target = q.target
    return ok(undefined)
  }

  /** Убрать квест. Если за него уже давали награду, он скрывается (награды не отнимаются). */
  removeCustomQuest(id: string) {
    const q = this.state.customQuests.find((x) => x.id === id)
    if (!q) return
    if (q.claimedWeeks.length) q.archived = true
    else this.state.customQuests = this.state.customQuests.filter((x) => x.id !== id)
  }

  /** Отметить или снять день этой недели (не позже сегодня). */
  toggleCustomMark(id: string, day: Day, now: Date): Result<boolean, CustomQuestError> {
    this.startOfDay(now)
    const today = dayOf(now)
    const q = this.state.customQuests.find((x) => x.id === id && !x.archived)
    if (!q) return fail('notFound')
    if (day > today) return fail('future')
    if (weekStart(day) !== weekStart(today)) return fail('notThisWeek')
    if (customProgress(q, today).claimed) return fail('claimed')
    const has = q.marks.includes(day)
    // Старше прошлой недели отметки не нужны — не копим их.
    const keepFrom = addDays(weekStart(today), -7)
    q.marks = (has ? q.marks.filter((d) => d !== day) : [...q.marks, day]).filter((d) => d >= keepFrom)
    return ok(!has)
  }

  claimCustom(id: string, now: Date): Result<RewardEvent, CustomQuestError> {
    this.startOfDay(now)
    const today = dayOf(now)
    const q = this.state.customQuests.find((x) => x.id === id && !x.archived)
    if (!q) return fail('notFound')
    const p = customProgress(q, today)
    // Награду за выполненную прошлую неделю можно забрать и в понедельник — она не пропадает.
    const week = p.complete && !p.claimed ? weekStart(today) : pendingLastWeek(q, today) ? addDays(weekStart(today), -7) : null
    if (!week) return fail(p.claimed ? 'claimed' : 'notReady')
    // Не больше CUSTOM_QUEST_MAX наград в неделю — иначе «создать → забрать → удалить» даёт бесконечные монеты.
    if (customClaimsThisWeek(this.state.customQuests, week) >= CUSTOM_QUEST_MAX) return fail('weeklyLimit')
    q.claimedWeeks.push(week)
    this.state.quests.claimedCount++
    const reward = CUSTOM_QUEST_REWARD[q.difficulty]
    const ev = this.award(reward.xp, reward.coins, now)
    ev.newBadges = this.checkBadges(now)
    return ok(ev)
  }

  // ---------- Бейджи ----------

  /** Выдаёт заслуженные бейджи. Возвращает id новых. */
  checkBadges(now: Date): string[] {
    const today = dayOf(now)
    const active = this.state.habits.filter((h) => !h.archived)
    const ctx: BadgeContext = {
      habits: this.state.habits,
      completions: this.state.completions,
      level: this.level.level,
      bestStreak: Math.max(this.state.bestStreak, this.currentStreak(now)),
      bestHabitStreak: Math.max(0, ...active.map((h) => this.habitStreak(h.id, now))),
      perfectDays: Object.keys(this.state.bonusByDay).length,
      questsClaimed: this.state.quests.claimedCount,
      gameRecords: this.state.games.records,
    }
    const earned: string[] = []
    for (const b of BADGES) {
      if (!this.state.badges[b.id] && b.earned(ctx)) {
        this.state.badges[b.id] = today
        earned.push(b.id)
      }
    }
    return earned
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
    const error = validateHabit(habit) ?? this.checkCategory(habit)
    if (error) throw new Error(error)
    if (now) this.startOfDay(now)
    this.state.habits.push(habit)
  }

  /**
   * Изменить привычку. Интерфейс всегда передаёт `now`: прошедшие дни закрываются до изменения.
   * Бонус дня выдаётся только за отметку, а не за архивирование невыполненного.
   */
  updateHabit(habit: Habit, now?: Date) {
    this.reviveDirection(habit)
    const error = validateHabit(habit) ?? this.checkCategory(habit)
    if (error) throw new Error(error)
    // Сначала закрываем прошедшие дни по старому набору привычек.
    if (now) this.startOfDay(now)
    const i = this.state.habits.findIndex((h) => h.id === habit.id)
    if (i >= 0) this.state.habits[i] = habit

  }

  /** Направление привычки должно существовать; в удалённое можно только оставить архивную привычку. */
  private checkCategory(h: Habit): string | null {
    const d = allDirections(this.state.directions).find((x) => x.id === h.category)
    if (!d) return 'Нет такого направления'
    if (d.archived && !h.archived) return `Направлений уже ${DIRECTIONS_MAX} — удалите одно, чтобы вернуть эту привычку`
    return null
  }

  /** Привычку из удалённого направления вернули из архива — направление тоже возвращается, если есть место. */
  private reviveDirection(h: Habit) {
    if (h.archived) return
    const ds = this.state.directions
    const d = ds.custom.find((x) => x.id === h.category && x.archived)
    if (!d || activeDirections(ds).length >= DIRECTIONS_MAX) return
    if (validateDirectionName(ds, d.name, d.id) === 'duplicate') return
    this.state.directions = { ...ds, custom: ds.custom.map((x) => (x.id === d.id ? { id: x.id, name: x.name, icon: x.icon, timer: x.timer } : x)) }
  }

  // ---------- Направления ----------

  get directions() {
    return activeDirections(this.state.directions)
  }

  /** Добавить своё направление (всего не больше DIRECTIONS_MAX). */
  addDirection(input: { name: string; icon: string; timer: boolean }, id: string): Result<CustomDirection, DirectionError> {
    if (activeDirections(this.state.directions).length >= DIRECTIONS_MAX) return fail('limit')
    const err = validateDirectionName(this.state.directions, input.name)
    if (err) return fail(err)
    if (allDirections(this.state.directions).some((x) => x.id === id) || isBaseCategory(id)) return fail('duplicate')
    const icon = (DIRECTION_ICONS as readonly string[]).includes(input.icon) ? input.icon : '⭐'
    const d: CustomDirection = { id, name: input.name.trim(), icon, timer: input.timer }
    this.state.directions = { ...this.state.directions, custom: [...this.state.directions.custom, d] }
    return ok(d)
  }

  /** Переименовать направление, сменить значок (и таймер — только у своих). */
  updateDirection(id: string, patch: { name: string; icon: string; timer?: boolean }): Result<true, DirectionError> {
    const ds = this.state.directions
    const err = validateDirectionName(ds, patch.name, id)
    if (err) return fail(err)
    const icon = (DIRECTION_ICONS as readonly string[]).includes(patch.icon) ? patch.icon : undefined
    const name = patch.name.trim()
    if (isBaseCategory(id)) {
      this.state.directions = { ...ds, base: { ...ds.base, [id]: { name, ...(icon ? { icon } : {}) } } }
      return ok(true)
    }
    const i = ds.custom.findIndex((x) => x.id === id && !x.archived)
    if (i < 0) return fail('notFound')
    const custom = [...ds.custom]
    custom[i] = { ...custom[i], name, icon: icon ?? custom[i].icon, timer: patch.timer ?? custom[i].timer }
    this.state.directions = { ...ds, custom }
    return ok(true)
  }

  /**
   * Удалить своё направление. Нельзя, пока в нём есть действующие привычки.
   * Если есть архивные привычки или история — направление скрывается, но остаётся для истории.
   */
  removeDirection(id: string): Result<true, DirectionError> {
    if (isBaseCategory(id)) return fail('base')
    const ds = this.state.directions
    const d = ds.custom.find((x) => x.id === id && !x.archived)
    if (!d) return fail('notFound')
    const habits = this.state.habits.filter((h) => h.category === id)
    if (habits.some((h) => !h.archived)) return fail('hasHabits')
    const custom = habits.length ? ds.custom.map((x) => (x.id === id ? { ...x, archived: true } : x)) : ds.custom.filter((x) => x.id !== id)
    this.state.directions = { ...ds, custom }
    return ok(true)
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
    this.state.completions.push({ habitId, day: today, xp, coins: reward.coins, at: now.getTime() })

    const event: RewardEvent = {
      xp,
      coins: reward.coins,
      bonusXp: 0,
      bonusCoins: 0,
      multiplier,
      cappedByDailyLimit: xp < wantedXp,
      levelBefore,
      levelAfter: levelBefore,
      newBadges: [],
    }

    const bonus = this.checkDayBonus(today)
    if (bonus) {
      event.bonusXp = bonus.xp
      event.bonusCoins = bonus.coins
      if (bonus.xp < ALL_DONE_BONUS.xp) event.cappedByDailyLimit = true
    }

    event.levelAfter = this.level.level
    this.updateBestStreak(now)
    event.newBadges = this.checkBadges(now)
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
    // Нельзя снять отметку, без которой забранный квест оказался бы невыполненным.
    const q = this.state.quests
    const breaksDaily =
      q.dailyDay === today &&
      q.daily.some((x) => x.claimed && !dailyProgress(x, this.state.habits, rest, today).complete)
    const breaksWeekly =
      q.weekly?.claimed &&
      q.weekly.weekStart === weekStart(today) &&
      weeklyProgress(q.weekly, this.state.habits, rest).some((x) => !x.progress.complete)
    if (breaksDaily || breaksWeekly) return fail('usedInQuest')
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
      newBadges: [],
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

  // ---------- Личные награды ----------

  addReward(reward: PersonalReward): Result<void, RewardError> {
    const r = { ...reward, name: reward.name.trim() }
    const bad = validateReward(r)
    if (bad) return fail(bad)
    this.state.rewards.push({ id: r.id, name: r.name.slice(0, REWARD_NAME_MAX), price: r.price })
    return ok(undefined)
  }

  updateReward(reward: PersonalReward): Result<void, RewardError> {
    const i = this.state.rewards.findIndex((x) => x.id === reward.id)
    if (i < 0) return fail('notFound')
    const r = { ...reward, name: reward.name.trim() }
    const bad = validateReward(r)
    if (bad) return fail(bad)
    this.state.rewards[i] = { ...this.state.rewards[i], name: r.name.slice(0, REWARD_NAME_MAX), price: r.price }
    return ok(undefined)
  }

  /** Удалить награду. Если её уже брали, она скрывается, а история остаётся. */
  removeReward(id: string) {
    const used = this.state.redemptions.some((x) => x.rewardId === id)
    this.state.rewards = used
      ? this.state.rewards.map((x) => (x.id === id ? { ...x, archived: true } : x))
      : this.state.rewards.filter((x) => x.id !== id)
  }

  /** «Взять» награду: списать монеты и записать в историю. */
  redeemReward(id: string, redemptionId: string, now: Date): Result<Redemption, RewardError> {
    const r = this.state.rewards.find((x) => x.id === id && !x.archived)
    if (!r) return fail('notFound')
    if (this.state.coins < r.price) return fail('notEnoughCoins')
    this.state.coins -= r.price
    const entry: Redemption = { id: redemptionId, rewardId: r.id, name: r.name, price: r.price, day: dayOf(now) }
    this.state.redemptions.push(entry)
    return ok(entry)
  }

  /** Отменить получение награды (если нажала по ошибке) — только в тот же день. */
  cancelRedemption(redemptionId: string, now: Date): Result<void, RewardError> {
    const i = this.state.redemptions.findIndex((x) => x.id === redemptionId)
    if (i < 0) return fail('notFound')
    const entry = this.state.redemptions[i]
    if (entry.day !== dayOf(now)) return fail('tooLate')
    this.state.coins += entry.price
    this.state.redemptions.splice(i, 1)
    // Удалённая награда, у которой больше нет истории, больше не нужна.
    if (!this.state.redemptions.some((x) => x.rewardId === entry.rewardId))
      this.state.rewards = this.state.rewards.filter((x) => !(x.id === entry.rewardId && x.archived))
    return ok(undefined)
  }

  /** Можно ли начать партию сейчас. */
  gameBlock(now: Date): GameBlock | null {
    if (this.state.lives.count <= 0) return 'noLives'
    if (playLeftSec(this.state.games, dayOf(now)) <= 0) return 'limitReached'
    return null
  }

  /** Начать партию: обновляет жизни и списывает одну. false — жизней нет или дневной лимит игры исчерпан. */
  startGame(now: Date): boolean {
    this.startOfDay(now)
    if (this.gameBlock(now)) return false
    this.state.lives = { ...this.state.lives, count: this.state.lives.count - 1 }
    return true
  }

  /** Учесть время игры (секунды) за день. */
  addPlayTime(seconds: number, now: Date) {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    const day = dayOf(now)
    const g = this.state.games
    g.playedByDay = { ...g.playedByDay, [day]: (g.playedByDay[day] ?? 0) + Math.min(seconds, 3 * 3600) }
  }

  /** Итог партии: рекорд и бейджи. Монеты за игры не даются (ТЗ 3.6). */
  finishGame(game: GameId, score: number, now: Date): { newRecord: boolean; record: number; newBadges: string[] } {
    const s = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0
    const prev = this.state.games.records[game] ?? 0
    const newRecord = s > prev
    if (newRecord) this.state.games.records = { ...this.state.games.records, [game]: s }
    return { newRecord, record: Math.max(prev, s), newBadges: this.checkBadges(now) }
  }

  /** Вернуть жизнь, если вышла из партии до старта. */
  refundLife() {
    this.state.lives = { ...this.state.lives, count: this.state.lives.count + 1 }
  }

  setGameLimit(minutes: number) {
    if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 600) this.state.games.limitMin = minutes
  }
}
