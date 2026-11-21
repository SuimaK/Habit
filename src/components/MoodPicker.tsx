const MOODS = ['очень плохо', 'плохо', 'нормально', 'хорошо', 'отлично']

/** Настроение 1–5. Повторный тап по выбранному снимает выбор. */
export function MoodPicker({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="mood">
      <span id={`mood-${label}`}>{label}</span>
      <div className="mood-row" role="radiogroup" aria-labelledby={`mood-${label}`}>
        {MOODS.map((name, i) => {
          const v = i + 1
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              aria-label={`${v} — ${name}`}
              className={value === v ? 'on' : ''}
              onClick={() => onChange(value === v ? undefined : v)}
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}
