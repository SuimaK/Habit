import { useEffect, useRef, useState } from 'react'
import {
  DAILY_QUEST_REWARD,
  DIFFICULTY_REWARD,
  dailyProgress,
  questTitle,
  dayOf,
  daysBetween,
  needs,
  streakMultiplier,
  titleFor,
  type CompletionError,
  type GameEngine,
  type Habit,
} from '../core'
import { Room, type Mood } from '../components/Room'
import { DEFAULT_LOOK, TIME_ORDER } from '../labels'
import { badgeTitles } from './badgeText'
import { Progress } from './Quests'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  storageOk: boolean
  onManage: () => void
  onQuests: () => void
  /** Открыть таймер привычки. */
  onTimer: (h: Habit) => void
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
  usedInQuest: 'Эта отметка уже засчитана в забранный квест — снять её нельзя',
}

export function Today({ engine, now, act, storageOk, onManage, onQuests, onTimer }: Props) {
  const today = dayOf(now)
  const plan = engine.plan
  const s = engine.state
  const level = engine.level
  const streak = engine.currentStreak(now)
  const multiplier = streakMultiplier(engine.multiplierStreak(now))
  // Первую неделю окно шкал ещё не заполнено — не грустим, чтобы не было чувства вины на старте.
  const settling = s.profile ? daysBetween(s.profile.createdDay, today) < 7 : false
  const bars = needs(s.habits, s.completions, today).map((b) => (settling ? { ...b, sad: false } : b))

  const fixed = plan.fixedHabits(today)
  const flexible = plan.habits.filter((h) => h.frequency.kind === 'timesPerWeek')
  const list = [...fixed, ...flexible].sort(
    (a, b) => TIME_ORDER[a.timeOfDay ?? 'any'] - TIME_ORDER[b.timeOfDay ?? 'any'],
  )
  const doneCount = list.filter((h) => engine.isCompleted(h.id, today)).length

  const [cheerKey, setCheerKey] = useState(0)
  const [cheering, setCheering] = useState(false)
  const [floats, setFloats] = useState<Float[]>([])
  const [toast, setToast] = useState<string | null>(null)
  /** Постоянный live-регион для VoiceOver. */
  const [announce, setAnnounce] = useState('')
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

  // Сначала квест, который уже можно забрать, потом первый незабранный.
  const openQuests = s.quests.dailyDay === today ? s.quests.daily.filter((q) => !q.claimed) : []
  const questOfDay =
    openQuests.find((q) => dailyProgress(q, s.habits, s.completions, today).complete) ?? openQuests[0]
  const questProgress = questOfDay ? dailyProgress(questOfDay, s.habits, s.completions, today) : null

  const mood: Mood =
    cheering || plan.result(today) === 'met' ? 'happy' : bars.some((b) => b.sad) ? 'sad' : 'calm'

  function addFloat(habitId: string, text: string) {
    const id = ++floatId.current
    setFloats((f) => [...f, { id, habitId, text }])
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400)
  }

  function say(message: string | null, spoken?: string) {
    setToast(message)
    setAnnounce(spoken ?? message ?? '')
  }

  function toggle(h: Habit) {
    // Отметить или снять решаем по фактическому времени тапа: день мог смениться.
    const res = act((e, at) =>
      e.isCompleted(h.id, dayOf(at))
        ? { kind: 'undo' as const, xp: e.state.completions.find((c) => c.habitId === h.id && c.day === dayOf(at))?.xp ?? 0, r: e.undo(h.id, at) }
        : { kind: 'done' as const, xp: 0, r: e.complete(h.id, at) },
    )
    if (res.kind === 'undo') {
      if (!res.r.ok) return say(ERRORS[res.r.error] ?? 'Не получилось снять отметку')
      addFloat(h.id, `−${res.xp} XP`)
      return say(null, `Отметка снята: ${h.name}`)
    }
    const r = res.r
    if (!r.ok) return say(ERRORS[r.error] ?? 'Не получилось отметить')
    const ev = r.value
    addFloat(h.id, `+${ev.xp} XP  +${ev.coins} 🪙`)
    setCheerKey((k) => k + 1)
    setCheering(true)
    const spoken = `${h.name}: выполнено, плюс ${ev.xp} опыта и ${ev.coins} монет.`
    // Все важные события одним сообщением, чтобы одно не вытесняло другое.
    const news: string[] = []
    if (ev.levelAfter > ev.levelBefore) news.push(`Новый уровень ${ev.levelAfter}! ${titleFor(ev.levelAfter)}`)
    if (ev.bonusXp || ev.bonusCoins) news.push(`Все привычки дня выполнены! Бонус +${ev.bonusXp} XP и +${ev.bonusCoins} монет`)
    if (ev.newBadges.length) news.push(`Новый бейдж: ${badgeTitles(ev.newBadges)}`)
    if (ev.cappedByDailyLimit) news.push('Достигнут дневной лимит опыта (500 XP)')
    say(news.length ? news.join('. ') : null, news.length ? `${spoken} ${news.join('. ')}` : spoken)
  }

  return (
    <div className="screen today">
      {!storageOk && (
        <p className="warning" role="alert">
          Не получается сохранить прогресс на этом устройстве — после закрытия он пропадёт. Проверь, что
          приватный режим Safari выключен.
        </p>
      )}
      <section className="scene card">
        <Room mood={mood} cheerKey={cheerKey} look={s.profile ?? DEFAULT_LOOK} />
        <div className="hud">
          <div className="hud-title">
            {s.profile ? `${s.profile.name} · ` : ''}Ур. {level.level} · {titleFor(level.level)}
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
              <span className="need-value" aria-label={b.sad ? `${b.value} из ${b.max}, низкая` : undefined}>
                {b.value}/{b.max}
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
            <span aria-label={`Серия ${streak} дн.`}>
              <span aria-hidden>🔥 </span>
              {streak} дн.
            </span>
            <span aria-label={`Монеты: ${s.coins}`}>
              <span aria-hidden>🪙 </span>
              {s.coins}
            </span>
            <span aria-label={`Жизни для игр: ${s.lives.count}`}>
              <span aria-hidden>♥ </span>
              {s.lives.count}
            </span>
            {multiplier > 1 && (
              <span className="mult" aria-label={`Множитель опыта ${multiplier}`}>
                XP ×{String(multiplier).replace('.', ',')}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="card habits">
        <header className="habits-head">
          <h2 tabIndex={-1}>Сегодня</h2>
          <span>
            {doneCount} из {list.length} готово
          </span>
          <button type="button" className="btn ghost small edit-btn" onClick={onManage}>
            Изменить
          </button>
        </header>
        {list.length === 0 && (
          <p className="empty">
            {plan.habits.length === 0 ? 'Привычек пока нет — нажми «Изменить», чтобы добавить.' : 'На сегодня привычек нет — отдыхай.'}
          </p>
        )}
        <ul>
          {list.map((h) => {
            const done = engine.isCompleted(h.id, today)
            const weekly = h.frequency.kind === 'timesPerWeek'
            const weekDone = weekly ? plan.doneInWeek(h.id, today) : 0
            const weekTarget = h.frequency.kind === 'timesPerWeek' ? h.frequency.times : 0
            const blocked = weekly && !done && weekDone >= weekTarget
            const xp = Math.round(DIFFICULTY_REWARD[h.difficulty].xp * multiplier)
            const timed = (h.category === 'workout' || h.category === 'meditation') && !done && !blocked
            return (
              <li key={h.id} className={`habit ${done ? 'done' : ''} ${blocked ? 'blocked' : ''} ${timed ? 'timed' : ''}`}>
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
                {timed && (
                  <button type="button" className="play-btn" aria-label={`Таймер: ${h.name}`} onClick={() => onTimer(h)}>
                    <span aria-hidden>▶</span>
                  </button>
                )}
                {floats
                  .filter((f) => f.habitId === h.id)
                  .map((f) => (
                    <span key={f.id} className="float" aria-hidden>
                      {f.text}
                    </span>
                  ))}
              </li>
            )
          })}
        </ul>
      </section>

      {questOfDay && (
        <section className="card quest-day">
          <div className="quest-main">
            <span className="muted small-caps">Квест дня</span>
            <span className="quest-title">{questTitle(questOfDay, s.habits)}</span>
            <span className="quest-reward">
              Награда: {DAILY_QUEST_REWARD.xp} XP + {DAILY_QUEST_REWARD.coins} монет
            </span>
            <Progress done={questProgress!.done} target={questProgress!.target} />
          </div>
          {questProgress!.complete ? (
            <button
              className="btn primary small"
              aria-label={`Забрать награду: ${questTitle(questOfDay, s.habits)}`}
              onClick={() => {
                const r = act((e, at) => e.claimDaily(questOfDay.id, at))
                if (r.ok)
                  say(
                    `Квест выполнен! +${r.value.xp} XP и +${r.value.coins} монет` +
                      (r.value.cappedByDailyLimit ? ' (дневной лимит опыта)' : '') +
                      (r.value.newBadges.length ? `. Новый бейдж: ${badgeTitles(r.value.newBadges)}` : ''),
                  )
                else say('Квесты обновились — загляни во вкладку «Квесты»')
              }}
            >
              Забрать
            </button>
          ) : (
            <button className="btn ghost small" onClick={onQuests}>
              Все
            </button>
          )}
        </section>
      )}

      {toast && (
        <div className="toast" aria-hidden>
          {toast}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  )
}
