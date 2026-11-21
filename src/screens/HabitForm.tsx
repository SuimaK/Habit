import { useState } from 'react'
import {
  DIFFICULTY_REWARD,
  validateHabit,
  type Category,
  type Difficulty,
  type Frequency,
  type Habit,
  type TargetUnit,
  type TimeOfDay,
} from '../core'
import { CATEGORY_LABEL, DIFFICULTY_LABEL, TIME_LABEL, WEEKDAYS } from '../labels'

interface Props {
  habit: Habit
  isNew: boolean
  onSave: (h: Habit) => void
  onCancel: () => void
  onArchive?: (archived: boolean) => void
}

const UNIT_LABEL: Record<TargetUnit, string> = { times: 'раз', minutes: 'минут', portions: 'порций' }

/** Конструктор привычки: название, направление, сложность, частота, время, цель. */
export function HabitForm({ habit, isNew, onSave, onCancel, onArchive }: Props) {
  const [h, setH] = useState<Habit>(habit)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Habit>) => {
    setError(null)
    setH((x) => ({ ...x, ...patch }))
  }
  const f = h.frequency
  const setFreq = (fr: Frequency) => set({ frequency: fr })

  function save() {
    const clean: Habit = { ...h, name: h.name.trim() }
    const err = validateHabit(clean)
    if (err) return setError(err)
    onSave(clean)
  }

  return (
    <form
      className="sheet"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <header className="sheet-head">
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Отмена
        </button>
        <h2>{isNew ? 'Новая привычка' : 'Привычка'}</h2>
        <button type="submit" className="btn primary small">
          Сохранить
        </button>
      </header>

      <label className="field">
        <span>Название</span>
        <input value={h.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="Например, растяжка 10 мин" />
      </label>

      <fieldset className="field">
        <legend>Направление</legend>
        <div className="seg">
          {(['nutrition', 'workout', 'meditation'] as Category[]).map((c) => (
            <button type="button" key={c} aria-pressed={h.category === c} className={h.category === c ? 'on' : ''} onClick={() => set({ category: c })}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Сложность</legend>
        <div className="seg">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button type="button" key={d} aria-pressed={h.difficulty === d} className={h.difficulty === d ? 'on' : ''} onClick={() => set({ difficulty: d })}>
              {DIFFICULTY_LABEL[d]}
              <small>
                {DIFFICULTY_REWARD[d].xp} XP · {DIFFICULTY_REWARD[d].coins} 🪙
              </small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Как часто</legend>
        <div className="seg">
          <button type="button" aria-pressed={f.kind === 'daily'} className={f.kind === 'daily' ? 'on' : ''} onClick={() => setFreq({ kind: 'daily' })}>
            Каждый день
          </button>
          <button type="button" aria-pressed={f.kind === 'weekdays'} className={f.kind === 'weekdays' ? 'on' : ''}
            onClick={() => setFreq({ kind: 'weekdays', days: f.kind === 'weekdays' ? f.days : [1, 3, 5] })}>
            По дням
          </button>
          <button type="button" aria-pressed={f.kind === 'timesPerWeek'} className={f.kind === 'timesPerWeek' ? 'on' : ''}
            onClick={() => setFreq({ kind: 'timesPerWeek', times: f.kind === 'timesPerWeek' ? f.times : 3 })}>
            N раз в неделю
          </button>
        </div>
        {f.kind === 'weekdays' && (
          <div className="days">
            {WEEKDAYS.map((label, i) => {
              const d = i + 1
              const on = f.days.includes(d)
              return (
                <button type="button" key={d} aria-pressed={on} aria-label={label} className={on ? 'on' : ''}
                  onClick={() => setFreq({ kind: 'weekdays', days: on ? f.days.filter((x) => x !== d) : [...f.days, d].sort() })}>
                  {label}
                </button>
              )
            })}
          </div>
        )}
        {f.kind === 'timesPerWeek' && (
          <div className="stepper">
            <button type="button" aria-label="Меньше" disabled={f.times <= 1} onClick={() => setFreq({ kind: 'timesPerWeek', times: f.times - 1 })}>−</button>
            <span>{f.times} в неделю</span>
            <button type="button" aria-label="Больше" disabled={f.times >= 7} onClick={() => setFreq({ kind: 'timesPerWeek', times: f.times + 1 })}>+</button>
          </div>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>Когда</legend>
        <div className="seg">
          {(['morning', 'day', 'evening', 'any'] as TimeOfDay[]).map((t) => (
            <button type="button" key={t} aria-pressed={(h.timeOfDay ?? 'any') === t} className={(h.timeOfDay ?? 'any') === t ? 'on' : ''} onClick={() => set({ timeOfDay: t })}>
              {TIME_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Цель (необязательно)</legend>
        <div className="target">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Количество"
            value={h.target?.amount ?? ''}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value
              set({ target: v === '' ? undefined : { amount: Number(v), unit: h.target?.unit ?? 'minutes' } })
            }}
          />
          <div className="seg">
            {(['minutes', 'times', 'portions'] as TargetUnit[]).map((u) => (
              <button type="button" key={u} aria-pressed={h.target?.unit === u} className={h.target?.unit === u ? 'on' : ''}
                onClick={() => set({ target: { amount: h.target?.amount ?? 1, unit: u } })}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!isNew && onArchive && (
        <button type="button" className="btn ghost wide" onClick={() => onArchive(!h.archived)}>
          {h.archived ? 'Вернуть из архива' : 'Убрать в архив'}
        </button>
      )}
    </form>
  )
}
