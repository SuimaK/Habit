import { addDays, weekStart, type Day } from './day'
import type { Habit } from './models'
import type { Plan } from './plan'

/** Множитель XP от общей серии: 3 дня — ×1,1; 7 — ×1,25; 30 — ×1,5. */
export function streakMultiplier(streak: number): number {
  if (streak >= 30) return 1.5
  if (streak >= 7) return 1.25
  if (streak >= 3) return 1.1
  return 1
}

/**
 * Общая серия, заканчивающаяся днём `end` включительно.
 * Пустые дни и дни под щитом серию не рвут, но и не продлевают.
 * `earliest` — начало истории, раньше него не смотрим.
 */
export function overallStreak(end: Day, plan: Plan, shielded: ReadonlySet<Day>, earliest: Day): number {
  let count = 0
  for (let day = end; day >= earliest; day = addDays(day, -1)) {
    const r = plan.result(day)
    if (r === 'met') count++
    else if (r === 'missed' && !shielded.has(day)) return count
  }
  return count
}

/**
 * Текущая серия: если план сегодня уже выполнен — вместе с сегодня,
 * иначе по вчера (сегодня ещё не закончилось).
 */
export function currentOverallStreak(today: Day, plan: Plan, shielded: ReadonlySet<Day>, earliest: Day): number {
  const base = overallStreak(addDays(today, -1), plan, shielded, earliest)
  return plan.result(today) === 'met' ? base + 1 : base
}

/**
 * Серия по одной привычке.
 * «Каждый день» и «по дням недели» — подряд выполненные запланированные дни.
 * «N раз в неделю» — подряд недели с выполненной нормой.
 * Незаконченные сегодня и текущая неделя серию не рвут.
 */
export function habitStreak(habit: Habit, today: Day, plan: Plan, earliest: Day): number {
  if (habit.frequency.kind === 'timesPerWeek') {
    const target = habit.frequency.times
    let week = weekStart(today)
    let count = plan.doneInWeek(habit.id, week) >= target ? 1 : 0
    for (week = addDays(week, -7); addDays(week, 6) >= earliest; week = addDays(week, -7)) {
      if (plan.doneInWeek(habit.id, week) >= target) count++
      else return count
    }
    return count
  }
  const isScheduled = (day: Day) => plan.fixedHabits(day).some((h) => h.id === habit.id)
  const isDone = (day: Day) => plan.done(day).has(habit.id)
  let count = 0
  let day = isDone(today) ? today : addDays(today, -1)
  for (; day >= earliest; day = addDays(day, -1)) {
    if (!isScheduled(day)) continue
    if (isDone(day)) count++
    else return count
  }
  return count
}
