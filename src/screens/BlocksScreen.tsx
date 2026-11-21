import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEngine } from '../core'
import { COLS, PIECES, ROWS, cellsOf, drop, landing, move, newBlocks, rotate, tick, tickMs, type BlocksState, type LockResult } from '../games/blocks'
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
  lines: number
  record: number
  newRecord: boolean
  newBadges: string[]
}

/** Шаг свайпа в долях клетки. */
const SWIPE_CELL = 1

/** «Блоки»: экран партии. Жизнь уже списана при входе. */
export function BlocksScreen({ engine, act, onExit }: Props) {
  const [game, setGame] = useState<BlocksState>(() => newBlocks(Math.random))
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<Result | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const confirmExitRef = useRef(false)
  confirmExitRef.current = confirmExit
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const canvas = useRef<HTMLCanvasElement>(null)
  const nextCanvas = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef(game)
  const playMs = useRef(0)
  const runningSince = useRef<number | null>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const overHead = useRef<HTMLHeadingElement>(null)
  const record = engine.state.games.records.blocks ?? 0
  const [, setRedraw] = useState(0)
  const started = useRef(false)
  /** Перезапуск таймера падения после ручного шага вниз. */
  const [tickKey, setTickKey] = useState(0)

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
        return e.finishGame('blocks', score, at)
      })
    },
    [act, stopClock],
  )

  const setBoth = useCallback((g: BlocksState) => {
    gameRef.current = g
    setGame(g)
  }, [])

  /** Применить результат шага: линии, конец партии. */
  const apply = useCallback(
    (r: LockResult) => {
      setBoth(r.state)
      if (r.cleared.length) navigator.vibrate?.(40)
      if (r.state.over) {
        navigator.vibrate?.(120)
        setResult({ score: r.state.score, lines: r.state.lines, ...commit(r.state.score) })
        setConfirmExit(false)
        setPhase('over')
      }
    },
    [commit, setBoth],
  )

  // Падение по таймеру; темп растёт с убранными линиями.
  useEffect(() => {
    if (phase !== 'running') return
    started.current = true
    runningSince.current ??= Date.now()
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      apply(tick(gameRef.current, Math.random))
      if (!gameRef.current.over) t = setTimeout(loop, tickMs(gameRef.current))
    }
    t = setTimeout(loop, tickMs(gameRef.current))
    return () => clearTimeout(t)
  }, [phase, apply, tickKey])

  useEffect(() => {
    if (phase === 'over') overHead.current?.focus()
  }, [phase])

  useEffect(() => {
    const flush = () => {
      stopClock()
      if (playMs.current > 0 && !gameRef.current.over) {
        const seconds = playMs.current / 1000
        const score = gameRef.current.score
        playMs.current = 0
        act((e, at) => {
          e.addPlayTime(seconds, at)
          e.finishGame('blocks', score, at)
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

  /** Управление работает только в игре (до «Старт» — нет, чтобы не сдвинуть фигуру случайно). */
  const control = useCallback(
    (kind: 'left' | 'right' | 'rotate' | 'down' | 'drop') => {
      if (confirmExitRef.current || phaseRef.current !== 'running') return
      const g = gameRef.current
      if (kind === 'left') setBoth(move(g, -1))
      else if (kind === 'right') setBoth(move(g, 1))
      else if (kind === 'rotate') setBoth(rotate(g))
      else if (kind === 'down') {
        apply(tick(g, Math.random))
        setTickKey((k) => k + 1)
      } else {
        apply(drop(g, Math.random))
        setTickKey((k) => k + 1)
      }
    },
    [apply, setBoth],
  )

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const map: Record<string, 'left' | 'right' | 'rotate' | 'down' | 'drop'> = {
        ArrowLeft: 'left',
        a: 'left',
        ArrowRight: 'right',
        d: 'right',
        ArrowUp: 'rotate',
        w: 'rotate',
        ArrowDown: 'down',
        s: 'down',
        Enter: 'drop',
      }
      const k = map[ev.key]
      // Enter на кнопке — это нажатие кнопки, не сброс.
      if (k === 'drop' && (ev.target as HTMLElement)?.tagName === 'BUTTON') return
      if (k) {
        ev.preventDefault()
        control(k)
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

  // Отрисовка поля и следующей фигуры.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(c)
    const w = c.clientWidth
    const cell = w / COLS
    const h = cell * ROWS
    const dpr = window.devicePixelRatio || 1
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = css.getPropertyValue('--board-a').trim() || '#eef3e2'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = css.getPropertyValue('--board-b').trim() || '#e3ebd2'
    for (let x = 1; x < COLS; x += 2) ctx.fillRect(x * cell, 0, cell, h)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.floor(cell * 0.62)}px system-ui, "Apple Color Emoji", sans-serif`

    const box = (x: number, y: number, piece: number, alpha = 1) => {
      ctx.globalAlpha = alpha
      ctx.fillStyle = PIECES[piece].color
      ctx.beginPath()
      ctx.roundRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3, cell * 0.22)
      ctx.fill()
      // «Доска» ящика: светлая полоса сверху.
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.fillRect(x * cell + 4, y * cell + 4, cell - 8, cell * 0.16)
      ctx.fillStyle = '#000' // эмодзи берут прозрачность из fillStyle
      ctx.fillText(PIECES[piece].icon, x * cell + cell / 2, y * cell + cell / 2 + 2)
      ctx.globalAlpha = 1
    }

    game.board.forEach((row, y) => row.forEach((v, x) => v !== null && box(x, y, v)))
    if (!game.over) {
      // Тень: куда упадёт фигура.
      const ghost = landing(game)
      ctx.strokeStyle = css.getPropertyValue('--aim').trim() || 'rgba(60,70,60,0.45)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      for (const { x, y } of cellsOf(ghost)) {
        ctx.beginPath()
        ctx.roundRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6, cell * 0.2)
        ctx.stroke()
      }
      ctx.setLineDash([])
      for (const { x, y } of cellsOf(game.active)) box(x, y, game.active.piece)
    }

    // Следующая фигура.
    const n = nextCanvas.current
    const nctx = n?.getContext('2d')
    if (n && nctx) {
      const size = n.clientWidth
      if (n.width !== Math.round(size * dpr)) {
        n.width = Math.round(size * dpr)
        n.height = Math.round(size * dpr)
      }
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      nctx.clearRect(0, 0, size, size)
      const cells = PIECES[game.next].cells
      const xs = cells.map(([x]) => x)
      const ys = cells.map(([, y]) => y)
      const cw = size / 3.4
      const ox = (size - (Math.max(...xs) - Math.min(...xs) + 1) * cw) / 2 - Math.min(...xs) * cw
      const oy = (size - (Math.max(...ys) - Math.min(...ys) + 1) * cw) / 2 - Math.min(...ys) * cw
      nctx.fillStyle = PIECES[game.next].color
      for (const [x, y] of cells) {
        nctx.beginPath()
        nctx.roundRect(ox + x * cw + 1, oy + y * cw + 1, cw - 2, cw - 2, cw * 0.22)
        nctx.fill()
      }
      nctx.fillStyle = '#000'
      nctx.textAlign = 'center'
      nctx.textBaseline = 'middle'
      nctx.font = `${Math.floor(cw * 0.75)}px system-ui, "Apple Color Emoji", sans-serif`
      nctx.fillText(PIECES[game.next].icon, ox + cw / 2, oy + cw / 2 + 1)
    }
  })

  // Жесты: тап — поворот, свайп в сторону — сдвиг, резкий свайп вниз — сброс.
  const touch = useRef<{ x: number; y: number; x0: number; y0: number; t: number; moved: boolean; vertical: boolean } | null>(null)
  function onPointerDown(e: React.PointerEvent) {
    touch.current = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: Date.now(), moved: false, vertical: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    const t = touch.current
    const c = canvas.current
    if (!t || !c) return
    const step = (c.clientWidth / COLS) * SWIPE_CELL
    // Жест вниз: дальше вбок не двигаем, чтобы сброс не сдвигал фигуру.
    const ddx = e.clientX - t.x0
    const ddy = e.clientY - t.y0
    if (!t.moved && ddy > 16 && ddy > Math.abs(ddx)) t.vertical = true
    if (t.vertical) return
    const dx = e.clientX - t.x
    if (Math.abs(dx) >= step) {
      const n = Math.trunc(dx / step)
      for (let i = 0; i < Math.abs(n); i++) control(n > 0 ? 'right' : 'left')
      t.x += n * step
      t.moved = true
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const t = touch.current
    touch.current = null
    if (!t) return
    const dy = e.clientY - t.y0
    const dx = e.clientX - t.x0
    const dt = Date.now() - t.t
    if (dy > 60 && dt < 400 && !t.moved) control('drop')
    else if (!t.moved && !t.vertical && Math.abs(dy) < 12 && Math.abs(dx) < 12 && dt < 350) control('rotate')
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
    setBoth(newBlocks(Math.random))
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
  const running = phase === 'running'

  return (
    <div className="screen snake-screen blocks-screen">
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
          «Блоки»
        </h2>
        {phase === 'running' || phase === 'paused' ? (
          <button type="button" className="btn ghost small" onClick={togglePause} aria-label={phase === 'running' ? 'Пауза' : 'Продолжить'}>
            {phase === 'running' ? '❚❚' : '▶'}
          </button>
        ) : (
          <span />
        )}
      </header>

      <div className="snake-score blocks-score">
        <span className="blocks-points">
          Очки: {game.score}
          <small className="muted">
            Линии: {game.lines} · рекорд {Math.max(record, result?.record ?? 0)}
          </small>
        </span>
        <span className="blocks-next">
          <span className="muted">Дальше</span>
          <canvas ref={nextCanvas} className="blocks-next-canvas" role="img" aria-label={`Следующая фигура: ${PIECES[game.next].cells.length} ${PIECES[game.next].cells.length === 1 ? 'клетка' : PIECES[game.next].cells.length < 5 ? 'клетки' : 'клеток'}`} />
        </span>
      </div>

      <div className="snake-board blocks-board">
        <canvas
          ref={canvas}
          className="snake-canvas"
          role="img"
          aria-label={`Поле с ящиками. Очки: ${game.score}, линии: ${game.lines}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (touch.current = null)}
        />
        {phase === 'ready' && (
          <div className="snake-overlay">
            <p>Складывай ящики с урожаем: заполненный ряд исчезает. Чем больше рядов за раз — тем больше очков.</p>
            <p className="muted">Свайп вбок — сдвинуть, тап — повернуть, резкий свайп вниз — сбросить. Если выйти до старта, потраченная жизнь вернётся.</p>
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
          <div className="snake-overlay" role="dialog" aria-modal="true" aria-labelledby="blocks-over">
            <h3 id="blocks-over" ref={overHead} tabIndex={-1}>
              {result.newRecord && result.score > 0 ? '★ Новый рекорд! ★' : 'Партия окончена'}
            </h3>
            <p className="snake-final">
              {result.score} {plural(result.score, 'очко', 'очка', 'очков')}
            </p>
            <p className="muted">Собрано линий: {result.lines}</p>
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

      <div className="bubbles-pad blocks-pad" role="group" aria-label="Управление">
        <button type="button" onClick={() => control('left')} aria-label="Влево" disabled={!running}>
          ◀
        </button>
        <button type="button" onClick={() => control('rotate')} aria-label="Повернуть" disabled={!running}>
          ⟳
        </button>
        <button type="button" onClick={() => control('right')} aria-label="Вправо" disabled={!running}>
          ▶
        </button>
        <button type="button" onClick={() => control('drop')} aria-label="Сбросить вниз" disabled={!running}>
          ⤓
        </button>
      </div>
    </div>
  )
}
