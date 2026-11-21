import { loadState, type GameState } from './core'

const KEY = 'habit-game/state/v1'

/** Хранение на устройстве. Состояние небольшое, поэтому хватает localStorage. */
export function readState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? loadState(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Хранилище недоступно (приватный режим) — работаем без сохранения.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ничего */
  }
}
