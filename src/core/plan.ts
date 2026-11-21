import { addDays, weekday, weekStart, type Day } from './day'
import type { Completion, Habit } from './models'

/** День засчитан, если выполнено ≥70% плана (ТЗ 3.3). */
export const COMPLETION_THRESHOLD = 0.7

export type DayResult = 'empty' | 'met' | 'missed'

/** План дня и его выполнение. */
export class Plan {
  readonly habits: Habit[]
  private readonly doneByDay = new Map<Day, Set<string>>()
  private readonly frozen: Readonly<Record<Day, DayResult>>

  /**
   * @param frozen Итоги уже закрытых дней. Они не пересчитываются, даже если потом
   * привычки добавили, архивировали или поменяли им частоту.
   */
  constructor(
    habits: Habit[],
    completions: Completion[],
    frozen: Readonly<Record<Day, DayResult>> = {},
  ) {
    this.frozen = frozen
    this.habits = habits.filter((h) => !h.archived)
    for (const c of completions) {
      let set = this.doneByDay.get(c.day)
      if (!set) this.doneByDay.set(c.day, (set = new Set()))
      set.add(c.habitId)
    }
  }

  done(day: Day): Set<string> {
    return this.doneByDay.get(day) ?? new Set()
  }

  /** Привычки с жёстким расписанием на день: ежедневные и по дням недели. */
  fixedHabits(day: Day): Habit[] {
    const wd = weekday(day)
    return this.habits.filter((h) => {
      switch (h.frequency.kind) {
        case 'daily':
          return true
        case 'weekdays':
          return h.frequency.days.includes(wd)
        case 'timesPerWeek':
          return false
      }
    })
  }

  /**
   * План дня: привычки с расписанием + «N раз в неделю», выполненные в этот день.
   * Гибкие привычки, не выполненные в день, план не портят.
   */
  scheduledHabits(day: Day): Habit[] {
    const done = this.done(day)
    const flexible = this.habits.filter((h) => h.frequency.kind === 'timesPerWeek' && done.has(h.id))
    return [...this.fixedHabits(day), ...flexible]
  }

  result(day: Day): DayResult {
    const frozen = this.frozen[day]
    if (frozen) return frozen
    return this.liveResult(day)
  }

  /** Итог дня по текущему набору привычек. */
  liveResult(day: Day): DayResult {
    const planned = this.scheduledHabits(day)
    if (planned.length === 0) return 'empty'
    const done = this.done(day)
    const count = planned.filter((h) => done.has(h.id)).length
    // Небольшой допуск на погрешность деления (7/10 = 0.7).
    return count / planned.length >= COMPLETION_THRESHOLD - 1e-9 ? 'met' : 'missed'
  }

  /** Все привычки с расписанием выполнены — для бонуса +30 XP. */
  allFixedDone(day: Day): boolean {
    const fixed = this.fixedHabits(day)
    if (fixed.length === 0) return false
    const done = this.done(day)
    return fixed.every((h) => done.has(h.id))
  }

  /** Сколько раз привычка выполнена на неделе дня. */
  doneInWeek(habitId: string, day: Day): number {
    const start = weekStart(day)
    let n = 0
    for (let i = 0; i < 7; i++) if (this.done(addDays(start, i)).has(habitId)) n++
    return n
  }
}
