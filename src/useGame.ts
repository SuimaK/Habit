import { useCallback, useEffect, useState } from 'react'
import { GameEngine } from './core'
import { starterHabits } from './seed'
import { readState, writeState } from './storage'

function boot(now: Date): GameEngine {
  const saved = readState()
  const engine = new GameEngine(saved ?? undefined)
  if (!saved) starterHabits().forEach((h) => engine.addHabit(h, now))
  engine.startOfDay(now)
  writeState(engine.state)
  return engine
}

/**
 * Состояние игры для интерфейса. Каждое действие работает с копией движка,
 * сохраняет результат и перерисовывает экран.
 */
export function useGame() {
  const [engine, setEngine] = useState(() => boot(new Date()))
  /** Текущее время — обновляется раз в минуту и при возврате в приложение, чтобы сменился день. */
  const [now, setNow] = useState(() => new Date())

  const act = useCallback(<T>(fn: (e: GameEngine, now: Date) => T): T => {
    const at = new Date()
    const next = engine.clone()
    const result = fn(next, at)
    writeState(next.state)
    setEngine(next)
    setNow(at)
    return result
  }, [engine])

  useEffect(() => {
    const tick = () => {
      const at = new Date()
      setNow(at)
      setEngine((e) => {
        const next = e.clone()
        next.startOfDay(at)
        writeState(next.state)
        return next
      })
    }
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(tick, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])

  return { engine, now, act }
}
