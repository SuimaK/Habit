import { useEffect, useId, useRef, useState } from 'react'
import { DIRECTION_ICONS, DIRECTION_NAME_MAX, DIRECTIONS_MAX, type Direction, type DirectionError, type GameEngine, type Result } from '../core'
import { newId } from '../id'
import { plural } from '../labels'

interface Props {
  engine: GameEngine
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  onClose: () => void
}

interface Draft {
  id: string | null // null — новое
  name: string
  icon: string
  timer: boolean
  base: boolean
}

const ERROR_TEXT: Record<DirectionError, string> = {
  empty: 'Нужно название',
  tooLong: `Название — до ${DIRECTION_NAME_MAX} символов`,
  duplicate: 'Такое направление уже есть',
  limit: `Направлений уже ${DIRECTIONS_MAX} — это максимум`,
  notFound: 'Направление не найдено — список обновился',
  base: 'Стандартное направление удалить нельзя',
  hasHabits: 'Сначала перенеси привычки этого направления в другое или убери их в архив',
}

/** Направления: переименовать стандартные, добавить свои (всего до 5), удалить свои. */
export function Directions({ engine, act, onClose }: Props) {
  const dirs = engine.directions
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const head = useRef<HTMLHeadingElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const iconsLabel = useId()
  const lastAction = useRef(0)

  useEffect(() => head.current?.focus(), [])
  useEffect(() => {
    if (draft) nameRef.current?.focus()
    else head.current?.focus()
  }, [draft === null]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const habitsIn = (id: string) => engine.state.habits.filter((h) => h.category === id && !h.archived).length

  function open(d: Direction | null) {
    setError(null)
    setConfirmDelete(false)
    setDraft(d ? { id: d.id, name: d.name, icon: d.icon, timer: d.timer, base: d.base } : { id: null, name: '', icon: '⭐', timer: false, base: false })
  }

  function guard() {
    const t = Date.now()
    if (t - lastAction.current < 800) return false
    lastAction.current = t
    return true
  }

  function done(r: Result<unknown, DirectionError>, text: string) {
    if (!r.ok) return setError(ERROR_TEXT[r.error])
    setDraft(null)
    setNotice(text)
  }

  function save() {
    if (!draft || !guard()) return
    const name = draft.name.trim()
    if (draft.id === null) done(act((e) => e.addDirection({ name, icon: draft.icon, timer: draft.timer }, `dir-${newId()}`)), `Добавлено: ${name}`)
    else {
      const id = draft.id
      done(act((e) => e.updateDirection(id, { name, icon: draft.icon, timer: draft.base ? undefined : draft.timer })), 'Сохранено')
    }
  }

  function remove() {
    if (!draft?.id || !guard()) return
    if (!confirmDelete) return setConfirmDelete(true)
    const id = draft.id
    const name = draft.name
    done(act((e) => e.removeDirection(id)), `Удалено: ${name}`)
  }

  const notices = (
    <div className={`home-notice ${notice ? 'on' : ''}`}>
      <span role="status">{notice ?? ''}</span>
    </div>
  )

  if (draft) {
    const n = draft.id ? habitsIn(draft.id) : 0
    return (
      <form
        className="sheet"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <header className="sheet-head">
          <button type="button" className="btn ghost small" onClick={() => setDraft(null)}>
            Отмена
          </button>
          <h2>Направление</h2>
          <button type="submit" className="btn primary small">
            Сохранить
          </button>
        </header>

        <label className="field">
          <span>Название</span>
          <input
            ref={nameRef}
            value={draft.name}
            maxLength={DIRECTION_NAME_MAX}
            placeholder="Например, Сон"
            aria-invalid={!!error}
            aria-describedby={error ? 'dir-error' : undefined}
            onChange={(e) => {
              setError(null)
              setDraft({ ...draft, name: e.target.value })
            }}
          />
        </label>
        {error && (
          <p className="form-error" id="dir-error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="field">
          <legend id={iconsLabel}>Значок</legend>
          <div className="icon-grid" role="radiogroup" aria-labelledby={iconsLabel}>
            {DIRECTION_ICONS.map((ic) => (
              <button
                type="button"
                key={ic}
                role="radio"
                aria-checked={draft.icon === ic}
                aria-label={ic}
                className={draft.icon === ic ? 'on' : ''}
                onClick={() => setDraft({ ...draft, icon: ic })}
              >
                {ic}
              </button>
            ))}
          </div>
        </fieldset>

        {draft.base ? (
          <p className="muted settings-note dir-note">
            Стандартное направление: его шкала и таймер остаются как есть, меняются только название и значок.
          </p>
        ) : (
          <>
            <label className="toggle-row">
              <input type="checkbox" checked={draft.timer} onChange={(e) => setDraft({ ...draft, timer: e.target.checked })} />
              <span>
                Таймер для привычек
                <small>Кнопка ▶ у привычки на экране «Сегодня»</small>
              </span>
            </label>
            <p className="muted settings-note dir-note">Своя шкала у персонажа: сколько привычек направления сделано за 7 дней, максимум 10.</p>
          </>
        )}

        {draft.id && !draft.base && (
          <div className="dir-delete">
            {n > 0 ? (
              <p className="muted settings-note">
                Удалить можно, когда в направлении не останется привычек (сейчас {n} {plural(n, 'привычка', 'привычки', 'привычек')}).
              </p>
            ) : (
              <button type="button" className={`btn ${confirmDelete ? 'danger' : 'ghost'} wide`} onClick={remove}>
                {confirmDelete ? 'Точно удалить?' : 'Удалить направление'}
              </button>
            )}
          </div>
        )}
        {notices}
      </form>
    )
  }

  const left = DIRECTIONS_MAX - dirs.length

  return (
    <div className="sheet">
      <header className="sheet-head">
        <button type="button" className="btn ghost small" onClick={onClose}>
          Назад
        </button>
        <h2 ref={head} tabIndex={-1}>
          Направления
        </h2>
        <span className="spacer" />
      </header>

      <section className="card list-card">
        <ul>
          {dirs.map((d) => {
            const n = habitsIn(d.id)
            return (
              <li key={d.id}>
                <button type="button" className="row" onClick={() => open(d)} aria-label={`Изменить направление ${d.name}`}>
                  <span className="dir-icon" aria-hidden>
                    {d.icon}
                  </span>
                  <span className="row-text">
                    {d.name}
                    <small>
                      Шкала «{d.need}», до {d.needMax} · {n} {plural(n, 'привычка', 'привычки', 'привычек')}
                      {d.timer ? ' · таймер' : ''}
                    </small>
                  </span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {left > 0 ? (
        <button type="button" className="btn primary wide" onClick={() => open(null)}>
          + Своё направление
        </button>
      ) : null}
      <p className="muted settings-note dir-note">
        {left > 0
          ? `Можно добавить ещё ${left} ${plural(left, 'направление', 'направления', 'направлений')} — всего до ${DIRECTIONS_MAX}.`
          : `Направлений ${DIRECTIONS_MAX} — это максимум. Чтобы добавить новое, удали одно из своих.`}
      </p>
      {notices}
    </div>
  )
}
