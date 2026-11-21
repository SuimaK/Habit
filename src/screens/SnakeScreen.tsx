import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEngine } from '../core'
import { GRID, newGame, step, tickMs, turn, type Dir, type SnakeState } from '../games/snake'
import { plural } from '../labels'
import { badgeTitles } from './badgeText'
import { BLOCK_TEXT } from './Games'

interface Props {
  engine: GameEngine
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  onExit: () => void
}

type Phase = 'ready' | 'running' | 'paused' | 'over'

interface Result {
  score: number
  record: number
  newRecord: boolean
  newBadges: string[]
}

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }

/** «Перекус»: экран партии. Жизнь уже списана при входе. */
export function SnakeScreen({ engine, act, onExit }: Props) {
  const [game, setGame] = useState<SnakeState>(() => newGame(Math.random))
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<Result | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const confirmExitRef = useRef(false)
  confirmExitRef.current = confirmExit
  const canvas = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef(game)
  /** Время активной игры, ещё не записанное в движок (мс). */
  const playMs = useRef(0)
  const runningSince = useRef<number | null>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const record = engine.state.games.records.snack ?? 0
  const overHead = useRef<HTMLHeadingElement>(null)
  const [, setRedraw] = useState(0)
  /** Была ли партия запущена (до «Старт» выход возвращает жизнь). */
  const started = useRef(false)

  useEffect(() => head.current?.focus(), [])

  const stopClock = useCallback(() => {
    if (runningSince.current !== null) {
      playMs.current += Date.now() - runningSince.current
      runningSince.current = null
    }
  }, [])

  const commit = useCallback(
    (score: number) => {
      stopClock()
      const seconds = playMs.current / 1000
      playMs.current = 0
      return act((e, at) => {
        e.addPlayTime(seconds, at)
        return e.finishGame('snack', score, at)
      })
    },
    [act, stopClock],
  )

  const setBoth = useCallback((g: SnakeState) => {
    gameRef.current = g
    setGame(g)
  }, [])

  // Игровой цикл: ровный темп, повороты его не сбивают.
  useEffect(() => {
    if (phase !== 'running') return
    started.current = true
    runningSince.current ??= Date.now()
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      const next = step(gameRef.current, Math.random)
      setBoth(next)
      if (!next.alive) {
        navigator.vibrate?.(120)
        setResult({ score: next.score, ...commit(next.score) })
        setConfirmExit(false)
        setPhase('over')
        return
      }
      t = setTimeout(tick, tickMs(next))
    }
    t = setTimeout(tick, tickMs(gameRef.current))
    return () => clearTimeout(t)
  }, [phase, commit, setBoth])

  useEffect(() => {
    if (phase === 'over') overHead.current?.focus()
  }, [phase])

  // Свернули или закрыли приложение — пауза и сразу записываем время и счёт,
  // чтобы ничего не потерялось, если система выгрузит приложение.
  useEffect(() => {
    const flush = () => {
      stopClock()
      if (playMs.current > 0 && gameRef.current.alive) {
        const seconds = playMs.current / 1000
        const score = gameRef.current.score
        playMs.current = 0
        act((e, at) => {
          e.addPlayTime(seconds, at)
          e.finishGame('snack', score, at)
        })
      }
      setPhase((p) => (p === 'running' ? 'paused' : p))
    }
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [stopClock, act])

  // Перерисовать поле при смене размера или темы.
  useEffect(() => {
    const bump = () => setRedraw((n) => n + 1)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    window.addEventListener('resize', bump)
    mq.addEventListener?.('change', bump)
    return () => {
      window.removeEventListener('resize', bump)
      mq.removeEventListener?.('change', bump)
    }
  }, [])

  const steer = useCallback(
    (d: Dir) => {
      if (confirmExitRef.current) return
      setBoth(turn(gameRef.current, d))
      setPhase((p) => (p === 'ready' ? 'running' : p))
    },
    [setBoth],
  )

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const d = KEYS[ev.key]
      if (d) {
        ev.preventDefault()
        steer(d)
      } else if (ev.key === ' ') {
        // Пробел на кнопке — это нажатие кнопки, не пауза.
        if ((ev.target as HTMLElement)?.tagName === 'BUTTON') return
        ev.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Отрисовка (каждый рендер: после хода, паузы, смены размера или темы).
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(c)
    const size = c.clientWidth
    const dpr = window.devicePixelRatio || 1
    if (c.width !== Math.round(size * dpr)) {
      c.width = Math.round(size * dpr)
      c.height = Math.round(size * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const cell = size / GRID
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = css.getPropertyValue('--board-a').trim() || '#e8f0d8'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = css.getPropertyValue('--board-b').trim() || '#dfe9cc'
    for (let y = 0; y < GRID; y++) for (let x = (y % 2); x < GRID; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.floor(cell * 0.8)}px system-ui, "Apple Color Emoji", sans-serif`
    for (const f of game.foods) ctx.fillText(f.icon, f.x * cell + cell / 2, f.y * cell + cell / 2 + 1)
    const body = css.getPropertyValue('--snake').trim() || '#5f9f63'
    const headColor = css.getPropertyValue('--snake-head').trim() || '#3f7f45'
    game.snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? headColor : body
      const pad = i === 0 ? 1 : 2
      ctx.beginPath()
      ctx.roundRect(p.x * cell + pad, p.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.3)
      ctx.fill()
    })
    // Глаза.
    const h = game.snake[0]
    ctx.fillStyle = '#fff'
    const ex = { up: [0.3, 0.3, 0.7, 0.3], down: [0.3, 0.7, 0.7, 0.7], left: [0.3, 0.3, 0.3, 0.7], right: [0.7, 0.3, 0.7, 0.7] }[game.dir]
    for (const k of [0, 2]) {
      ctx.beginPath()
      ctx.arc(h.x * cell + ex[k] * cell, h.y * cell + ex[k + 1] * cell, cell * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  // Свайпы по полю.
  const touch = useRef<{ x: number; y: number } | null>(null)
  function onPointerDown(e: React.PointerEvent) {
    touch.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!touch.current) return
    const dx = e.clientX - touch.current.x
    const dy = e.clientY - touch.current.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    touch.current = { x: e.clientX, y: e.clientY }
  }

  function togglePause() {
    if (confirmExit) return
    if (phase === 'running') {
      stopClock()
      setPhase('paused')
    } else if (phase === 'paused') setPhase('running')
  }

  function again() {
    const ok = act((e, at) => e.startGame(at))
    if (!ok) return
    setBoth(newGame(Math.random))
    started.current = false
    setConfirmExit(false)
    setResult(null)
    setPhase('ready')
  }

  function exit() {
    if (phase === 'ready' && !started.current) act((e) => e.refundLife())
    else if (phase !== 'over') commit(gameRef.current.score)
    onExit()
  }

  const block = engine.gameBlock(new Date())

  return (
    <div className="screen snake-screen">
      <header className="sheet-head">
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            if (phase === 'over' || phase === 'ready') return exit()
            stopClock()
            setPhase('paused')
            setConfirmExit(true)
          }}
        >
          Выйти
        </button>
        <h2 ref={head} tabIndex={-1}>
          «Перекус»
        </h2>
        {phase === 'running' || phase === 'paused' ? (
          <button type="button" className="btn ghost small" onClick={togglePause} aria-label={phase === 'running' ? 'Пауза' : 'Продолжить'}>
            {phase === 'running' ? '❚❚' : '▶'}
          </button>
        ) : (
          <span />
        )}
      </header>

      <div className="snake-score" aria-live="off">
        <span>Очки: {game.score}</span>
        <span className="muted">Рекорд: {Math.max(record, result?.record ?? 0)}</span>
      </div>

      <div className="snake-board">
        <canvas
          ref={canvas}
          className="snake-canvas"
          role="img"
          aria-label={`Поле змейки. Очки: ${game.score}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (touch.current = null)}
          onPointerCancel={() => (touch.current = null)}
        />
        {phase === 'ready' && (
          <div className="snake-overlay">
            <p>Собирай овощи и фрукты, а фастфуд обходи стороной — он укорачивает змейку.</p>
            <p className="muted">Свайпай по полю или жми стрелки. Если выйти до старта, потраченная жизнь вернётся.</p>
            <button type="button" className="btn primary" onClick={() => setPhase('running')}>
              Старт
            </button>
          </div>
        )}
        {phase === 'paused' && !confirmExit && (
          <div className="snake-overlay">
            <p>Пауза</p>
            <button type="button" className="btn primary" onClick={() => setPhase('running')} autoFocus>
              Продолжить
            </button>
          </div>
        )}
        {confirmExit && (
          <div className="snake-overlay" role="group" aria-label="Выйти из игры">
            <p>Закончить партию? Очки засчитаются.</p>
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={() => setConfirmExit(false)} autoFocus>
                Играть дальше
              </button>
              <button type="button" className="btn primary" onClick={exit}>
                Закончить
              </button>
            </div>
          </div>
        )}
        {phase === 'over' && result && (
          <div className="snake-overlay" role="dialog" aria-modal="true" aria-labelledby="snake-over">
            <h3 id="snake-over" ref={overHead} tabIndex={-1}>{result.newRecord && result.score > 0 ? '★ Новый рекорд! ★' : 'Партия окончена'}</h3>
            <p className="snake-final">
              {result.score} {plural(result.score, 'очко', 'очка', 'очков')}
            </p>
            {result.newBadges.length > 0 && <p>Новый бейдж: {badgeTitles(result.newBadges)}</p>}
            {block && <p className="muted">{block === 'limitReached' ? BLOCK_TEXT.limitReached : 'Жизни закончились — новые придут в 06:00.'}</p>}
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={exit}>
                Выйти
              </button>
              <button type="button" className="btn primary" onClick={again} disabled={!!block}>
                Ещё раз ♥1
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="snake-pad" role="group" aria-label="Управление">
        <button type="button" className="up" onClick={() => steer('up')} aria-label="Вверх">
          ▲
        </button>
        <button type="button" className="left" onClick={() => steer('left')} aria-label="Влево">
          ◀
        </button>
        <button type="button" className="right" onClick={() => steer('right')} aria-label="Вправо">
          ▶
        </button>
        <button type="button" className="down" onClick={() => steer('down')} aria-label="Вниз">
          ▼
        </button>
      </div>
    </div>
  )
}
