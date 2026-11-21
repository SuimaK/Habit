import { addDays, daysBetween, weekday, weekStart, type Day } from './day'
import { BASE_CATEGORIES, directionName, initialDirections, type DirectionsState } from './directions'
import type { Category, Completion, Habit } from './models'

/**
 * Квесты (ТЗ 3.4): 3 ежедневных под мои привычки и 1 недельный с сундуком.
 * Награда забирается кнопкой «Забрать», когда условие выполнено.
 */
export const DAILY_QUEST_REWARD = { xp: 40, coins: 5 }
export const WEEKLY_QUEST_REWARD = { xp: 150, coins: 20 }
export const DAILY_QUESTS_PER_DAY = 3
/** Сколько ежедневных квестов можно заменить за день (0 — без ограничений). */
export const DAILY_SWAPS_PER_DAY = 1

export type DailyGoal =
  | { kind: 'habit'; habitId: string }
  | { kind: 'category'; category: Category; count: number }
  | { kind: 'total'; count: number }

export interface DailyQuest {
  id: string
  title: string
  goal: DailyGoal
  claimed: boolean
}

export interface WeeklyLine {
  category: Category
  target: number
}

export type ChestPrize = { kind: 'coins'; amount: number } | { kind: 'shield' } | { kind: 'lives'; amount: number }

export interface WeeklyQuest {
  weekStart: Day
  lines: WeeklyLine[]
  claimed: boolean
  chest: ChestPrize | null
}

export interface QuestState {
  dailyDay: Day | null
  /** Набор привычек, под который созданы квесты, — если он изменился, незабранные квесты пересоздаются. */
  habitsKey?: string
  daily: DailyQuest[]
  weekly: WeeklyQuest | null
  /** Сколько квестов завершено за всё время (для бейджа). */
  claimedCount: number
  /** Замены квестов дня: в какой день, сколько раз и какие квесты убраны (чтобы не вернулись сразу). */
  swapDay?: Day
  swaps?: number
  swappedOut?: string[]
}

/** Ключ набора активных привычек и их параметров. */
export function habitsKey(habits: Habit[]): string {
  return habits
    .filter((h) => !h.archived)
    .map((h) => `${h.id}:${h.name}:${h.category}:${JSON.stringify(h.frequency)}`)
    .sort()
    .join('|')
}

export const initialQuests = (): QuestState => ({ dailyDay: null, daily: [], weekly: null, claimedCount: 0 })

/** Направления, в которых есть привычки: сначала стандартные в заданном порядке, потом свои. */
function categoriesOf(habits: Habit[], order: Category[]): Category[] {
  const present = [...new Set(habits.map((h) => h.category))]
  return [...order.filter((c) => present.includes(c)), ...present.filter((c) => !order.includes(c))]
}

const categoryTitle = (dirs: DirectionsState, cat: Category, n: number) => `${directionName(dirs, cat)}: все ${n} ${pluralHabits(n)} за день`

/** Детерминированный генератор случайных чисел от строки: квесты дня не меняются при перезапуске. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pluralHabits(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'привычку'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'привычки'
  return 'привычек'
}

function pluralCoins(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'монета'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'монеты'
  return 'монет'
}

/** Привычки, которые на этот день стоят в расписании (активные). */
function scheduledOn(habits: Habit[], day: Day): Habit[] {
  const wd = weekday(day)
  return habits.filter(
    (h) =>
      !h.archived &&
      (h.frequency.kind === 'daily' || (h.frequency.kind === 'weekdays' && h.frequency.days.includes(wd))),
  )
}

type Candidate = Omit<DailyQuest, 'id' | 'claimed'>

