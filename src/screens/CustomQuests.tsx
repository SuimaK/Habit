import { useEffect, useRef, useState } from 'react'
import {
  CUSTOM_QUEST_MAX,
  CUSTOM_QUEST_NAME_MAX,
  CUSTOM_QUEST_REWARD,
  customProgress,
  dayOf,
  weekDays,
  type CustomQuest,
  type CustomQuestError,
  type Difficulty,
  type GameEngine,
  type RewardEvent,
} from '../core'
import { newId } from '../id'
import { DIFFICULTY_LABEL, WEEKDAYS, plural } from '../labels'
import { Progress } from './Quests'

type Draft = Pick<CustomQuest, 'id' | 'name' | 'difficulty' | 'target'>

const CUSTOM_ERRORS: Record<CustomQuestError, string> = {
  emptyName: 'Напиши, в чём квест',
  badTarget: 'Дней в неделю — от 1 до 7',
  tooMany: `Своих квестов может быть до ${CUSTOM_QUEST_MAX}`,
  notFound: 'Квест не найден — список обновился',
  notThisWeek: 'Отмечать можно только дни этой недели',
  future: 'Этот день ещё не наступил',
  claimed: 'Награда за эту неделю уже получена',
  notReady: 'Отметь ещё дни, и награду можно будет забрать',
}

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  report: (r: { ok: true; value: RewardEvent } | { ok: false; error: string }) => void
  say: (text: string) => void
}

const fmtDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** Свои квесты: правило на неделю и отметки по дням (ТЗ 5.2). */
export function CustomQuests({ engine, now, act, report, say }: Props) {
  const today = dayOf(now)
  const days = weekDays(today)
  const quests = engine.state.customQuests.filter((q) => !q.archived)
  const [editing, setEditing] = useState<Draft | null>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const refocus = useRef(false)

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      head.current?.focus()
    }
  }, [editing])

  const close = () => {
    refocus.current = true
    setEditing(null)
  }

  return (
    <section className="custom-quests" aria-labelledby="custom-h">
      <h2 id="custom-h" ref={head} tabIndex={-1} className="sr-only">
        Свои квесты
      </h2>
      {quests.length === 0 && !editing && (
        <p className="card empty custom-empty">
          Придумай своё правило на неделю, например «Без кофе после 16:00» 5 дней из 7. Отмечай дни, а в конце забери награду.
        </p>
      )}
      {quests.map((q) =>
        editing?.id === q.id ? (
          <QuestForm
            key={q.id}
            initial={editing}
            onSave={(d) => act((e) => e.updateCustomQuest(d))}
            onDelete={() => {
              act((e) => e.removeCustomQuest(q.id))
              close()
            }}
            onClose={close}
          />
        ) : (
          <QuestCard
            key={q.id}
            quest={q}
            today={today}
            days={days}
            onEdit={() => setEditing({ id: q.id, name: q.name, difficulty: q.difficulty, target: q.target })}
            onToggle={(day) => {
              const r = act((e, at) => e.toggleCustomMark(q.id, day, at))
              if (!r.ok) say(CUSTOM_ERRORS[r.error])
            }}
            onClaim={() => {
              const r = act((e, at) => e.claimCustom(q.id, at))
              if (r.ok) report(r)
              else say(CUSTOM_ERRORS[r.error])
            }}
          />
        ),
      )}
      {editing && !quests.some((q) => q.id === editing.id) && (
        <QuestForm initial={editing} onSave={(d) => act((e) => e.addCustomQuest(d))} onClose={close} />
      )}
      {!editing && quests.length < CUSTOM_QUEST_MAX && (
        <button
          type="button"
          className="btn ghost wide add-reward"
          onClick={() => setEditing({ id: newId(), name: '', difficulty: 'medium', target: 5 })}
        >
          + Создать свой квест
        </button>
      )}
    </section>
  )
}

