import { useEffect, useRef, useState } from 'react'
import { titleFor, type Habit, type RewardEvent } from '../core'
import { MoodPicker } from '../components/MoodPicker'
import { plural } from '../labels'
import { badgeTitles } from './badgeText'

export interface SessionResult {
  habit: Habit
  minutes: number
  /** Награда за отметку; нет — если привычка уже была отмечена или отметить нельзя. */
  event?: RewardEvent
  /** Почему награды нет. */
  note?: string
  need: { label: string; before: number; after: number; max: number }
}

/** Экран награды после таймера (ТЗ 5.3). */
export function RewardScreen({ result, onClose }: { result: SessionResult; onClose: (moodAfter?: number) => void }) {
  const [moodAfter, setMoodAfter] = useState<number | undefined>()
  const ref = useRef<HTMLHeadingElement>(null)
  const ev = result.event
  const { need } = result
  const mins = Math.max(0, Math.round(result.minutes))

  useEffect(() => ref.current?.focus(), [])

  return (
    <div className="reward-backdrop">
      <div className="reward card" role="dialog" aria-modal="true" aria-labelledby="reward-title">
        <h2 id="reward-title" ref={ref} tabIndex={-1}>
          {ev ? '★ Отлично! ★' : 'Сессия записана'}
        </h2>
        <p className="muted">
          {result.habit.name} · {mins < 1 ? 'меньше минуты' : `${mins} ${plural(mins, 'минута', 'минуты', 'минут')}`}
        </p>
        {ev && (
          <div className="reward-gain">
            <span className="xp-gain">+{ev.xp} XP</span>
            <span>
              +{ev.coins} {plural(ev.coins, 'монета', 'монеты', 'монет')}
            </span>
          </div>
        )}
        {ev && need.after > need.before && (
          <p className="reward-need">
            {need.label} +{need.after - need.before} ({need.before} → {need.after})
          </p>
        )}
        {ev && need.after === need.before && need.after >= need.max && (
          <p className="reward-need">
            {need.label} на максимуме ({need.max}/{need.max})
          </p>
        )}
        <ul className="reward-news">
          {ev && (ev.bonusXp > 0 || ev.bonusCoins > 0) && (
            <li>
              Все привычки дня выполнены! Бонус +{ev.bonusXp} XP и +{ev.bonusCoins} монет
            </li>
          )}
          {ev && ev.levelAfter > ev.levelBefore && (
            <li>
              Новый уровень {ev.levelAfter} · {titleFor(ev.levelAfter)}
            </li>
          )}
          {ev && ev.newBadges.length > 0 && <li>Новый бейдж: {badgeTitles(ev.newBadges)}</li>}
          {ev?.cappedByDailyLimit && <li>Достигнут дневной лимит опыта (500 XP)</li>}
          {result.note && <li>{result.note}</li>}
        </ul>
        <MoodPicker label="Настроение после" value={moodAfter} onChange={setMoodAfter} />
        <button type="button" className="btn primary wide" onClick={() => onClose(moodAfter)}>
          {ev ? 'Забрать' : 'Готово'}
        </button>
      </div>
    </div>
  )
}
