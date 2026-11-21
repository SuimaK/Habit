import { useCallback, useEffect, useRef, useState } from 'react'
import { GameEngine } from './core'
import { starterHabits } from './seed'
import { readState, writeState } from './storage'

function boot(now: Date): { engine: GameEngine; saved: boolean } {
  const stored = readState()
  const engine = new GameEngine(stored ?? undefined)
  if (!stored) starterHabits().forEach((h) => engine.addHabit(h, now))
  engine.startOfDay(now)
  return { engine, saved: writeState(engine.state) }
}

/**
 * Состояние игры для интерфейса. Каждое действие работает с копией движка
 * и получает текущее время, сохраняет результат и перерисовывает экран.
 */
export function useGame() {
  const [initial] = useState(() => boot(new Date()))
  const [engine, setEngine] = useState(initial.engine)
  /** Удалось ли сохранить на устройстве. Если нет — прогресс пропадёт после закрытия. */
  const [storageOk, setStorageOk] = useState(initial.saved)
  /** Текущее время — обновляется раз в минуту и при возврате в приложение, чтобы сменился день. */
  const [now, setNow] = useState(() => new Date())
  const engineRef = useRef(engine)

  const commit = useCallback((next: GameEngine, at: Date) => {
    engineRef.current = next
    setStorageOk(writeState(next.state))
    setEngine(next)
    setNow(at)
  }, [])

  const act = useCallback(
    <T>(fn: (e: GameEngine, now: Date) => T): T => {
      const at = new Date()
      const next = engineRef.current.clone()
      next.startOfDay(at)
      const result = fn(next, at)
      commit(next, at)
      return result
    },
    [commit],
  )

  useEffect(() => {
    const tick = () => {
      const at = new Date()
      const next = engineRef.current.clone()
      next.startOfDay(at)
      commit(next, at)
    }
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(tick, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [commit])

  return { engine, now, act, storageOk }
}
