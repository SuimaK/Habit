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

/** Отложить копию текущего прогресса перед восстановлением из файла. */
const BEFORE_RESTORE = `${KEY}/before-restore`

/** Хранится одна копия — последнего состояния перед восстановлением. false — записать не удалось. */
export function keepCopy(state: GameState): boolean {
  try {
    // Старые копии прежнего формата (с меткой времени) убираем.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(`${BEFORE_RESTORE}-`)) localStorage.removeItem(k)
    }
    localStorage.setItem(BEFORE_RESTORE, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** Отложенное состояние до восстановления (сырой JSON) или null. */
export function readKeptCopy(): string | null {
  try {
    return localStorage.getItem(BEFORE_RESTORE)
  } catch {
    return null
  }
}

/** Вернуть отложенное состояние в основной ключ (используется и из экрана ошибки). */
export function restoreKeptCopy(): boolean {
  try {
    const raw = localStorage.getItem(BEFORE_RESTORE)
    if (!raw) return false
    localStorage.setItem(KEY, raw)
    localStorage.removeItem(BEFORE_RESTORE)
    return true
  } catch {
    return false
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
