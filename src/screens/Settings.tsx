import { useState } from 'react'
import type { Profile } from '../core'
import { Room } from '../components/Room'
import { HAIRS, SHIRTS, SKINS } from '../labels'
import { Swatches } from './Onboarding'

interface Props {
  profile: Profile
  onSave: (p: Profile) => void
  onHabits: () => void
  onClose: () => void
}

/** Настройки: имя и внешний вид персонажа, переход к привычкам. */
export function Settings({ profile, onSave, onHabits, onClose }: Props) {
  const [name, setName] = useState(profile.name)
  const [look, setLook] = useState({ skin: profile.skin, hair: profile.hair, shirt: profile.shirt })
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
        <h2>Настройки</h2>
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
      <p className="muted settings-later">Лимит игр и резервная копия появятся в следующих блоках.</p>
    </div>
  )
}
