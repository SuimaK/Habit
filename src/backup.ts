import { GameEngine, dayOf, directionName, loadState, type GameState } from './core'

/** Резервная копия в файл и выгрузка истории в CSV (ТЗ: копия вместо iCloud). */
export const BACKUP_APP = 'habit-game'

export interface BackupSummary {
  name: string | null
  level: number
  habits: number
  coins: number
  completions: number
  exportedAt: string | null
}

export function makeBackup(state: GameState, now: Date): { name: string; text: string } {
  const text = JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: now.toISOString(), state }, null, 1)
  return { name: `privychki-${dayOf(now)}.json`, text }
}

export type BackupError = 'notJson' | 'notBackup' | 'newerVersion' | 'broken'

/** Разобрать файл копии. Принимает и «голое» состояние без обёртки. */
export function parseBackup(text: string): { ok: true; state: GameState; summary: BackupSummary } | { ok: false; error: BackupError } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'notJson' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'notBackup' }
  const wrapped = raw as { app?: unknown; state?: unknown; exportedAt?: unknown; version?: unknown }
  const isWrapped = wrapped.app === BACKUP_APP
  if (isWrapped && typeof wrapped.version === 'number' && wrapped.version > 1) return { ok: false, error: 'newerVersion' }
  const inner = isWrapped ? wrapped.state : raw
  if (!inner || typeof inner !== 'object' || !Array.isArray((inner as { habits?: unknown }).habits)) return { ok: false, error: 'notBackup' }
  const state = loadState(inner)
  // Без обёртки принимаем только то, что похоже на наше сохранение: есть персонаж или привычки.
  if (!isWrapped && !state.profile && state.habits.length === 0) return { ok: false, error: 'notBackup' }
  let engine: GameEngine
  try {
    // Пробный запуск: копия, которая роняет игру, не должна попасть в телефон.
    engine = new GameEngine(loadState(JSON.parse(JSON.stringify(inner))))
    engine.startOfDay(new Date())
    void engine.level
    void engine.plan
  } catch {
    return { ok: false, error: 'broken' }
  }
  engine = new GameEngine(state)
  return {
    ok: true,
    state,
    summary: {
      name: state.profile?.name ?? null,
      level: engine.level.level,
      habits: state.habits.filter((h) => !h.archived).length,
      coins: state.coins,
      completions: state.completions.length,
      exportedAt: typeof wrapped.exportedAt === 'string' && !Number.isNaN(Date.parse(wrapped.exportedAt)) ? wrapped.exportedAt : null,
    },
  }
}

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v)
  // Защита от формул в Excel/Numbers и экранирование.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** История отметок и сессий таймера. Разделитель «;» — так Excel и Numbers в русской локали открывают сразу. */
export function makeCsv(state: GameState, now: Date): { name: string; text: string } {
  const byId = new Map(state.habits.map((h) => [h.id, h]))
  const rows: (string | number | undefined)[][] = [['Дата', 'Тип', 'Привычка', 'Направление', 'XP', 'Монеты', 'Минуты', 'Настроение до', 'Настроение после']]
  const events = [
    ...state.completions.map((c) => ({ day: c.day, row: ['Отметка', byId.get(c.habitId)?.name ?? 'удалённая привычка', cat(state, byId.get(c.habitId)?.category), c.xp, c.coins, undefined, undefined, undefined] })),
    ...state.sessions.map((s) => ({ day: s.day, row: ['Таймер', byId.get(s.habitId)?.name ?? 'удалённая привычка', cat(state, byId.get(s.habitId)?.category), undefined, undefined, s.minutes, s.moodBefore, s.moodAfter] })),
  ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  for (const e of events) rows.push([e.day, ...e.row])
  // BOM — чтобы Excel понял UTF-8.
  return { name: `privychki-history-${dayOf(now)}.csv`, text: '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n' }
}

function cat(state: GameState, c: string | undefined) {
  return c ? directionName(state.directions, c) : ''
}

/** Отдать файл: на iPhone — через меню «Поделиться» (там «Сохранить в Файлы»), иначе — скачиванием. */
export async function saveFile(name: string, text: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([text], { type })
  try {
    const file = new File([blob], name, { type })
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    /* пробуем скачать */
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
