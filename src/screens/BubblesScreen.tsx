import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEngine } from '../core'
import {
  COLORS,
  HEIGHT,
  R,
  ROWS,
  SHOOTER,
  SHOTS_PER_ROW,
  WIDTH,
  center,
  clampAim,
  colsIn,
  newBubbles,
  shoot,
  swap,
  trace,
  type BubblesState,
  type ColorId,
  type Point,
  type ShotResult,
} from '../games/bubbles'
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
  won: boolean
  record: number
  newRecord: boolean
  newBadges: string[]
}

/** Полёт шарика: точки пути и результат, который применится по прилёте. */
interface Flight {
  path: Point[]
  color: ColorId
  start: number
  total: number
  shot: ShotResult
}

/** Лопнувшие и падающие шарики — короткая анимация после попадания. */
interface Fx {
  start: number
  popped: { p: Point; color: ColorId }[]
  dropped: { p: Point; color: ColorId }[]
}

const FLIGHT_SPEED = 0.06 // радиусов за мс
const FX_MS = 450
const AIM_STEP = Math.PI / 60 // 3°
/** Место «следующего» шарика (тап по нему — поменять). */
const NEXT_AT: Point = { x: SHOOTER.x - 4 * R, y: SHOOTER.y + 0.2 * R }

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** «Шарики»: экран партии. Жизнь уже списана при входе. */
export function BubblesScreen({ engine, act, onExit }: Props) {
  const [game, setGame] = useState<BubblesState>(() => newBubbles(Math.random))
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<Result | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [aim, setAim] = useState<Point>({ x: 0, y: -1 })
  const [flying, setFlying] = useState(false)
  const confirmExitRef = useRef(false)
  confirmExitRef.current = confirmExit
  const canvas = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef(game)
  const aimRef = useRef(aim)
  aimRef.current = aim
  const flight = useRef<Flight | null>(null)
  const fx = useRef<Fx | null>(null)
  const raf = useRef(0)
  const playMs = useRef(0)
  const runningSince = useRef<number | null>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const overHead = useRef<HTMLHeadingElement>(null)
  const record = engine.state.games.records.bubbles ?? 0
  const [, setRedraw] = useState(0)
  /** Был ли хоть один выстрел или старт (до «Старт» выход возвращает жизнь). */
  const started = useRef(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

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
        return e.finishGame('bubbles', score, at)
      })
    },
    [act, stopClock],
  )

  const setBoth = useCallback((g: BubblesState) => {
    gameRef.current = g
    setGame(g)
  }, [])

  useEffect(() => {
    if (phase !== 'running') return
    started.current = true
    runningSince.current ??= Date.now()
  }, [phase])

  useEffect(() => {
    if (phase === 'over') overHead.current?.focus()
  }, [phase])

  /** Шарик долетел: применяем выстрел, запускаем анимацию хлопка. */
  const land = useCallback(
    (shot: ShotResult) => {
      const before = gameRef.current
      flight.current = null
      setFlying(false)
      const popped = shot.popped.map(([r, c]) => ({ p: center(before, r, c), color: (shot.placed.row === r && shot.placed.col === c ? before.current : before.grid[r][c]) as ColorId }))
      const dropped = shot.dropped.map(([r, c]) => ({ p: center(before, r, c), color: before.grid[r][c] as ColorId }))
      if ((popped.length || dropped.length) && !reduceMotion()) fx.current = { start: performance.now(), popped, dropped }
      if (popped.length) navigator.vibrate?.(30)
      setBoth(shot.state)
      if (shot.state.over) {
        if (!shot.state.won) navigator.vibrate?.(120)
        setResult({ score: shot.state.score, won: shot.state.won, ...commit(shot.state.score) })
        setPhase('over')
      }
    },
    [commit, setBoth],
  )

  const fire = useCallback(() => {
    if (confirmExitRef.current || flight.current) return
    if (phaseRef.current === 'ready') setPhase('running')
    else if (phaseRef.current !== 'running') return
    const g = gameRef.current
    const shot = shoot(g, aimRef.current, Math.random)
    const path = shot.path
    let total = 0
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (reduceMotion()) return land(shot)
    flight.current = { path, color: g.current, start: performance.now(), total, shot }
    setFlying(true)
  }, [land])

  const doSwap = useCallback(() => {
    if (confirmExitRef.current || flight.current) return
    if (phaseRef.current !== 'running' && phaseRef.current !== 'ready') return
    setBoth(swap(gameRef.current))
  }, [setBoth])

  const turnAim = useCallback((delta: number) => {
    if (confirmExitRef.current) return
    const a = Math.atan2(aimRef.current.y, aimRef.current.x) + delta
    setAim(clampAim(Math.cos(a), Math.sin(a)))
  }, [])

  // Свернули или закрыли приложение — пауза и сразу записываем время и счёт.
  useEffect(() => {
    const flush = () => {
      stopClock()
      if (playMs.current > 0 && !gameRef.current.over) {
        const seconds = playMs.current / 1000
        const score = gameRef.current.score
        playMs.current = 0
        act((e, at) => {
          e.addPlayTime(seconds, at)
          e.finishGame('bubbles', score, at)
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

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'a') {
        ev.preventDefault()
        turnAim(-AIM_STEP)
      } else if (ev.key === 'ArrowRight' || ev.key === 'd') {
        ev.preventDefault()
        turnAim(AIM_STEP)
      } else if (ev.key === 'ArrowUp' || ev.key === 'w') {
        ev.preventDefault()
        fire()
      } else if (ev.key === 'ArrowDown' || ev.key === 's') {
        ev.preventDefault()
        doSwap()
      } else if (ev.key === ' ') {
        ev.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Отрисовка поля. Во время полёта и хлопков — каждый кадр. */
  const draw = useCallback(
    (now: number) => {
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      const css = getComputedStyle(c)
      const w = c.clientWidth
      const h = (w * HEIGHT) / WIDTH
      const dpr = window.devicePixelRatio || 1
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const k = w / WIDTH
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0)
      const g = gameRef.current
      ctx.fillStyle = css.getPropertyValue('--board-a').trim() || '#eef3e2'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      // Линия проигрыша.
      const lineY = center(g, ROWS - 1, 0).y - R
      ctx.strokeStyle = css.getPropertyValue('--danger-line').trim() || '#d98f7f'
      ctx.lineWidth = 0.08
      ctx.setLineDash([0.4, 0.3])
      ctx.beginPath()
      ctx.moveTo(0, lineY)
      ctx.lineTo(WIDTH, lineY)
      ctx.stroke()
      ctx.setLineDash([])

      const ball = (p: Point, color: ColorId, scale = 1, alpha = 1) => {
        ctx.globalAlpha = alpha
        ctx.fillStyle = COLORS[color].color
        ctx.beginPath()
        ctx.arc(p.x, p.y, R * 0.94 * scale, 0, Math.PI * 2)
        ctx.fill()
        // Блик — «пузырь».
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.arc(p.x - 0.35 * scale, p.y - 0.35 * scale, 0.22 * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = `${1.05 * scale}px system-ui, "Apple Color Emoji", sans-serif`
        ctx.fillText(COLORS[color].icon, p.x, p.y + 0.08 * scale)
        ctx.globalAlpha = 1
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (let r = 0; r < ROWS; r++)
        for (let col = 0; col < colsIn(g, r); col++) {
          const v = g.grid[r][col]
          if (v !== null) ball(center(g, r, col), v)
        }

      // Хлопки и падение.
      const f = fx.current
      if (f) {
        const t = (now - f.start) / FX_MS
        if (t >= 1) fx.current = null
        else {
          for (const b of f.popped) ball(b.p, b.color, 1 + t * 0.6, 1 - t)
          for (const b of f.dropped) ball({ x: b.p.x, y: b.p.y + t * t * 12 }, b.color, 1, 1 - t * 0.7)
        }
      }

      const fl = flight.current
      const ph = phaseRef.current
      // Прицел: пунктир по траектории с отскоками.
      if (!fl && (ph === 'running' || ph === 'ready') && !g.over) {
        const { path } = trace(g, aimRef.current)
        ctx.strokeStyle = css.getPropertyValue('--aim').trim() || 'rgba(60,70,60,0.45)'
        ctx.lineWidth = 0.12
        ctx.setLineDash([0.25, 0.35])
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (const p of path.slice(1)) ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Летящий шарик.
      if (fl) {
        let d = (now - fl.start) * FLIGHT_SPEED
        if (d >= fl.total) {
          land(fl.shot)
        } else {
          let p = fl.path[0]
          for (let i = 1; i < fl.path.length; i++) {
            const a = fl.path[i - 1]
            const b = fl.path[i]
            const seg = Math.hypot(b.x - a.x, b.y - a.y)
            if (d <= seg) {
              p = { x: a.x + ((b.x - a.x) * d) / (seg || 1), y: a.y + ((b.y - a.y) * d) / (seg || 1) }
              break
            }
            d -= seg
            p = b
          }
          ball(p, fl.color)
        }
      }

      // Пушка: текущий и следующий шарик.
      if (!g.over) {
        if (!fl) ball(SHOOTER, g.current)
        ball(NEXT_AT, g.next, 0.7)
        ctx.fillStyle = css.getPropertyValue('--muted').trim() || '#777'
        ctx.font = '0.7px system-ui, sans-serif'
        ctx.fillText('⇄', NEXT_AT.x + 1.3, NEXT_AT.y)
      }

      if (flight.current || fx.current) raf.current = requestAnimationFrame(draw)
    },
    [land],
  )

  // Рисуем после каждого рендера и, пока что-то движется, — каждый кадр.
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    draw(performance.now())
    return () => cancelAnimationFrame(raf.current)
  })

  // Пауза во время полёта: замораживаем полёт, чтобы шарик не «перепрыгнул».
  useEffect(() => {
    if (phase === 'paused' && flight.current) land(flight.current.shot)
  }, [phase, land])

  /** Перевод точки экрана в координаты поля. */
  function toBoard(e: React.PointerEvent): Point | null {
    const c = canvas.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const k = WIDTH / rect.width
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k }
  }

  const aiming = useRef(false)
  function aimAt(p: Point) {
    setAim(clampAim(p.x - SHOOTER.x, p.y - SHOOTER.y))
  }
  function onPointerDown(e: React.PointerEvent) {
    if (phase !== 'running' && phase !== 'ready') return
    if (confirmExit) return
    const p = toBoard(e)
    if (!p) return
    if (Math.hypot(p.x - NEXT_AT.x, p.y - NEXT_AT.y) < 1.6 * R) {
      doSwap()
      return
    }
    aiming.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    aimAt(p)
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = toBoard(e)
    if (!p) return
    // Мышью можно целиться без нажатия.
    if (aiming.current || (e.pointerType === 'mouse' && (phase === 'running' || phase === 'ready') && !confirmExit)) aimAt(p)
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!aiming.current) return
    aiming.current = false
    const p = toBoard(e)
    // Отпустили ниже пушки — передумали, не стреляем.
    if (p && p.y < SHOOTER.y - R * 0.5) fire()
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
    setBoth(newBubbles(Math.random))
    started.current = false
    fx.current = null
    setConfirmExit(false)
    setResult(null)
    setAim({ x: 0, y: -1 })
    setPhase('ready')
  }

  function exit() {
    if (phase === 'ready' && !started.current) act((e) => e.refundLife())
    else if (phase !== 'over') commit(gameRef.current.score)
    onExit()
  }

  const block = engine.gameBlock(new Date())
  const toRow = SHOTS_PER_ROW - game.shotsSincePop
  const curName = COLORS[game.current].icon
  const active = phase === 'running' || phase === 'ready'

  return (
    <div className="screen snake-screen bubbles-screen">
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
          «Шарики»
        </h2>
        {phase === 'running' || phase === 'paused' ? (
          <button type="button" className="btn ghost small" onClick={togglePause} aria-label={phase === 'running' ? 'Пауза' : 'Продолжить'}>
            {phase === 'running' ? '❚❚' : '▶'}
          </button>
        ) : (
          <span />
        )}
      </header>

      <div className="snake-score">
        <span>Очки: {game.score}</span>
        <span className="muted">Рекорд: {Math.max(record, result?.record ?? 0)}</span>
      </div>
      <p className="bubbles-hint muted">
        До нового ряда: {toRow} {plural(toRow, 'промах', 'промаха', 'промахов')}
      </p>

      <div className="snake-board bubbles-board">
        <canvas
          ref={canvas}
          className="snake-canvas"
          role="img"
          aria-label={`Поле шариков. Очки: ${game.score}. Сейчас в пушке ${curName}, следующий ${COLORS[game.next].icon}.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (aiming.current = false)}
        />
        {phase === 'ready' && (
          <div className="snake-overlay">
            <p>Стреляй шариками: три и больше одинаковых лопаются, а всё, что под ними висело, падает.</p>
            <p className="muted">Веди пальцем по полю и отпусти, чтобы выстрелить. Тап по маленькому шарику — поменять. Если выйти до старта, жизнь вернётся.</p>
            <button type="button" className="btn primary" onClick={() => setPhase('running')}>
              Старт
            </button>
          </div>
        )}
        {phase === 'paused' && !confirmExit && (
          <div className="snake-overlay">
            <p>Пауза</p>
            <button type="button" className="btn primary" onClick={() => setPhase('running')}>
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
          <div className="snake-overlay" role="dialog" aria-modal="true" aria-labelledby="bubbles-over">
            <h3 id="bubbles-over" ref={overHead} tabIndex={-1}>
              {result.newRecord && result.score > 0 ? '★ Новый рекорд! ★' : result.won ? 'Поле чистое!' : 'Партия окончена'}
            </h3>
            <p className="snake-final">{result.score} очков</p>
            {result.won && <p>Все шарики собраны — бонус +200.</p>}
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

      <div className="bubbles-pad" role="group" aria-label="Управление">
        <button type="button" onClick={() => turnAim(-AIM_STEP)} aria-label="Прицел левее" disabled={!active}>
          ◀
        </button>
        <button type="button" className="fire" onClick={fire} disabled={!active || flying}>
          Бросок
        </button>
        <button type="button" onClick={() => turnAim(AIM_STEP)} aria-label="Прицел правее" disabled={!active}>
          ▶
        </button>
        <button type="button" onClick={doSwap} disabled={!active || flying} aria-label={`Поменять шарики: сейчас ${curName}, следующий ${COLORS[game.next].icon}`}>
          ⇄
        </button>
      </div>
    </div>
  )
}
