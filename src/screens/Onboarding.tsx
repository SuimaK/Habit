import { useMemo, useState } from 'react'
import { dayOf, type Category, type Habit, type Profile, type TimeOfDay } from '../core'
import { Room } from '../components/Room'
import { fromTemplate, suggestStarter, type Answers, type Level, type Template } from '../library'
import { CATEGORY_LABEL, DEFAULT_LOOK, HAIRS, SHIRTS, SKINS } from '../labels'

interface Props {
  onDone: (profile: Profile, habits: Habit[]) => void
  /** Привычки уже есть (например, данные из пробной версии) — шаг выбора привычек пропускаем. */
  skipHabits?: boolean
}

type Step = 'name' | 'focus' | 'level' | 'minutes' | 'time' | 'habits' | 'look'
const ALL_STEPS: Step[] = ['name', 'focus', 'level', 'minutes', 'time', 'habits', 'look']

/** Онбординг: 5 вопросов, стартовые привычки, внешность персонажа. Показывается один раз. */
export function Onboarding({ onDone, skipHabits = false }: Props) {
  // Анкета нужна только для подбора привычек — если они уже есть, остаются имя и внешность.
  const STEPS: Step[] = skipHabits ? ['name', 'look'] : ALL_STEPS
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [focus, setFocus] = useState<Category[]>(['nutrition', 'workout', 'meditation'])
  const [level, setLevel] = useState<Level>('beginner')
  const [minutesPerDay, setMinutes] = useState<Answers['minutesPerDay']>(20)
  const [timeOfDay, setTime] = useState<TimeOfDay>('morning')
  const [look, setLook] = useState(DEFAULT_LOOK)

  const suggested = useMemo(
    () => suggestStarter({ focus, level, minutesPerDay, timeOfDay }),
    [focus, level, minutesPerDay, timeOfDay],
  )
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const chosenKeys = chosen ?? new Set(suggested.map((t) => t.key))

  const current = STEPS[step]
  const canNext =
    (current === 'name' && name.trim().length > 0) ||
    (current === 'focus' && focus.length > 0) ||
    (current === 'habits' && chosenKeys.size > 0) ||
    !['name', 'focus', 'habits'].includes(current)

  function next() {
    if (!canNext) return
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
    const habits = skipHabits ? [] : suggested.filter((t: Template) => chosenKeys.has(t.key)).map(fromTemplate)
    onDone({ name: name.trim(), ...look, createdDay: dayOf(new Date()) }, habits)
  }

  return (
    <div className="onboarding">
      <div className="ob-progress" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      <form
        className="ob-body"
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
      >
        {current === 'name' && (
          <>
            <h1>Привет! Давай заведём персонажа</h1>
            <p className="muted">Он будет жить в уютном доме и радоваться каждой выполненной привычке.</p>
            <label className="field">
              <span>Как зовут персонажа?</span>
              <input
                autoFocus
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Катя"
                enterKeyHint="next"
              />
            </label>
          </>
        )}

        {current === 'focus' && (
          <>
            <h1>Что хочешь менять?</h1>
            <p className="muted">Можно выбрать несколько.</p>
            <div className="choices">
              {(['nutrition', 'workout', 'meditation'] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`choice ${focus.includes(c) ? 'on' : ''}`}
                  aria-pressed={focus.includes(c)}
                  onClick={() => {
                    setChosen(null)
                    setFocus((f) => (f.includes(c) ? f.filter((x) => x !== c) : [...f, c]))
                  }}
                >
                  <span className={`dot cat-${c}`} aria-hidden />
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </>
        )}

        {current === 'level' && (
          <Single
            title="Какой сейчас уровень подготовки?"
            value={level}
            onChange={(v) => {
              setChosen(null)
              setLevel(v)
            }}
            options={[
              ['beginner', 'Начинаю с нуля'],
              ['some', 'Иногда занимаюсь'],
              ['regular', 'Занимаюсь регулярно'],
            ]}
          />
        )}

        {current === 'minutes' && (
          <Single
            title="Сколько времени в день есть на привычки?"
            value={String(minutesPerDay)}
            onChange={(v) => {
              setChosen(null)
              setMinutes(Number(v) as Answers['minutesPerDay'])
            }}
            options={[
              ['10', 'До 10 минут'],
              ['20', '15–30 минут'],
              ['40', 'Больше 30 минут'],
            ]}
          />
        )}

        {current === 'time' && (
          <Single
            title="Когда удобнее заниматься?"
            value={timeOfDay}
            onChange={(v) => {
              setChosen(null)
              setTime(v)
            }}
            options={[
              ['morning', 'Утром'],
              ['day', 'Днём'],
              ['evening', 'Вечером'],
              ['any', 'По-разному'],
            ]}
          />
        )}

        {current === 'habits' && (
          <>
            <h1>Для начала — три привычки</h1>
            <p className="muted">Маленькие шаги работают лучше больших целей. Всё можно поменять потом.</p>
            <div className="choices">
              {suggested.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={`choice ${chosenKeys.has(t.key) ? 'on' : ''}`}
                  aria-pressed={chosenKeys.has(t.key)}
                  onClick={() => {
                    const n = new Set(chosenKeys)
                    if (n.has(t.key)) n.delete(t.key)
                    else n.add(t.key)
                    setChosen(n)
                  }}
                >
                  <span className={`dot cat-${t.category}`} aria-hidden />
                  <span className="choice-text">
                    {t.name}
                    <small>{CATEGORY_LABEL[t.category]}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {current === 'look' && (
          <>
            <h1>Как выглядит {name.trim() || 'персонаж'}?</h1>
            <div className="ob-preview card">
              <Room mood="happy" cheerKey={0} look={look} />
            </div>
            <Swatches label="Кожа" colors={SKINS} value={look.skin} onChange={(skin) => setLook({ ...look, skin })} />
            <Swatches label="Волосы" colors={HAIRS} value={look.hair} onChange={(hair) => setLook({ ...look, hair })} />
            <Swatches label="Одежда" colors={SHIRTS} value={look.shirt} onChange={(shirt) => setLook({ ...look, shirt })} />
          </>
        )}

        <div className="ob-actions">
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              Назад
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!canNext}>
            {step === STEPS.length - 1 ? 'Начать игру' : 'Дальше'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Single<T extends string>(props: {
  title: string
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <>
      <h1>{props.title}</h1>
      <div className="choices" role="radiogroup" aria-label={props.title}>
        {props.options.map(([v, label]) => (
          <button
            type="button"
            key={v}
            role="radio"
            aria-checked={props.value === v}
            className={`choice ${props.value === v ? 'on' : ''}`}
            onClick={() => props.onChange(v)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}

export function Swatches(props: { label: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={props.label}>
      <span className="muted">{props.label}</span>
      <div>
        {props.colors.map((c, i) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={props.value === c}
            aria-label={`${props.label}, вариант ${i + 1}`}
            className={`swatch ${props.value === c ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => props.onChange(c)}
          />
        ))}
      </div>
    </div>
  )
}
