import { GameEngine, type Difficulty, type Frequency, type Habit } from '..'

let seq = 0

/** Ноябрь 2026: 16-е — понедельник. */
export const at = (day: number, hour = 12, minute = 0, month = 11) => new Date(2026, month - 1, day, hour, minute)
export const d = (day: number, month = 11) => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export function habit(difficulty: Difficulty = 'easy', frequency: Frequency = { kind: 'daily' }): Habit {
  return { id: `h${++seq}`, name: `h${seq}`, category: 'workout', difficulty, frequency, archived: false }
}

export function engine(habits: Habit[] = []): GameEngine {
  const e = new GameEngine()
  habits.forEach((h) => e.addHabit(h))
  return e
}

export function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`ожидался успех, получено: ${String(r.error)}`)
  return r.value
}

export const err = (r: { ok: boolean; error?: unknown }) => (r.ok ? 'ok' : r.error)