function QuestCard({
  quest,
  today,
  days,
  onEdit,
  onToggle,
  onClaim,
}: {
  quest: CustomQuest
  today: string
  days: string[]
  onEdit: () => void
  onToggle: (day: string) => void
  onClaim: () => void
}) {
  const p = customProgress(quest, today)
  const reward = CUSTOM_QUEST_REWARD[quest.difficulty]
  return (
    <article className="card custom-quest" aria-label={quest.name}>
      <button type="button" className="row custom-title" onClick={onEdit} aria-label={`Изменить квест «${quest.name}»`}>
        <span className="row-text">
          <span className="quest-title">{quest.name}</span>
          <small>
            {quest.target} {plural(quest.target, 'день', 'дня', 'дней')} из 7 · {DIFFICULTY_LABEL[quest.difficulty]} · {reward.xp} XP · {reward.coins} 🪙
          </small>
        </span>
        <span className="chev" aria-hidden>
          ›
        </span>
      </button>
      <div className="custom-days" role="group" aria-label="Дни этой недели">
        {days.map((day, i) => {
          const on = quest.marks.includes(day)
          const future = day > today
          return (
            <button
              type="button"
              key={day}
              className={`${on ? 'on' : ''} ${day === today ? 'today' : ''}`}
              aria-pressed={on}
              aria-label={`${WEEKDAYS[i]}, ${fmtDay(day)}${day === today ? ', сегодня' : ''}`}
              disabled={future || p.claimed}
              onClick={() => onToggle(day)}
            >
              <small aria-hidden>{WEEKDAYS[i]}</small>
              <span aria-hidden>{on ? '✓' : ''}</span>
            </button>
          )
        })}
      </div>
      <div className="custom-foot">
        <Progress done={p.done} target={p.target} />
        {p.claimed ? (
          <span className="quest-done">Получено ✓</span>
        ) : p.complete ? (
          <button type="button" className="btn primary small" onClick={onClaim} aria-label={`Забрать награду: ${quest.name}`}>
            Забрать
          </button>
        ) : null}
      </div>
    </article>
  )
}

function QuestForm({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Draft
  onSave: (d: Draft) => { ok: true } | { ok: false; error: CustomQuestError }
  onDelete?: () => void
  onClose: () => void
}) {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const keepRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (confirmDelete) keepRef.current?.focus()
  }, [confirmDelete])

  function save(ev: React.FormEvent) {
    ev.preventDefault()
    const r = onSave(d)
    if (!r.ok) {
      setError(CUSTOM_ERRORS[r.error])
      if (r.error === 'emptyName') nameRef.current?.focus()
      return
    }
    onClose()
  }

  const errId = `${initial.id}-err`
  return (
    <form className="card reward-form" onSubmit={save} noValidate aria-label={onDelete ? 'Изменить квест' : 'Новый квест'}>
      <label className="field">
        <span>Квест</span>
        <input
          ref={nameRef}
          value={d.name}
          maxLength={CUSTOM_QUEST_NAME_MAX}
          onChange={(e) => setD({ ...d, name: e.target.value })}
          placeholder="Например, без кофе после 16:00"
          autoFocus
          aria-invalid={!!error && !d.name.trim()}
          aria-describedby={error ? errId : undefined}
        />
      </label>
      <fieldset className="field">
        <legend>Сколько дней в неделю</legend>
        <div className="stepper">
          <button type="button" aria-label="Меньше" disabled={d.target <= 1} onClick={() => setD({ ...d, target: d.target - 1 })}>
            −
          </button>
          <strong aria-live="polite">
            {d.target} из 7
          </strong>
          <button type="button" aria-label="Больше" disabled={d.target >= 7} onClick={() => setD({ ...d, target: d.target + 1 })}>
            +
          </button>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Сложность</legend>
        <div className="seg" role="radiogroup" aria-label="Сложность">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((x) => (
            <button
              type="button"
              key={x}
              role="radio"
              aria-checked={d.difficulty === x}
              className={d.difficulty === x ? 'on' : ''}
              onClick={() => setD({ ...d, difficulty: x })}
            >
              {DIFFICULTY_LABEL[x]}
              <small>
                {CUSTOM_QUEST_REWARD[x].xp} XP · {CUSTOM_QUEST_REWARD[x].coins} 🪙
              </small>
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert" id={errId}>
          {error}
        </p>
      )}
      {confirmDelete ? (
        <div className="row-btns">
          <button type="button" className="btn ghost" ref={keepRef} onClick={() => setConfirmDelete(false)}>
            Оставить
          </button>
          <button type="button" className="btn danger" onClick={onDelete}>
            Удалить
          </button>
        </div>
      ) : (
        <div className="row-btns">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn primary">
            Сохранить
          </button>
        </div>
      )}
      {onDelete && !confirmDelete && (
        <button type="button" className="btn ghost small delete-link" onClick={() => setConfirmDelete(true)}>
          Удалить квест
        </button>
      )}
    </form>
  )
}
