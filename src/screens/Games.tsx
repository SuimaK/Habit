import { useEffect, useRef, useState } from 'react'
import { BLOCKS_LEVEL, LIFE_PACKS, TEST_MODE, UNLIMITED_LIVES_MIN, dayOf, isTestMode, nextBoundary, type GameEngine, type GameId, type LifePack } from '../core'
import { plural } from '../labels'

interface Props {
  engine: GameEngine
  now: Date
  act: <T>(fn: (e: GameEngine, now: Date) => T) => T
  onPlay: (game: GameId) => void
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
  const blocksOpen = level >= BLOCKS_LEVEL
  const unlimitedUntil = engine.unlimitedUntil(now)
  const cost = engine.livesUnlimited(now) ? ', жизни сейчас не тратятся' : ', стоит 1 жизнь'
  const hhmm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

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
            {engine.livesUnlimited(now) ? '∞' : s.lives.count}
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
            <button type="button" className="btn primary small" disabled={!!block} onClick={() => onPlay('snack')} aria-label={`Играть в «Перекус»${cost}`} aria-describedby={block ? 'game-block' : undefined}>
              Играть ♥1
            </button>
          </li>
          <li className="game-row">
            <span className="game-icon" aria-hidden>
              🫧
            </span>
            <span className="row-text">
              «Шарики»
              <small>Стрелялка · рекорд {g.records.bubbles ?? 0}</small>
            </span>
            <button type="button" className="btn primary small" disabled={!!block} onClick={() => onPlay('bubbles')} aria-label={`Играть в «Шарики»${cost}`} aria-describedby={block ? 'game-block' : undefined}>
              Играть ♥1
            </button>
          </li>
          <li className={`game-row ${blocksOpen ? '' : 'soon-row'}`}>
            <span className="game-icon" aria-hidden>
              🧱
            </span>
            <span className="row-text">
              «Блоки»
              <small>{blocksOpen ? `Падающие ящики · рекорд ${g.records.blocks ?? 0}` : `Откроется на ${BLOCKS_LEVEL}-м уровне (сейчас ${level}-й)`}</small>
            </span>
            {blocksOpen && (
              <button type="button" className="btn primary small" disabled={!!block} onClick={() => onPlay('blocks')} aria-label={`Играть в «Блоки»${cost}`} aria-describedby={block ? 'game-block' : undefined}>
                Играть ♥1
              </button>
            )}
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
        {isTestMode(now) ? (
          <p className="game-info">
            Тестовый период: жизни не тратятся до конца{' '}
            {new Date(TEST_MODE.until - 1).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.
          </p>
        ) : (
          unlimitedUntil && <p className="game-info">Безлимит жизней за квест — до {hhmm(unlimitedUntil)}.</p>
        )}
        <p className="muted game-info">Бесплатно: каждый день в {refresh} запас пополняется до 5 жизней.</p>
        <p className="muted game-info">
          За квест дня — {UNLIMITED_LIVES_MIN.daily} минут безлимита жизней, за недельный — {UNLIMITED_LIVES_MIN.weekly}.
        </p>
        <p className="muted game-info">
          {g.limitMin ? `Сегодня сыграно: ${Math.min(playedMin, g.limitMin)} из ${g.limitMin} мин.` : `Сегодня сыграно: ${playedMin} мин. Лимит выключен.`}
        </p>
      </section>
    </div>
  )
}
