import { useEffect, useRef, useState } from 'react'
import type { Habit } from '../core'
import { CATEGORY_LABEL } from '../labels'
import { MoodPicker } from '../components/MoodPicker'
import { chime, unlockAudio } from '../chime'
import { MAX_MINUTES, MIN_MINUTES, defaultMinutes, fmtClock, pause, remaining, resume, writeTimer, type TimerData } from '../timerStore'

interface Props {
  habit: Habit
  /** null — ещё не запущен (выбор длительности и настроения). */
  data: TimerData | null
  onChange: (t: TimerData | null) => void
  /** Сессия закончилась (по времени или кнопкой «Завершить»). */
  /** endedAt — когда сессия фактически кончилась (мс); может быть в прошлом, если приложение было закрыто. */
  onFinish: (minutes: number, moodBefore: number | undefined, endedAt: number) => void
  onExit: () => void
}

/** Экран не гаснет, пока идёт таймер (если браузер умеет). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (l) => (cancelled ? void l.release() : (lock = l)),
        () => {},
      )
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release().catch(() => {})
    }
  }, [active])
}

/** Таймер тренировки или медитации (ТЗ 5.3). */
export function Timer({ habit, data, onChange, onFinish, onExit }: Props) {
  const [minutes, setMinutes] = useState(() => defaultMinutes(habit))
  const [moodBefore, setMoodBefore] = useState<number | undefined>(data?.moodBefore)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [confirmExit, setConfirmExit] = useState(false)
  const finished = useRef(false)
  /** Шёл ли таймер, когда открыли подтверждение выхода. */
  const wasRunning = useRef(false)
  const head = useRef<HTMLHeadingElement>(null)
  const meditation = habit.category === 'meditation'

  const running = data !== null && data.endAt !== null
  const left = data ? remaining(data, nowMs) : minutes * 60
  const elapsed = data ? data.durationSec - left : 0

  useWakeLock(running)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNowMs(Date.now()), 250)
    const onVisible = () => setNowMs(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])

  useEffect(() => head.current?.focus(), [])

  function finish(auto = false) {
    if (finished.current || !data) return
    finished.current = true
    const at = Date.now()
    const endedAt = data.endAt !== null ? Math.min(at, data.endAt) : at
    const spent = data.durationSec - remaining(data, at)
    if (auto) chime()
    onFinish(spent / 60, data.moodBefore, endedAt)
  }

  // Время вышло — звон и экран награды.
  useEffect(() => {
    if (running && left <= 0) finish(true)
  })

  /** Подтверждение выхода ставит таймер на паузу, чтобы он не закончился, пока решаешь. */
  function askExit() {
    if (!data) return
    wasRunning.current = running
    if (running) onChange(pause(data, Date.now()))
    setConfirmExit(true)
  }

  function stay() {
    setConfirmExit(false)
    if (data && wasRunning.current) {
      const at = Date.now()
      setNowMs(at)
      onChange(resume(data, at))
    }
  }

  function start() {
    unlockAudio()
    const at = Date.now()
    const t: TimerData = { habitId: habit.id, durationSec: minutes * 60, endAt: at + minutes * 60_000, pausedRemaining: minutes * 60, moodBefore }
    writeTimer(t)
    setNowMs(at)
    onChange(t)
  }

  function togglePause() {
    if (!data) return
    const at = Date.now()
    unlockAudio()
    const next = running ? pause(data, at) : resume(data, at)
    setNowMs(at)
    setConfirmExit(false)
    onChange(next)
  }

  const progress = data ? elapsed / data.durationSec : 0
  // Дыхание: 4 с вдох, 4 с выдох.
  const breathIn = Math.floor(elapsed / 4) % 2 === 0

  return (
    <section className="screen timer" aria-label="Таймер">
      <header className="sheet-head">
        <button type="button" className="btn ghost small" onClick={data ? (confirmExit ? undefined : askExit) : onExit}>
          {data ? 'Выйти' : 'Назад'}
        </button>
        <h2 ref={head} tabIndex={-1}>
          {CATEGORY_LABEL[habit.category]}
        </h2>
        <span />
      </header>
      <p className="timer-habit">{habit.name}</p>

      {!data ? (
        <section className="card timer-setup">
          <div className="timer-len">
            <span id="timer-len">Длительность</span>
            <div className="stepper" role="group" aria-labelledby="timer-len">
              <button type="button" aria-label="Меньше" disabled={minutes <= MIN_MINUTES} onClick={() => setMinutes((m) => Math.max(MIN_MINUTES, m > 10 ? m - (m % 5 || 5) : m - 1))}>
                −
              </button>
              <strong aria-live="polite">{minutes} мин</strong>
              <button type="button" aria-label="Больше" disabled={minutes >= MAX_MINUTES} onClick={() => setMinutes((m) => Math.min(MAX_MINUTES, m >= 10 ? m + 5 - (m % 5) : m + 1))}>
                +
              </button>
            </div>
          </div>
          <MoodPicker label="Настроение до" value={moodBefore} onChange={setMoodBefore} />
          <button type="button" className="btn primary wide" onClick={start}>
            ▶ Старт
          </button>
        </section>
      ) : (
        <>
          <div className={`timer-face ${meditation ? 'breath' : ''} ${running ? 'running' : 'paused'} ${meditation && breathIn ? 'in' : 'out'}`}>
            <svg viewBox="0 0 200 200" aria-hidden>
              <circle className="ring-bg" cx="100" cy="100" r="88" />
              <circle
                className={`ring cat-${habit.category}`}
                cx="100"
                cy="100"
                r="88"
                pathLength={100}
                strokeDasharray={`${progress * 100} 100`}
              />
            </svg>
            {meditation && <div className="breath-ball" aria-hidden />}
            <div className="timer-clock">
              <span role="timer" aria-label={`Осталось ${fmtClock(left)}`}>
                {fmtClock(left)}
              </span>
              {meditation && running && <small aria-hidden>{breathIn ? 'вдох…' : 'выдох…'}</small>}
              {!running && <small role="status">пауза</small>}
            </div>
          </div>

          {confirmExit ? (
            <div className="card timer-confirm" role="group" aria-label="Выйти из таймера">
              <p>Выйти без отметки? Сессия не сохранится.</p>
              <div className="row-btns">
                <button type="button" className="btn ghost" onClick={stay} autoFocus>
                  Остаться
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    writeTimer(null)
                    onExit()
                  }}
                >
                  Выйти
                </button>
              </div>
            </div>
          ) : (
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={togglePause}>
                {running ? 'Пауза' : 'Продолжить'}
              </button>
              <button type="button" className="btn primary" onClick={() => finish()}>
                Завершить
              </button>
            </div>
          )}
          <p className="muted timer-hint">«Завершить» раньше времени тоже засчитывает привычку.</p>
        </>
      )}
    </section>
  )
}
