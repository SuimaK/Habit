import { loadState, type GameState } from './core'

const KEY = 'habit-game/state/v1'

/** Хранение на устройстве. Состояние небольшое, поэтому хватает localStorage. */
function backup(raw: string) {
  try {
    if (raw.length > 20) localStorage.setItem(`${KEY}/broken-${Date.now()}`, raw)
  } catch {
    /* ничего */
  }
}

export function readState(): GameState | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    // Без списка привычек сохранение считаем пустым или повреждённым — начинаем заново.
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { habits?: unknown }).habits)) {
      // Не выбрасываем молча: откладываем копию повреждённого сохранения.
      backup(raw)
      return null
    }
    return loadState(parsed)
  } catch {
    if (raw) backup(raw)
    return null
  }
}

/** Возвращает false, если сохранить не удалось (приватный режим, нет места). */
export function writeState(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