/** Все возможные квесты дня под привычки этого дня (отдельные привычки — сначала посложнее). */
function dailyCandidates(habits: Habit[], day: Day, rnd: () => number, dirs: DirectionsState): Candidate[] {
  const today = scheduledOn(habits, day)
  const candidates: Candidate[] = []
  for (const cat of categoriesOf(today, BASE_CATEGORIES)) {
    const n = today.filter((h) => h.category === cat).length
    if (n >= 2) candidates.push({ title: categoryTitle(dirs, cat, n), goal: { kind: 'category', category: cat, count: n } })
  }
  if (today.length >= 3) {
    const n = Math.ceil(today.length * 0.6)
    candidates.push({ title: `Выполнить ${n} ${pluralHabits(n)} за день`, goal: { kind: 'total', count: n } })
  }
  const weight = { hard: 3, medium: 2, easy: 1 }
  for (const h of shuffle(today, rnd).sort((a, b) => weight[b.difficulty] - weight[a.difficulty])) {
    candidates.push({ title: `«${h.name}»`, goal: { kind: 'habit', habitId: h.id } })
  }
  return candidates
}

/** Три ежедневных квеста под привычки этого дня. */
export function generateDaily(habits: Habit[], day: Day, dirs: DirectionsState = initialDirections()): DailyQuest[] {
  const rnd = seededRandom(`daily:${day}`)
  const candidates = dailyCandidates(habits, day, rnd, dirs)
  // Берём разнотипные: не больше двух «по направлению / всего за день» и смешиваем.
  const picked = shuffle(candidates.filter((c) => c.goal.kind !== 'habit'), rnd).slice(0, 2)
  for (const c of candidates) {
    if (picked.length >= DAILY_QUESTS_PER_DAY) break
    if (c.goal.kind === 'habit') picked.push(c)
  }
  return picked.slice(0, DAILY_QUESTS_PER_DAY).map((c) => ({ ...c, id: questId(day, c.goal), claimed: false }))
}

/**
 * Квест на замену: любой возможный на сегодня, которого нет в списке.
 * Сначала — те, что сегодня ещё не убирали; если таких нет, по кругу.
 */
export function swapCandidate(
  habits: Habit[],
  completions: Completion[],
  day: Day,
  current: DailyQuest[],
  swappedOut: string[],
  rnd: () => number,
  dirs: DirectionsState = initialDirections(),
): DailyQuest | null {
  const have = new Set(current.map((q) => q.id))
  // Уже выполненный квест на замену не годится — иначе награда без усилий.
  const all = dailyCandidates(habits, day, rnd, dirs)
    .map((c) => ({ ...c, id: questId(day, c.goal), claimed: false }))
    .filter((c) => !have.has(c.id) && !dailyProgress(c, habits, completions, day).complete)
  const fresh = all.filter((c) => !swappedOut.includes(c.id))
  const pool = fresh.length ? fresh : all
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null
}

/** Стабильный id квеста по дню и цели: после пересборки тот же квест находится по тому же id. */
export function questId(day: Day, goal: DailyGoal): string {
  switch (goal.kind) {
    case 'habit':
      return `${day}:habit:${goal.habitId}`
    case 'category':
      return `${day}:cat:${goal.category}:${goal.count}`
    case 'total':
      return `${day}:total:${goal.count}`
  }
}

/** Название квеста с актуальным именем привычки (после переименования). */
export function questTitle(q: DailyQuest, habits: Habit[], dirs?: DirectionsState): string {
  if (q.goal.kind === 'category') return dirs ? categoryTitle(dirs, q.goal.category, q.goal.count) : q.title
  if (q.goal.kind !== 'habit') return q.title
  const id = q.goal.habitId
  const h = habits.find((x) => x.id === id)
  return h ? `«${h.name}»` : q.title
}

/** Квест ещё имеет смысл: привычка из него не удалена и не в архиве. */
export function questAlive(q: DailyQuest, habits: Habit[]): boolean {
  if (q.goal.kind === 'category') {
    const cat = q.goal.category
    return habits.some((h) => h.category === cat && !h.archived)
  }
  if (q.goal.kind !== 'habit') return true
  const id = q.goal.habitId
  return habits.some((h) => h.id === id && !h.archived)
}

export interface QuestProgress {
  done: number
  target: number
  complete: boolean
}

