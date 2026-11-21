import { useState } from 'react'
import { BASE_CATEGORIES, directionName, toneOf, type DirectionsState, type Habit } from '../core'
import { newId } from '../id'
import { DIFFICULTY_LABEL, TIME_LABEL, TIME_ORDER, frequencyLabel, targetLabel } from '../labels'
import { fromTemplate, LIBRARY, type Template } from '../library'
import { HabitForm } from './HabitForm'

interface Props {
  habits: Habit[]
  directions: DirectionsState
  onAdd: (h: Habit) => void
  onUpdate: (h: Habit) => void
  onClose: () => void
}

type View = { kind: 'list' } | { kind: 'library' } | { kind: 'edit'; habit: Habit; isNew: boolean }

const blank = (): Habit => ({
  id: newId(),
  name: '',
  category: 'workout',
  difficulty: 'easy',
  frequency: { kind: 'daily' },
  timeOfDay: 'any',
  archived: false,
})

/** Мои привычки: список, добавление из библиотеки или своей, редактирование, архив. */
export function HabitsManager({ habits, directions, onAdd, onUpdate, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'edit') {
    return (
      <HabitForm
        habit={view.habit}
        directions={directions}
        isNew={view.isNew}
        onCancel={() => setView({ kind: view.isNew ? 'library' : 'list' })}
        onSave={(h) => {
          if (view.isNew) onAdd(h)
          else onUpdate(h)
          setView({ kind: 'list' })
        }}
        onArchive={(h) => {
          onUpdate(h)
          setView({ kind: 'list' })
        }}
      />
    )
  }

  if (view.kind === 'library') {
    const existing = new Set(habits.filter((h) => !h.archived).map((h) => h.name))
    return (
      <div className="sheet">
        <header className="sheet-head">
          <button type="button" className="btn ghost small" onClick={() => setView({ kind: 'list' })}>
            Назад
          </button>
          <h2>Добавить</h2>
          <span className="spacer" />
        </header>
        <button type="button" className="btn primary wide" onClick={() => setView({ kind: 'edit', habit: blank(), isNew: true })}>
          + Своя привычка
        </button>
        {BASE_CATEGORIES.map((c) => (
          <section key={c} className="card list-card">
            <h3>{directionName(directions, c)}</h3>
            <ul>
              {LIBRARY.filter((t) => t.category === c).map((t: Template) => (
                <li key={t.key}>
                  <button
                    type="button"
                    className="row"
                    onClick={() => setView({ kind: 'edit', habit: fromTemplate(t), isNew: true })}
                  >
                    <span className={`dot cat-${toneOf(directions, t.category)}`} aria-hidden />
                    <span className="row-text">
                      {t.name}
                      <small>
                        {frequencyLabel(t.frequency)} · {DIFFICULTY_LABEL[t.difficulty]}
                        {existing.has(t.name) ? ' · уже есть' : ''}
                      </small>
                    </span>
                    <span className="chev" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  const active = habits
    .filter((h) => !h.archived)
    .sort((a, b) => TIME_ORDER[a.timeOfDay ?? 'any'] - TIME_ORDER[b.timeOfDay ?? 'any'])
  const archived = habits.filter((h) => h.archived)
  const row = (h: Habit) => (
    <li key={h.id}>
      <button type="button" className="row" onClick={() => setView({ kind: 'edit', habit: h, isNew: false })}>
        <span className={`dot cat-${toneOf(directions, h.category)}`} aria-hidden />
        <span className="row-text">
          {h.name}
          <small>
            {directionName(directions, h.category)} · {frequencyLabel(h.frequency)} · {TIME_LABEL[h.timeOfDay ?? 'any']} · {DIFFICULTY_LABEL[h.difficulty]}
            {h.target ? ` · ${targetLabel(h.target)}` : ''}
          </small>
        </span>
        <span className="chev" aria-hidden>
          ›
        </span>
      </button>
    </li>
  )

  return (
    <div className="sheet">
      <header className="sheet-head">
        <button type="button" className="btn ghost small" onClick={onClose}>
          Готово
        </button>
        <h2>Мои привычки</h2>
        <button type="button" className="btn primary small" onClick={() => setView({ kind: 'library' })}>
          Добавить
        </button>
      </header>
      <section className="card list-card">
        {active.length === 0 ? <p className="empty">Пока ни одной привычки.</p> : <ul>{active.map(row)}</ul>}
      </section>
      {archived.length > 0 && (
        <section className="card list-card">
          <h3>Архив</h3>
          <ul>{archived.map(row)}</ul>
        </section>
      )}
    </div>
  )
}
