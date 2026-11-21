import type { Habit } from './core'

/**
 * Активный таймер хранится отдельно от игры: он переживает сворачивание и перезапуск Safari.
 * Время считается от отметки на часах, а не по тикам, поэтому в фоне ничего не теряется.
 */
export interface TimerData {
  habitId: string
  durationSec: number
  /** Когда закончится, если идёт; null — на паузе. */
  endAt: number | null
  /** Сколько осталось на паузе. */
  pausedRemaining: number
  moodBefore?: number
}

const KEY = 'habit-game/timer'

export function readTimer(): TimerData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as Partial<TimerData>
    if (typeof t.habitId !== 'string' || typeof t.durationSec !== 'number' || !(t.durationSec > 0)) return null
    return {
      habitId: t.habitId,
      durationSec: t.durationSec,
      endAt: typeof t.endAt === 'number' ? t.endAt : null,
      pausedRemaining: typeof t.pausedRemaining === 'number' ? Math.max(0, Math.min(t.pausedRemaining, t.durationSec)) : t.durationSec,
      moodBefore: typeof t.moodBefore === 'number' ? t.moodBefore : undefined,
    }
  } catch {
    return null
  }
}

export function writeTimer(t: TimerData | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    /* без сохранения таймер просто не переживёт перезапуск */
  }
}

/** Осталось секунд (дробное). */
export function remaining(t: TimerData, nowMs: number): number {
  if (t.endAt === null) return t.pausedRemaining
  return Math.max(0, Math.min(t.durationSec, (t.endAt - nowMs) / 1000))
}

export function pause(t: TimerData, nowMs: number): TimerData {
  return { ...t, endAt: null, pausedRemaining: remaining(t, nowMs) }
}

export function resume(t: TimerData, nowMs: number): TimerData {
  return { ...t, endAt: nowMs + t.pausedRemaining * 1000 }
}

export const fmtClock = (sec: number) => {
  const s = Math.ceil(sec)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const MIN_MINUTES = 1
export const MAX_MINUTES = 120

/** Длительность по умолчанию: цель привычки в минутах, иначе 10. */
export function defaultMinutes(h: Habit): number {
  const m = h.target?.unit === 'minutes' && Number.isFinite(h.target.amount) ? Math.round(h.target.amount) : 10
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, m))
}

