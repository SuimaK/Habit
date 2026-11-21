import { useEffect, useRef, useState } from 'react'
import {
  DAILY_QUEST_REWARD,
  DAILY_SWAPS_PER_DAY,
  WEEKLY_QUEST_REWARD,
  addDays,
  chestLabel,
  dailyProgress,
  dayOf,
  daysBetween,
  questTitle,
  weeklyProgress,
  type GameEngine,
  type RewardEvent,
} from '../core'
import { CATEGORY_LABEL, plural } from '../labels'
import { badgeTitles } from './badgeText'
import { CustomQuests } from './CustomQuests'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
}

type Tab = 'day' | 'week' | 'mine'

/** Квесты: ежедневные, недельный с сундуком и свои. Сюжетные цепочки — в следующих версиях. */
export function Quests({ engine, now, act }: Props) {
  const [tab, setTab] = useState<Tab>('day')
  const [message, setMessage] = useState<string | null>(null)
  const s = engine.state
  const today = dayOf(now)
  const q = s.quests

  function report(r: { ok: true; value: RewardEvent } | { ok: false; error: string }) {
    if (!r.ok)
      return setMessage(r.error === 'notFound' ? 'Квесты обновились — посмотри список ещё раз' : 'Сначала выполни условие квеста')
    const ev = r.value
    const parts = [`+${ev.xp} XP${ev.cappedByDailyLimit ? ' (дневной лимит опыта)' : ''}`, `+${ev.coins} монет`]
    if (ev.chest) parts.push(`в сундуке: ${chestLabel(ev.chest)}`)
    if (ev.newBadges.length) parts.push(`новый бейдж: ${badgeTitles(ev.newBadges)}`)
    setMessage(`Квест выполнен! ${parts.join(', ')}`)
  }

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message])

  const swapsLeft = engine.dailySwapsLeft(now)
  const anySwap = q.daily.some((x) => engine.canSwapDaily(x.id, now))
  const lastSwap = useRef(0)
  const [focusQuest, setFocusQuest] = useState<string | null>(null)
  useEffect(() => {
    if (!focusQuest) return
    document.getElementById(`quest-${focusQuest}`)?.focus()
    setFocusQuest(null)
  }, [focusQuest])

  function swap(id: string) {
    const t = Date.now()
    if (t - lastSwap.current < 800) return
    lastSwap.current = t
    const r = act((e, at) => e.swapDaily(id, at))
    if (r.ok) {
      setMessage(`Новый квест: ${questTitle(r.value, engine.state.habits)}`)
      setFocusQuest(r.value.id)
    } else
      setMessage(
        r.error === 'noAlternatives'
          ? 'Других квестов на сегодня нет: для замены нужно больше привычек в плане дня'
          : r.error === 'limit'
            ? 'Замена на сегодня уже использована — завтра можно снова'
            : r.error === 'notFound'
              ? 'Квесты обновились — посмотри список ещё раз'
              : 'Этот квест уже выполнен — его можно не менять',
      )
  }

  const daysLeft = q.weekly ? daysBetween(today, addDays(q.weekly.weekStart, 6)) + 1 : 0

  return (
    <div className="screen quests">
      <header className="screen-head">
        <h1>Квесты</h1>
      </header>
      <div className="seg tabs" role="tablist" aria-label="Квесты">
        <button role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? 'on' : ''} onClick={() => setTab('day')}>
          День
        </button>
        <button role="tab" aria-selected={tab === 'week'} className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>
          Неделя
        </button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          Свои
        </button>
      </div>

      {/* Всегда в DOM (живой регион), закреплено сверху — видно при любой прокрутке. */}
      <div className={`home-notice ${message ? 'on' : ''}`}>
        <span role="status">{message ?? ''}</span>
      </div>

      {tab === 'day' && (
        <section className="card list-card">
          {q.dailyDay !== today || q.daily.length === 0 ? (
            <p className="empty">
              Квестов на сегодня нет. Они подбираются под привычки, запланированные на сегодня.
            </p>
          ) : (
            <ul>
              {q.daily.map((quest) => {
                const p = dailyProgress(quest, s.habits, s.completions, today)
                return (
                  <li key={quest.id} className="quest">
                    <div className="quest-main">
                      <span className="quest-title" id={`quest-${quest.id}`} tabIndex={-1}>
                        {questTitle(quest, s.habits)}
                      </span>
                      <span className="quest-reward">
                        {DAILY_QUEST_REWARD.xp} XP · {DAILY_QUEST_REWARD.coins} 🪙
                      </span>
                      <Progress done={p.done} target={p.target} />
                    </div>
                    {quest.claimed ? (
                      <span className="quest-done">Получено ✓</span>
                    ) : p.complete ? (
                      <button
                        className="btn primary small"
                        aria-label={`Забрать награду: ${questTitle(quest, s.habits)}`}
                        onClick={() => report(act((e, at) => e.claimDaily(quest.id, at)))}
                      >
                        Забрать
                      </button>
                    ) : engine.canSwapDaily(quest.id, now) ? (
                      <div className="quest-side">
                        <span className="quest-wait">В процессе</span>
                        <button
                          type="button"
                          className="btn ghost small quest-swap"
                          aria-label={`Заменить квест: ${questTitle(quest, s.habits)}`}
                          onClick={() => swap(quest.id)}
                        >
                          Заменить
                        </button>
                      </div>
                    ) : (
                      <span className="quest-wait">В процессе</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {q.dailyDay === today && q.daily.length > 0 && DAILY_SWAPS_PER_DAY > 0 && (swapsLeft === 0 || anySwap) && (
            <p className="muted quest-note">
              {swapsLeft > 0
                ? `Неудобный квест можно заменить другим — ${DAILY_SWAPS_PER_DAY === 1 ? 'один раз' : `${DAILY_SWAPS_PER_DAY} раза`} в день.`
                : 'Замена на сегодня использована — завтра можно снова.'}
            </p>
          )}
        </section>
      )}

      {tab === 'mine' && <CustomQuests engine={engine} now={now} act={act} report={report} say={setMessage} />}

      {tab === 'week' && q.weekly && (
        <section className="card weekly">
          <header className="weekly-head">
            <h2>Недельный квест</h2>
            <span className="muted">
              ост. {daysLeft} {plural(daysLeft, 'день', 'дня', 'дней')}
            </span>
          </header>
          {q.weekly.lines.length === 0 ? (
            <p className="empty">Добавь привычки, и недельный квест появится.</p>
          ) : (
            <>
              {weeklyProgress(q.weekly, s.habits, s.completions).map(({ line, progress }) => (
                <div key={line.category} className="weekly-line">
                  <span>{CATEGORY_LABEL[line.category]}</span>
                  <Progress done={progress.done} target={progress.target} category={line.category} />
                </div>
              ))}
              <p className="quest-reward">
                Награда: {WEEKLY_QUEST_REWARD.xp} XP · {WEEKLY_QUEST_REWARD.coins} 🪙 · сундук 🎁
              </p>
              {q.weekly.claimed ? (
                <p className="quest-done">
                  Получено ✓{q.weekly.chest ? ` В сундуке было: ${chestLabel(q.weekly.chest)}.` : ''}
                </p>
              ) : (
                <button
                  className="btn primary wide"
                  disabled={!weeklyProgress(q.weekly, s.habits, s.completions).every((x) => x.progress.complete)}
                  onClick={() => report(act((e, at) => e.claimWeekly(at)))}
                >
                  Открыть сундук
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

export function Progress({ done, target, category }: { done: number; target: number; category?: string }) {
  return (
    <div className="qprogress">
      <div
        className={`bar ${category ? `need-${category}` : 'bar-xp'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={done}
        aria-label={`${done} из ${target}`}
      >
        <div style={{ width: `${(done / target) * 100}%` }} />
      </div>
      <span className="muted">
        {done}/{target}
      </span>
    </div>
  )
}
