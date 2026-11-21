export type Tab = 'today' | 'quests' | 'games' | 'progress' | 'home'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Сегодня', icon: '☀' },
  { id: 'quests', label: 'Квесты', icon: '⚑' },
  { id: 'games', label: 'Игры', icon: '♟' },
  { id: 'progress', label: 'Прогресс', icon: '▦' },
  { id: 'home', label: 'Дом', icon: '⌂' },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={t.id === tab ? 'active' : ''}
          aria-current={t.id === tab ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-icon" aria-hidden>
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
