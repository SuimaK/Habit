import { useState } from 'react'
import {
  DAILY_QUEST_REWARD,
  WEEKLY_QUEST_REWARD,
  addDays,
  chestLabel,
  dailyProgress,
  dayOf,
  daysBetween,
  weeklyProgress,
  type GameEngine,
  type RewardEvent,
} from '../core'
import { CATEGORY_LABEL, plural } from '../labels'
import { badgeTitles } from './badgeText'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
}

type Tab = 'day' | 'week'

/** Квесты: ежедневные и недельный с сундуком. Сюжетные цепочки — в следующих версиях. */
export function Quests({ engine, now, act }: Props) {
  const [tab, setTab] = useState<Tab>('day')
  const [message, setMessage] = useState<string | null>(null)
  const s = engine.state
  const today = dayOf(now)
  const q = s.quests

  function report(r: { ok: true; value: RewardEvent } | { ok: false; error: string }) {
    if (!r.ok) return setMessage('Сначала выполни условие квеста')
    const ev = r.value
    const parts = [`+${ev.xp} XP`, `+${ev.coins} монет`]
    if (ev.chest) parts.push(`в сундуке: ${chestLabel(ev.chest)}`)
    if (ev.newBadges.length) parts.push(`новый бейдж: ${badgeTitles(ev.newBadges)}`)
    setMessage(`Квест выполнен! ${parts.join(', ')}`)
  }

  const daysLeft = q.weekly ? daysBetween(today, addDays(q.weekly.weekStart, 6)) + 1 : 0

  return (
    <div className="screen quests">
      <header className="screen-head">
        <h1>Квесты</h1>
      </header>
      <div className="seg tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? 'on' : ''} onClick={() => setTab('day')}>
          День
        </button>
        <button role="tab" aria-selected={tab === 'week'} className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>
          Неделя
        </button>
      </div>

      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {tab === 'day' && (
        <section className="card list-card">
          {q.dailyDay !== today || q.daily.length === 0 ? (
            <p className="empty">Квестов на сегодня нет — добавь привычки, и они появятся.</p>
          ) : (
            <ul>
              {q.daily.map((quest) => {
                const p = dailyProgress(quest, s.habits, s.completions, today)
                return (
                  <li key={quest.id} className="quest">
                    <div className="quest-main">
                      <span className="quest-title">{quest.title}</span>
                      <span className="quest-reward">
                        {DAILY_QUEST_REWARD.xp} XP · {DAILY_QUEST_REWARD.coins} 🪙
                      </span>
                      <Progress done={p.done} target={p.target} />
                    </div>
                    {quest.claimed ? (
                      <span className="quest-done">Получено ✓</span>
                    ) : (
                      <button
                        className="btn primary small"
                        disabled={!p.complete}
                        onClick={() => report(act((e, at) => e.claimDaily(quest.id, at)))}
                      >
                        Забрать
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

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
                  Получено ✓{q.weekly.chest ? ` В сундуке было: ${chestLabel(q.weekly.chest)}` : ''}
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
