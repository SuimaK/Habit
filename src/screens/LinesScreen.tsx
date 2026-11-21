import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEngine } from '../core'
import { FRUITS, MIN_LINE, SIZE, canMove, findPath, move, newLines, type FruitId, type LinesState, type MoveResult, type Pos } from '../games/lines'
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

/** Ход в анимации: фрукт идёт по пути, потом собранные исчезают, новые вырастают. */
interface Anim {
  res: MoveResult
  /** Поле до хода. */
  before: LinesState['grid']
  fruit: FruitId
  start: number
  /** Когда фрукт дошёл и начались эффекты. */
  walkMs: number
}

const STEP_MS = 45 // на одну клетку пути
const FX_MS = 380
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const same = (a: Pos | null, b: Pos | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1]
const cellName = ([r, c]: Pos) => `ряд ${r + 1}, клетка ${c + 1}`

/** «Грядка»: экран партии. Жизнь уже списана при входе. */
export function LinesScreen({ engine, act, onExit }: Props) {
  const [game, setGame] = useState<LinesState>(() => newLines(Math.random))
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<Result | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [selected, setSelected] = useState<Pos | null>(null)
  /** Рамка клавиатуры. */
  const [cursor, setCursor] = useState<Pos>([4, 4])
  const [showCursor, setShowCursor] = useState(false)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef(game)
  const selRef = useRef(selected)
  selRef.current = selected
  const anim = useRef<Anim | null>(null)
  const raf = useRef(0)
  const playMs = useRef(0)
  const runningSince = useRef<number | null>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const overHead = useRef<HTMLHeadingElement>(null)
  const record = engine.state.games.records.lines ?? 0
  const [, setRedraw] = useState(0)
  /** Был ли старт (до «Старт» выход возвращает жизнь). */
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
        return e.finishGame('lines', score, at)
      })
    },
    [act, stopClock],
  )

  const setBoth = useCallback((g: LinesState) => {
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

  /** Ход закончен (после анимации или сразу). */
  const finish = useCallback(
    (res: MoveResult) => {
      anim.current = null
      setBusy(false)
      if (res.state.over) {
        navigator.vibrate?.(120)
        setResult({ score: res.state.score, ...commit(res.state.score) })
        setConfirmExit(false)
        setPhase('over')
      }
    },
    [commit],
  )

  /** Попробовать сходить выбранным фруктом в клетку. */
  const tryMove = useCallback(
    (to: Pos) => {
      const from = selRef.current
      const g = gameRef.current
      if (!from || anim.current) return
      const res = move(g, from, to, Math.random)
      if (!res) {
        setHint('Туда не пройти: путь закрыт другими фруктами.')
        return
      }
      const fruit = g.grid[from[0]][from[1]] as FruitId
      setSelected(null)
      setHint(res.cleared.length ? `Собрано ${res.cleared.length} — +${res.points}` : '')
      if (res.cleared.length) navigator.vibrate?.(30)
      if (reduceMotion()) {
        setBoth(res.state)
        finish(res)
        return
      }
      anim.current = { res, before: g.grid, fruit, start: performance.now(), walkMs: (res.path.length - 1) * STEP_MS }
      setBusy(true)
      // Новое состояние применяем сразу (счёт и очередь), а поле рисуем по анимации.
      setBoth(res.state)
    },
    [finish, setBoth],
  )

  /** Тап или Enter по клетке. */
  const pick = useCallback(
    (p: Pos) => {
      if (anim.current) return
      const ph = phaseRef.current
      if (ph !== 'running') return
      const g = gameRef.current
      const v = g.grid[p[0]][p[1]]
      if (v !== null) {
        if (same(selRef.current, p)) {
          setSelected(null)
          setHint('')
          return
        }
        setSelected(p)
        setHint(canMove(g.grid, p) ? '' : 'Этот фрукт зажат со всех сторон — выбери другой.')
        return
      }
      if (!selRef.current) {
        setHint('Сначала выбери фрукт, потом пустую клетку.')
        return
      }
      tryMove(p)
    },
    [tryMove],
  )

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
          e.finishGame('lines', score, at)
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

  function togglePause() {
    if (confirmExit) return
    if (phase === 'running') {
      stopClock()
      setPhase('paused')
    } else if (phase === 'paused') setPhase('running')
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (confirmExit) return
      const d: Record<string, Pos> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] }
      if (d[ev.key] && phase === 'running') {
        ev.preventDefault()
        setShowCursor(true)
        setCursor(([r, c]) => [Math.min(SIZE - 1, Math.max(0, r + d[ev.key][0])), Math.min(SIZE - 1, Math.max(0, c + d[ev.key][1]))])
      } else if (ev.key === 'Enter' && phase === 'running' && (ev.target as HTMLElement)?.tagName !== 'BUTTON') {
        ev.preventDefault()
        setShowCursor(true)
        pick(cursor)
      } else if (ev.key === 'Escape' && selected) {
        setSelected(null)
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

  /** Отрисовка поля. Пока выбран фрукт или идёт ход — каждый кадр. */
  const draw = useCallback(
    (now: number) => {
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      const css = getComputedStyle(c)
      const w = c.clientWidth
      const dpr = window.devicePixelRatio || 1
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(w * dpr)
      }
      const k = w / SIZE
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0)
      const boardA = css.getPropertyValue('--board-a').trim() || '#eef3e2'
      const boardB = css.getPropertyValue('--board-b').trim() || '#e3ebd2'
      for (let r = 0; r < SIZE; r++)
        for (let col = 0; col < SIZE; col++) {
          ctx.fillStyle = (r + col) % 2 ? boardB : boardA
          ctx.fillRect(col, r, 1, 1)
        }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const fruit = (x: number, y: number, f: FruitId, scale = 1, alpha = 1) => {
        if (scale <= 0) return
        ctx.globalAlpha = alpha
        ctx.fillStyle = FRUITS[f].color
        ctx.beginPath()
        ctx.arc(x, y, 0.42 * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.beginPath()
        ctx.arc(x - 0.15 * scale, y - 0.15 * scale, 0.1 * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = `${0.5 * scale}px system-ui, "Apple Color Emoji", sans-serif`
        ctx.fillText(FRUITS[f].icon, x, y + 0.03 * scale)
        ctx.globalAlpha = 1
      }

      const a = anim.current
      const g = gameRef.current
      let moving = false
      if (a) {
        const t = Math.max(0, now - a.start)
        const { res } = a
        if (t < a.walkMs) {
          // Фрукт идёт: поле как до хода, без него самого.
          const [fr, fc] = res.path[0]
          for (let r = 0; r < SIZE; r++)
            for (let col = 0; col < SIZE; col++) {
              const v = a.before[r][col]
              if (v !== null && !(r === fr && col === fc)) fruit(col + 0.5, r + 0.5, v)
            }
        } else {
          // Дошёл: собранные раздуваются и тают, новые вырастают.
          const fx = Math.min(1, (t - a.walkMs) / FX_MS)
          const spawnedKeys = new Set(res.spawned.map(([r, cc]) => r * SIZE + cc))
          for (let r = 0; r < SIZE; r++)
            for (let col = 0; col < SIZE; col++) {
              const v = g.grid[r][col]
              if (v !== null) fruit(col + 0.5, r + 0.5, v, spawnedKeys.has(r * SIZE + col) ? fx : 1)
            }
          res.cleared.forEach(([r, col], i) => fruit(col + 0.5, r + 0.5, res.clearedFruits[i], 1 + fx * 0.5, 1 - fx))
        }
        // Идущий фрукт.
        if (t < a.walkMs) {
          const step = t / STEP_MS
          const i = Math.min(res.path.length - 2, Math.floor(step))
          const p = res.path[i]
          const q = res.path[i + 1]
          const u = step - i
          fruit(p[1] + (q[1] - p[1]) * u + 0.5, p[0] + (q[0] - p[0]) * u + 0.5, a.fruit)
        }
        if (t >= a.walkMs + FX_MS) finish(res)
        else moving = true
      } else {
        const sel = selRef.current
        for (let r = 0; r < SIZE; r++)
          for (let col = 0; col < SIZE; col++) {
            const v = g.grid[r][col]
            if (v === null) continue
            const isSel = same(sel, [r, col])
            const bob = isSel && !reduceMotion() ? Math.abs(Math.sin(now / 160)) * 0.07 : 0
            if (isSel) {
              ctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#5f9f63'
              ctx.lineWidth = 0.07
              ctx.strokeRect(col + 0.06, r + 0.06, 0.88, 0.88)
            }
            fruit(col + 0.5, r + 0.5 - bob, v)
          }
        if (sel && !reduceMotion() && phaseRef.current === 'running') moving = true
      }

      if (showCursorRef.current && phaseRef.current === 'running') {
        const [r, col] = cursorRef.current
        ctx.strokeStyle = css.getPropertyValue('--accent-text').trim() || '#3f7f45'
        ctx.lineWidth = 0.05
        ctx.setLineDash([0.12, 0.08])
        ctx.strokeRect(col + 0.03, r + 0.03, 0.94, 0.94)
        ctx.setLineDash([])
      }

      if (moving) raf.current = requestAnimationFrame(draw)
    },
    [finish],
  )
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const showCursorRef = useRef(showCursor)
  showCursorRef.current = showCursor

  useEffect(() => {
    cancelAnimationFrame(raf.current)
    draw(performance.now())
    return () => cancelAnimationFrame(raf.current)
  })

  // Пауза посреди хода: доводим ход до конца сразу.
  useEffect(() => {
    if (phase === 'paused' && anim.current) finish(anim.current.res)
  }, [phase, finish])

  function cellAt(e: React.PointerEvent): Pos | null {
    const c = canvas.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE)
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE)
    if (r < 0 || r >= SIZE || col < 0 || col >= SIZE) return null
    return [r, col]
  }

  function onPointerDown(e: React.PointerEvent) {
    if (confirmExit || phase !== 'running') return
    const p = cellAt(e)
    if (!p) return
    setShowCursor(false)
    setCursor(p)
    pick(p)
  }

  function again() {
    const ok = act((e, at) => e.startGame(at))
    if (!ok) return
    setBoth(newLines(Math.random))
    started.current = false
    anim.current = null
    setBusy(false)
    setSelected(null)
    setHint('')
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
  const free = game.grid.reduce((n, row) => n + row.filter((v) => v === null).length, 0)
  const sel = selected ? game.grid[selected[0]][selected[1]] : null
  const reachable = selected && phase === 'running' && !busy ? findPath(game.grid, selected, cursor) !== null : false

  return (
    <div className="screen snake-screen lines-screen">
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
          «Грядка»
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
      <div className="lines-next" style={{ visibility: phase === 'over' ? 'hidden' : undefined }}>
        <span className="muted">Вырастут:</span>
        {game.next.map((f, i) => (
          <span key={i} className="lines-chip" style={{ background: FRUITS[f].color }} aria-hidden>
            {FRUITS[f].icon}
          </span>
        ))}
        <span className="sr-only">{game.next.map((f) => FRUITS[f].icon).join(', ')}</span>
        <span className="muted lines-free">
          Свободно: {free}
        </span>
      </div>

      <div className="snake-board lines-board">
        <canvas
          ref={canvas}
          className="snake-canvas"
          role="img"
          aria-label={`Грядка 9 на 9. Очки: ${game.score}. Свободных клеток: ${free}.${sel !== null && selected ? ` Выбран ${FRUITS[sel].icon}, ${cellName(selected)}.` : ''}${showCursor ? ` Рамка: ${cellName(cursor)}${selected ? (reachable ? ', туда можно' : '') : ''}.` : ''}`}
          onPointerDown={onPointerDown}
        />
        {phase === 'ready' && (
          <div className="snake-overlay">
            <p>Собирай одинаковые фрукты в ряд: {MIN_LINE} и больше по горизонтали, вертикали или диагонали — урожай собран.</p>
            <p className="muted">Тап по фрукту, потом по пустой клетке — он пройдёт туда, если путь не закрыт. Не собрал ряд — вырастут три новых. Грядка заполнилась — конец партии. Если выйти до старта, потраченная жизнь вернётся.</p>
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
          <div className="snake-overlay" role="dialog" aria-modal="true" aria-labelledby="lines-over">
            <h3 id="lines-over" ref={overHead} tabIndex={-1}>
              {result.newRecord && result.score > 0 ? '★ Новый рекорд! ★' : 'Грядка заполнена'}
            </h3>
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

      <p className="lines-hint muted" role="status">
        {phase === 'running' ? hint || (selected ? 'Теперь тап по пустой клетке.' : 'Выбери фрукт.') : ''}
      </p>
    </div>
  )
}
