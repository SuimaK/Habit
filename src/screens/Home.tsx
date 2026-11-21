import { useEffect, useState } from 'react'
import {
  LIFE_PACKS,
  REWARD_MAX_PRICE,
  REWARD_NAME_MAX,
  SHIELD_PRICE,
  dayOf,
  freeShieldAvailable,
  titleFor,
  type GameEngine,
  type LifePack,
  type PersonalReward,
  type RewardError,
} from '../core'
import { Room } from '../components/Room'
import { newId } from '../id'
import { DEFAULT_LOOK, plural } from '../labels'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  onSettings: () => void
}

const REWARD_ERRORS: Record<RewardError, string> = {
  emptyName: 'Напиши, что это за награда',
  badPrice: `Цена — целое число от 1 до ${REWARD_MAX_PRICE.toLocaleString('ru-RU')}`,
  notFound: 'Награда не найдена — список обновился',
  notEnoughCoins: 'Пока не хватает монет',
  tooLate: 'Отменить можно только в тот же день',
}

const coinsWord = (n: number) => plural(n, 'монета', 'монеты', 'монет')

/** Дом: персонаж, магазин и личные награды (ТЗ 5.4). Настройки — отсюда. */
export function Home({ engine, now, act, onSettings }: Props) {
  const s = engine.state
  const today = dayOf(now)
  const level = engine.level
  const [notice, setNotice] = useState<{ text: string; undo?: string } | null>(null)
  const [editing, setEditing] = useState<PersonalReward | null>(null)
  const rewards = s.rewards.filter((r) => !r.archived)
  const history = [...s.redemptions].reverse().slice(0, 10)
  const freeShield = freeShieldAvailable(s.shields, today)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), notice.undo ? 8000 : 4000)
    return () => clearTimeout(t)
  }, [notice])

  function buyLives(pack: LifePack) {
    const r = act((e) => e.buyLives(pack))
    const n = LIFE_PACKS[pack].lives
    setNotice({ text: r.ok ? `+${n} ${plural(n, 'жизнь', 'жизни', 'жизней')} для игр` : REWARD_ERRORS.notEnoughCoins })
  }

  function buyShield() {
    const r = act((e) => e.buyShield())
    setNotice({ text: r.ok ? 'Щит серии в запасе — он сработает сам, если пропустишь день' : REWARD_ERRORS.notEnoughCoins })
  }

  function redeem(r: PersonalReward) {
    const res = act((e, at) => e.redeemReward(r.id, newId(), at))
    if (!res.ok) return setNotice({ text: REWARD_ERRORS[res.error] })
    setNotice({ text: `Награда твоя: «${r.name}». Наслаждайся!`, undo: res.value.id })
  }

  function cancel(id: string) {
    const res = act((e, at) => e.cancelRedemption(id, at))
    setNotice({ text: res.ok ? 'Отменено, монеты вернулись' : REWARD_ERRORS[res.error] })
  }

  return (
    <div className="screen home">
      <header className="screen-head home-head">
        <h1>Дом</h1>
        <button type="button" className="btn ghost small" onClick={onSettings}>
          Настройки
        </button>
      </header>

      <section className="card scene">
        <Room mood="calm" cheerKey={0} look={s.profile ?? DEFAULT_LOOK} />
        <div className="hud">
          <div className="hud-title">
            {s.profile ? `${s.profile.name} · ` : ''}Ур. {level.level} · {titleFor(level.level)}
          </div>
          <div className="stats">
            <span aria-label={`Монеты: ${s.coins}`}>
              <span aria-hidden>🪙 </span>
              {s.coins}
            </span>
            <span aria-label={`Жизни для игр: ${s.lives.count}`}>
              <span aria-hidden>♥ </span>
              {s.lives.count}
            </span>
            <span aria-label={`Щиты серии: ${s.shields.purchased + (freeShield ? 1 : 0)}`}>
              <span aria-hidden>🛡 </span>
              {s.shields.purchased + (freeShield ? 1 : 0)}
            </span>
          </div>
        </div>
      </section>

      {notice && (
        <div className="notice home-notice" role="status">
          <span>{notice.text}</span>
          {notice.undo && (
            <button type="button" className="btn ghost small" onClick={() => cancel(notice.undo!)}>
              Отменить
            </button>
          )}
        </div>
      )}

      <section className="card list-card shop" aria-labelledby="shop-h">
        <h3 id="shop-h">Магазин</h3>
        <ul>
          <ShopRow title="Жизнь для игр" price={LIFE_PACKS.one.price} coins={s.coins} onBuy={() => buyLives('one')} />
          <ShopRow title="5 жизней для игр" price={LIFE_PACKS.five.price} coins={s.coins} onBuy={() => buyLives('five')} />
          <ShopRow
            title="Щит серии"
            hint={`${freeShield ? 'Бесплатный на этой неделе есть' : 'Бесплатный на этой неделе использован'}${s.shields.purchased ? ` · куплено: ${s.shields.purchased}` : ''}`}
            price={SHIELD_PRICE}
            coins={s.coins}
            onBuy={buyShield}
          />
        </ul>
        <p className="muted shop-later">Мебель и одежда появятся вместе с обустройством дома.</p>
      </section>

      <section className="card list-card" aria-labelledby="rewards-h">
        <h3 id="rewards-h">Мои награды</h3>
        {rewards.length === 0 && !editing && (
          <p className="empty">Придумай, чем порадовать себя за монеты: «Сериал вечером» — 100, «Новые кроссовки» — 2 000.</p>
        )}
        <ul>
          {rewards.map((r) =>
            editing?.id === r.id ? (
              <li key={r.id}>
                <RewardForm
                  initial={r}
                  onSave={(next) => act((e) => e.updateReward(next))}
                  onDelete={() => {
                    act((e) => e.removeReward(r.id))
                    setEditing(null)
                  }}
                  onClose={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={r.id} className="reward-row">
                <button type="button" className="row reward-name" onClick={() => setEditing(r)} aria-label={`Изменить награду «${r.name}»`}>
                  <span className="row-text">
                    {r.name}
                    <small>
                      {r.price.toLocaleString('ru-RU')} {coinsWord(r.price)}
                    </small>
                  </span>
                </button>
                {s.coins >= r.price ? (
                  <button type="button" className="btn primary small" onClick={() => redeem(r)} aria-label={`Взять «${r.name}» за ${r.price}`}>
                    Взять
                  </button>
                ) : (
                  <span className="quest-wait">ещё {(r.price - s.coins).toLocaleString('ru-RU')}</span>
                )}
              </li>
            ),
          )}
          {editing && !rewards.some((r) => r.id === editing.id) && (
            <li>
              <RewardForm
                initial={editing}
                onSave={(next) => act((e) => e.addReward(next))}
                onClose={() => setEditing(null)}
              />
            </li>
          )}
        </ul>
        {!editing && (
          <button type="button" className="btn ghost wide add-reward" onClick={() => setEditing({ id: newId(), name: '', price: 100 })}>
            + Добавить свою награду
          </button>
        )}
      </section>

      {history.length > 0 && (
        <section className="card list-card" aria-labelledby="history-h">
          <h3 id="history-h">Получено</h3>
          <ul>
            {history.map((h) => (
              <li key={h.id} className="history-row">
                <span className="row-text">
                  {h.name}
                  <small>
                    {fmtDay(h.day)} · {h.price.toLocaleString('ru-RU')} {coinsWord(h.price)}
                  </small>
                </span>
                {h.day === today && (
                  <button type="button" className="btn ghost small" onClick={() => cancel(h.id)} aria-label={`Отменить «${h.name}»`}>
                    Отменить
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function fmtDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function ShopRow({ title, hint, price, coins, onBuy }: { title: string; hint?: string; price: number; coins: number; onBuy: () => void }) {
  const can = coins >= price
  return (
    <li className="reward-row">
      <span className="row-text shop-text">
        {title}
        <small>
          {price} {coinsWord(price)}
          {hint ? ` · ${hint}` : ''}
        </small>
      </span>
      {can ? (
        <button type="button" className="btn primary small" onClick={onBuy} aria-label={`Купить: ${title} за ${price}`}>
          Купить
        </button>
      ) : (
        <span className="quest-wait">ещё {price - coins}</span>
      )}
    </li>
  )
}

function RewardForm({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: PersonalReward
  onSave: (r: PersonalReward) => { ok: true } | { ok: false; error: RewardError }
  onDelete?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [price, setPrice] = useState(String(initial.price))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function save(ev: React.FormEvent) {
    ev.preventDefault()
    const p = Number(price.replace(/\s/g, ''))
    const r = onSave({ ...initial, name, price: price.trim() === '' ? NaN : p })
    if (!r.ok) return setError(REWARD_ERRORS[r.error])
    onClose()
  }

  return (
    <form className="reward-form" onSubmit={save} noValidate>
      <label className="field">
        <span>Награда</span>
        <input value={name} maxLength={REWARD_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Например, сериал вечером" autoFocus />
      </label>
      <label className="field">
        <span>Цена в монетах</span>
        <input value={price} inputMode="numeric" onChange={(e) => setPrice(e.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {confirmDelete ? (
        <div className="row-btns">
          <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
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
          Удалить награду
        </button>
      )}
    </form>
  )
}
