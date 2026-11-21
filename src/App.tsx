import { useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { HabitsManager } from './screens/HabitsManager'
import { Onboarding } from './screens/Onboarding'
import { Today } from './screens/Today'
import { useGame } from './useGame'

const SOON: Record<Exclude<Tab, 'today'>, string> = {
  quests: 'Квесты появятся в блоке 4',
  games: 'Мини-игры появятся в блоке 7',
  progress: 'Прогресс появится позже',
  home: 'Дом и магазин появятся в блоке 6',
}

export default function App() {
  const { engine, now, act, storageOk } = useGame()
  const [tab, setTab] = useState<Tab>('today')
  const [managing, setManaging] = useState(false)
  const s = engine.state

  if (!s.profile) {
    return (
      <div className="app">
        <main>
          <Onboarding
            skipHabits={s.habits.some((h) => !h.archived)}
            onDone={(profile, habits) =>
              act((e, at) => {
                habits.forEach((h) => e.addHabit(h, at))
                e.state.profile = profile
              })
            }
          />
        </main>
      </div>
    )
  }

  if (managing) {
    return (
      <div className="app">
        <main>
          <HabitsManager
            habits={s.habits}
            onAdd={(h) => act((e, at) => e.addHabit(h, at))}
            onUpdate={(h) => act((e, at) => e.updateHabit(h, at))}
            onClose={() => setManaging(false)}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <main>
        {tab === 'today' ? (
          <Today engine={engine} now={now} act={act} storageOk={storageOk} onManage={() => setManaging(true)} />
        ) : (
          <div className="screen soon">
            <p>{SOON[tab]}</p>
          </div>
        )}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
