import { BADGES, type GameEngine, type Rarity } from '../core'

const RARITY: Record<Rarity, string> = { common: 'обычный', rare: 'редкий', legendary: 'легендарный' }

const fmt = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** Прогресс: пока бейджи и лучшая серия. Календарь и графики — в следующих блоках. */
export function ProgressScreen({ engine }: { engine: GameEngine }) {
  const s = engine.state
  const earned = BADGES.filter((b) => s.badges[b.id]).length
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Прогресс</h1>
      </header>
      <section className="card summary">
        <div>
          <strong>{s.bestStreak}</strong>
          <span className="muted">лучшая серия</span>
        </div>
        <div>
          <strong>{s.quests.claimedCount}</strong>
          <span className="muted">квестов</span>
        </div>
        <div>
          <strong>
            {earned}/{BADGES.length}
          </strong>
          <span className="muted">бейджей</span>
        </div>
      </section>
      <section className="badges" aria-label="Бейджи">
        {BADGES.map((b) => {
          const day = s.badges[b.id]
          return (
            <div key={b.id} className={`badge card ${day ? 'got' : 'locked'} rarity-${b.rarity}`}>
              <span className="badge-icon" aria-hidden>
                {day ? b.icon : '🔒'}
              </span>
              <strong>{b.title}</strong>
              <span className="muted">{b.description}</span>
              <span className="badge-meta">
                {RARITY[b.rarity]}
                {day ? ` · ${fmt(day)}` : ''}
              </span>
            </div>
          )
        })}
      </section>
    </div>
  )
}
