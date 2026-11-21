import { useEffect, useRef, useState } from 'react'
import { LIFE_PACKS, dayOf, nextBoundary, type GameEngine, type LifePack } from '../core'
import { plural } from '../labels'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  onPlay: () => void
}

export const BLOCK_TEXT = {
  noLives: 'Жизни закончились. Новые придут в 06:00, а ещё их можно купить за монеты ниже.',
  limitReached: 'На сегодня игровое время закончилось — завтра будет снова. Лимит меняется в настройках.',
} as const

const coinsWord = (n: number) => plural(n, 'монета', 'монеты', 'монет')

/** Вкладка «Игры» (ТЗ 5.5). */
export function Games({ engine, now, act, onPlay }: Props) {
  const s = engine.state
  const g = s.games
  const today = dayOf(now)
  const playedMin = Math.floor((g.playedByDay[today] ?? 0) / 60)
  const block = engine.gameBlock(now)
  const [notice, setNotice] = useState<string | null>(null)
  const lastBuy = useRef(0)
  const refresh = nextBoundary(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const level = engine.level.level

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  function buy(pack: LifePack) {
    const t = Date.now()
    if (t - lastBuy.current < 800) return
    lastBuy.current = t
    const r = act((e) => e.buyLives(pack))
    const n = LIFE_PACKS[pack].lives
    setNotice(r.ok ? `+${n} ${plural(n, 'жизнь', 'жизни', 'жизней')}` : 'Пока не хватает монет')
  }

  return (
    <div className="screen games">
      <header className="screen-head games-head">
        <h1>Игры</h1>
        <div className="stats">
          <span>
            <span aria-hidden>♥ </span>
            <span className="sr-only">Жизни: </span>
            {s.lives.count}
          </span>
          <span>
            <span aria-hidden>🪙 </span>
            <span className="sr-only">Монеты: </span>
            {s.coins.toLocaleString('ru-RU')}
          </span>
        </div>
      </header>

      <div className={`home-notice ${notice ? 'on' : ''}`}>
        <span role="status">{notice ?? ''}</span>
      </div>

      <section className="card list-card" aria-label="Мини-игры">
        <ul>
          <li className="game-row">
            <span className="game-icon" aria-hidden>
              🥕
            </span>
            <span className="row-text">
              «Перекус»
              <small>Змейка · рекорд {g.records.snack ?? 0}</small>
            </span>
            <button type="button" className="btn primary small" disabled={!!block} onClick={onPlay} aria-label="Играть в «Перекус», стоит 1 жизнь" aria-describedby={block ? 'game-block' : undefined}>
              Играть ♥1
            </button>
          </li>
          <li className="game-row soon-row">
            <span className="game-icon" aria-hidden>
              🫧
            </span>
            <span className="row-text">
              «Шарики»
              <small>Появится в следующей версии</small>
            </span>
          </li>
          <li className="game-row soon-row">
            <span className="game-icon" aria-hidden>
              🧱
            </span>
            <span className="row-text">
              «Блоки»
              <small>{level >= 10 ? 'Появится в следующей версии' : 'Откроется на 10-м уровне'}</small>
            </span>
          </li>
        </ul>
        {block && <p className="muted game-block" id="game-block">{BLOCK_TEXT[block]}</p>}
      </section>

      <section className="card list-card" aria-labelledby="lives-h">
        <h3 id="lives-h">Жизни</h3>
        <ul>
          {(['one', 'five'] as const).map((pack) => {
            const { lives, price } = LIFE_PACKS[pack]
            return (
              <li key={pack} className="reward-row shop-pad">
                <span className="row-text shop-text">
                  +{lives} {plural(lives, 'жизнь', 'жизни', 'жизней')}
                  <small>
                    {price} {coinsWord(price)}
                  </small>
                </span>
                {s.coins >= price ? (
                  <button type="button" className="btn primary small" onClick={() => buy(pack)} aria-label={`Купить ${lives} ${plural(lives, 'жизнь', 'жизни', 'жизней')} за ${price} ${coinsWord(price)}`}>
                    Купить
                  </button>
                ) : (
                  <span className="quest-wait">
                    <span className="sr-only">Не хватает </span>ещё {price - s.coins}
                    <span className="sr-only"> {coinsWord(price - s.coins)}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="muted game-info">Бесплатно: 3 жизни каждый день в {refresh}, в запасе до 5.</p>
        <p className="muted game-info">
          {g.limitMin ? `Сегодня сыграно: ${Math.min(playedMin, g.limitMin)} из ${g.limitMin} мин.` : `Сегодня сыграно: ${playedMin} мин. Лимит выключен.`}
        </p>
      </section>
    </div>
  )
}
