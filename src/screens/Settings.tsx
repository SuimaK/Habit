import { useEffect, useRef, useState } from 'react'
import { makeBackup, makeCsv, parseBackup, saveFile, type BackupSummary } from '../backup'
import { readKeptCopy } from '../storage'
import { GAME_LIMIT_OPTIONS, type GameState, type Profile } from '../core'
import { Room } from '../components/Room'
import { HAIRS, SHIRTS, SKINS } from '../labels'
import { Swatches } from './Onboarding'

interface Props {
  profile: Profile
  onSave: (p: Profile) => void
  onHabits: () => void
  onClose: () => void
  /** Несохранённые правки — хранятся снаружи, чтобы пережить переход к привычкам. */
  draft: Profile | null
  onDraft: (p: Profile) => void
  gameLimit: number
  onGameLimit: (minutes: number) => void
  /** Текущее состояние — для копии и CSV. */
  state: GameState
  /** false — состояние не удалось применить. */
  onRestore: (s: GameState) => boolean
}

/** Настройки: имя и внешний вид персонажа, переход к привычкам. */
export function Settings({ profile, onSave, onHabits, onClose, draft, onDraft, gameLimit, onGameLimit, state, onRestore }: Props) {
  const start = draft ?? profile
  const [name, setNameState] = useState(start.name)
  const [look, setLookState] = useState({ skin: start.skin, hair: start.hair, shirt: start.shirt })
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => head.current?.focus(), [])
  const setName = (v: string) => {
    setNameState(v)
    onDraft({ ...profile, ...look, name: v })
  }
  const setLook = (l: typeof look) => {
    setLookState(l)
    onDraft({ ...profile, ...l, name })
  }
  const [error, setError] = useState(false)
  const changed = name.trim() !== profile.name || look.skin !== profile.skin || look.hair !== profile.hair || look.shirt !== profile.shirt

  function save() {
    if (!name.trim()) return setError(true)
    onSave({ ...profile, ...look, name: name.trim() })
    onClose()
  }

  return (
    <div className="screen sheet settings">
      <header className="sheet-head">
        <button type="button" className="btn ghost small" onClick={onClose}>
          {changed ? 'Отмена' : 'Назад'}
        </button>
        <h2 ref={head} tabIndex={-1}>
          Настройки
        </h2>
        <button type="button" className="btn ghost small" onClick={save} disabled={!changed}>
          Сохранить
        </button>
      </header>

      <section className="card settings-card">
        <label className="field">
          <span>Имя</span>
          <input
            value={name}
            maxLength={20}
            onChange={(e) => {
              setName(e.target.value)
              setError(false)
            }}
            aria-invalid={error}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            Имя не может быть пустым
          </p>
        )}
      </section>

      <section className="card settings-card">
        <div className="look-preview">
          <Room mood="happy" cheerKey={0} look={look} />
        </div>
        <Swatches label="Кожа" colors={SKINS} value={look.skin} onChange={(skin) => setLook({ ...look, skin })} />
        <Swatches label="Волосы" colors={HAIRS} value={look.hair} onChange={(hair) => setLook({ ...look, hair })} />
        <Swatches label="Одежда" colors={SHIRTS} value={look.shirt} onChange={(shirt) => setLook({ ...look, shirt })} />
      </section>

      <section className="card list-card">
        <ul>
          <li>
            <button type="button" className="row" onClick={onHabits}>
              <span className="row-text">
                Мои привычки
                <small>Добавить, изменить, убрать в архив</small>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </button>
          </li>
        </ul>
      </section>
      <section className="card settings-card">
        <fieldset className="field">
          <legend>Время игр в день</legend>
          <div className="seg" role="radiogroup" aria-label="Время игр в день">
            {GAME_LIMIT_OPTIONS.map((m) => (
              <button
                type="button"
                key={m}
                role="radio"
                aria-checked={gameLimit === m}
                className={gameLimit === m ? 'on' : ''}
                onClick={() => onGameLimit(m)}
              >
                {m ? `${m} мин` : 'Без лимита'}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="muted settings-note">Меняется сразу, без кнопки «Сохранить».</p>
      </section>
      <DataSection state={state} onRestore={onRestore} />
    </div>
  )
}

const BACKUP_ERRORS = {
  notJson: 'Это не файл копии — не получилось его прочитать.',
  notBackup: 'В этом файле нет данных приложения.',
  newerVersion: 'Копия сделана в более новой версии приложения. Обнови страницу и попробуй ещё раз.',
  broken: 'Копия повреждена — восстановить из неё не получится. Текущий прогресс не тронут.',
  tooBig: 'Файл слишком большой для копии приложения.',
  unreadable: 'Не получилось открыть файл. Если он в iCloud, сначала скачай его в «Файлах».',
}

/** Резервная копия, восстановление и выгрузка истории. */
function DataSection({ state, onRestore }: { state: GameState; onRestore: (s: GameState) => boolean }) {
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState<{ state: GameState; summary: BackupSummary } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreBtn = useRef<HTMLButtonElement>(null)
  const [kept, setKept] = useState(() => readKeptCopy())
  useEffect(() => {
    if (pending) confirmRef.current?.focus()
  }, [pending])

  async function exportBackup() {
    const { name, text } = makeBackup(state, new Date())
    const r = await saveFile(name, text, 'application/json')
    setStatus(r === 'cancelled' ? '' : `Копия готова: ${name}. Сохрани её в «Файлы» или отправь себе.`)
  }

  async function exportCsv() {
    const { name, text } = makeCsv(state, new Date())
    const r = await saveFile(name, text, 'text/csv')
    setStatus(r === 'cancelled' ? '' : `История выгружена: ${name}.`)
  }

  async function pick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return setStatus(BACKUP_ERRORS.tooBig)
    let text: string
    try {
      text = await file.text()
    } catch {
      return setStatus(BACKUP_ERRORS.unreadable)
    }
    const r = parseBackup(text)
    if (!r.ok) return setStatus(BACKUP_ERRORS[r.error])
    setStatus('')
    setPending(r)
  }

  const s = pending?.summary
  return (
    <section className="card settings-card" aria-labelledby="data-h">
      <h3 id="data-h" className="settings-h">Данные</h3>
      <p className="muted settings-note">Прогресс хранится только на этом телефоне. Время от времени сохраняй копию в файл.</p>
      <button type="button" className="btn primary wide" onClick={exportBackup}>
        Сохранить копию
      </button>
      <button type="button" className="btn ghost wide" ref={restoreBtn} onClick={() => fileRef.current?.click()}>
        Восстановить из копии
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn ghost wide" onClick={exportCsv}>
        Выгрузить историю (CSV)
      </button>
      {pending && s && (
        <div className="timer-confirm card" role="group" aria-label="Восстановить из копии">
          <p>
            В копии{s.exportedAt ? ` от ${new Date(s.exportedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}:{' '}
            {s.name ?? 'без имени'}, ур. {s.level}, привычек: {s.habits}, отметок: {s.completions}, монет: {s.coins}.
          </p>
          <p className="muted">
            Текущий прогресс на телефоне заменится данными из копии. Дни после даты копии будут считаться пропущенными — щиты
            сработают, если есть. Текущее состояние отложится, его можно будет вернуть.
          </p>
          <div className="row-btns">
            <button
              type="button"
              className="btn ghost"
              ref={confirmRef}
              onClick={() => {
                setPending(null)
                restoreBtn.current?.focus()
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!onRestore(pending.state)) {
                  setPending(null)
                  setStatus(BACKUP_ERRORS.broken)
                  restoreBtn.current?.focus()
                }
              }}
            >
              Заменить
            </button>
          </div>
        </div>
      )}
      {kept && !pending && (
        <button
          type="button"
          className="btn ghost wide"
          onClick={() => {
            const r = parseBackup(kept)
            if (r.ok && onRestore(r.state)) return
            setKept(null)
            setStatus(BACKUP_ERRORS.broken)
          }}
        >
          Вернуть данные до восстановления
        </button>
      )}
      <p className="muted settings-note" role="status">
        {status}
      </p>
    </section>
  )
}