const progress = (done: number, target: number): QuestProgress => ({
  done: Math.min(done, target),
  target,
  complete: done >= target,
})

export function dailyProgress(q: DailyQuest, habits: Habit[], completions: Completion[], day: Day): QuestProgress {
  const doneToday = completions.filter((c) => c.day === day)
  const byId = new Map(habits.map((h) => [h.id, h]))
  switch (q.goal.kind) {
    case 'habit': {
      const id = q.goal.habitId
      return progress(doneToday.some((c) => c.habitId === id) ? 1 : 0, 1)
    }
    case 'category': {
      const cat = q.goal.category
      return progress(doneToday.filter((c) => byId.get(c.habitId)?.category === cat).length, q.goal.count)
    }
    case 'total':
      return progress(doneToday.length, q.goal.count)
  }
}

/** Сколько раз в неделю привычка стоит в плане. */
function perWeek(h: Habit): number {
  switch (h.frequency.kind) {
    case 'daily':
      return 7
    case 'weekdays':
      return h.frequency.days.length
    case 'timesPerWeek':
      return h.frequency.times
  }
}

/** Недельный квест: по направлениям, ~70% недельного плана. */
/**
 * Недельный квест. Если неделя уже идёт, цель новых направлений считается на оставшиеся дни;
 * цели направлений из прежнего квеста этой недели (`prev`) не меняются.
 */
export function generateWeekly(habits: Habit[], day: Day, prev?: WeeklyQuest | null): WeeklyQuest {
  const start = weekStart(day)
  const daysLeft = 7 - daysBetween(start, day) // включая сегодня
  const same = prev && prev.weekStart === start ? prev : null
  const active = habits.filter((h) => !h.archived)
  const lines: WeeklyLine[] = []
  for (const cat of categoriesOf(active, ['workout', 'meditation', 'nutrition'])) {
    const planned = active.filter((h) => h.category === cat).reduce((s, h) => s + perWeek(h), 0)
    if (planned === 0) continue
    const kept = same?.lines.find((l) => l.category === cat)
    const fullWeek = Math.min(14, Math.max(1, Math.round(planned * 0.7)))
    // Прежняя цель сохраняется, но не больше, чем позволяет новый (уменьшенный) план.
    const target = kept ? Math.min(kept.target, fullWeek) : Math.max(1, Math.round((fullWeek * daysLeft) / 7))
    lines.push({ category: cat, target })
  }
  return { weekStart: start, lines, claimed: false, chest: null }
}

export function weeklyProgress(
  q: WeeklyQuest,
  habits: Habit[],
  completions: Completion[],
): { line: WeeklyLine; progress: QuestProgress }[] {
  const end = addDays(q.weekStart, 6)
  const byId = new Map(habits.map((h) => [h.id, h]))
  const inWeek = completions.filter((c) => c.day >= q.weekStart && c.day <= end)
  return q.lines.map((line) => ({
    line,
    progress: progress(inWeek.filter((c) => byId.get(c.habitId)?.category === line.category).length, line.target),
  }))
}

export function weeklyComplete(q: WeeklyQuest, habits: Habit[], completions: Completion[]): boolean {
  return q.lines.length > 0 && weeklyProgress(q, habits, completions).every((p) => p.progress.complete)
}

/** Случайная награда сундука: монеты, щит серии или жизни для игр. */
export function rollChest(seed: string): ChestPrize {
  const r = seededRandom(`chest:${seed}`)()
  if (r < 0.4) return { kind: 'coins', amount: 10 + Math.floor(seededRandom(`coins:${seed}`)() * 21) }
  if (r < 0.7) return { kind: 'shield' }
  return { kind: 'lives', amount: 2 }
}

export function chestLabel(p: ChestPrize): string {
  switch (p.kind) {
    case 'coins':
      return `${p.amount} ${pluralCoins(p.amount)}`
    case 'shield':
      return 'Щит серии'
    case 'lives':
      return `${p.amount} жизни для игр`
  }
}
