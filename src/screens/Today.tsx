import { useEffect, useRef, useState } from 'react'
import {
  DIFFICULTY_REWARD,
  dayOf,
  needs,
  streakMultiplier,
  titleFor,
  type CompletionError,
  type GameEngine,
  type Habit,
} from '../core'
import { Room, type Mood } from '../components/Room'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
}

interface Float {
  id: number
  habitId: string
  text: string
}

const ERRORS: Partial<Record<CompletionError, string>> = {
  coinsAlreadySpent: 'Монеты за эту отметку уже потрачены — снять её нельзя',
  weeklyTargetReached: 'Норма на эту неделю уже выполнена',
  notScheduledToday: 'Эта привычка сегодня не запланирована',
}

export function Today({ engine, now, act }: Props) {
  const today = dayOf(now)
  const plan = engine.plan
  const s = engine.state
  const level = engine.level
  const streak = engine.currentStreak(now)
  const multiplier = streakMultiplier(engine.multiplierStreak(now))
  const bars = needs(s.habits, s.completions, today)

  const fixed = plan.fixedHabits(today)
  const flexible = plan.habits.filter((h) => h.frequency.kind === 'timesPerWeek')
  const list = [...fixed, ...flexible]
  const doneCount = list.filter((h) => engine.isCompleted(h.id, today)).length

  const [cheerKey, setCheerKey] = useState(0)
  const [cheering, setCheering] = useState(false)
  const [floats, setFloats] = useState<Float[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const floatId = useRef(0)

  useEffect(() => {
    if (!cheering) return
    const t = setTimeout(() => setCheering(false), 2500)
    return () => clearTimeout(t)
  }, [cheering, cheerKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const mood: Mood =
    cheering || plan.result(today) === 'met' ? 'happy' : bars.some((b) => b.sad) ? 'sad' : 'calm'

  function toggle(h: Habit) {
    if (engine.isCompleted(h.id, today)) {
      const r = act((e, at) => e.undo(h.id, at))
      if (!r.ok) setToast(ERRORS[r.error] ?? 'Не получилось снять отметку')
      return
    }
    const r = act((e, at) => e.complete(h.id, at))
    if (!r.ok) {
      setToast(ERRORS[r.error] ?? 'Не получилось отметить')
      return
    }
    const ev = r.value
    const parts = [`+${ev.xp + ev.bonusXp} XP`, `+${ev.coins + ev.bonusCoins} 🪙`]
    const id = ++floatId.current
    setFloats((f) => [...f, { id, habitId: h.id, text: parts.join('  ') }])
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400)
    setCheerKey((k) => k + 1)
    setCheering(true)
    if (ev.levelAfter > ev.levelBefore) setToast(`Новый уровень ${ev.levelAfter}! ${titleFor(ev.levelAfter)}`)
    else if (ev.bonusXp || ev.bonusCoins) setToast('Все привычки дня выполнены! Бонус +30 XP и +5 монет')
    else if (ev.cappedByDailyLimit) setToast('Достигнут дневной лимит опыта (500 XP)')
  }

  return (
    <div className="screen today">
      <section className="scene card">
        <Room mood={mood} cheerKey={cheerKey} />
        <div className="hud">
          <div className="hud-title">
            Ур. {level.level} · {titleFor(level.level)}
          </div>
          {bars.map((b) => (
            <div className="need" key={b.category}>
              <span className="need-label">{b.label}</span>
              <div
                className={`bar need-${b.category} ${b.sad ? 'sad' : ''}`}
                role="meter"
                aria-label={b.label}
                aria-valuemin={0}
                aria-valuemax={b.max}
                aria-valuenow={b.value}
              >
                <div style={{ width: `${(b.value / b.max) * 100}%` }} />
              </div>
              <span className="need-value">
                {b.value}/{b.max}
                {b.sad ? ' · грустит' : ''}
              </span>
            </div>
          ))}
          <div className="need xp">
            <span className="need-label">XP</span>
            <div className="bar bar-xp" role="meter" aria-label="Опыт до следующего уровня"
              aria-valuemin={0} aria-valuemax={level.xpForNextLevel} aria-valuenow={level.xpInLevel}>
              <div style={{ width: `${(level.xpInLevel / level.xpForNextLevel) * 100}%` }} />
            </div>
            <span className="need-value">
              {level.xpInLevel}/{level.xpForNextLevel}
            </span>
          </div>
          <div className="stats">
            <span title="Серия дней">🔥 {streak} дн.</span>
            <span title="Монеты">🪙 {s.coins}</span>
            <span title="Жизни для игр">♥ {s.lives.count}</span>
            {multiplier > 1 && <span className="mult">XP ×{String(multiplier).replace('.', ',')}</span>}
          </div>
        </div>
      </section>

      <section className="card habits">
        <header className="habits-head">
          <h2>Сегодня</h2>
          <span>
            {doneCount} из {list.length} готово
          </span>
        </header>
        {list.length === 0 && <p className="empty">На сегодня привычек нет — отдыхай.</p>}
        <ul>
          {list.map((h) => {
            const done = engine.isCompleted(h.id, today)
            const weekly = h.frequency.kind === 'timesPerWeek'
            const weekDone = weekly ? plan.doneInWeek(h.id, today) : 0
            const weekTarget = h.frequency.kind === 'timesPerWeek' ? h.frequency.times : 0
            const blocked = weekly && !done && weekDone >= weekTarget
            const xp = Math.round(DIFFICULTY_REWARD[h.difficulty].xp * multiplier)
            return (
              <li key={h.id} className={`habit ${done ? 'done' : ''} ${blocked ? 'blocked' : ''}`}>
                <button
                  className="habit-btn"
                  onClick={() => toggle(h)}
                  aria-pressed={done}
                  disabled={blocked}
                >
                  <span className={`check cat-${h.category}`} aria-hidden />
                  <span className="habit-name">
                    {h.name}
                    {weekly && (
                      <small>
                        {' '}
                        · {weekDone}/{weekTarget} на неделе
                      </small>
                    )}
                  </span>
                  <span className="habit-xp">+{xp} XP</span>
                </button>
                {floats
                  .filter((f) => f.habitId === h.id)
                  .map((f) => (
                    <span key={f.id} className="float" aria-live="polite">
                      {f.text}
                    </span>
                  ))}
              </li>
            )
          })}
        </ul>
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
