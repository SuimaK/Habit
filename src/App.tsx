import { useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { LIBRARY } from './library'
import { HabitsManager } from './screens/HabitsManager'
import { Onboarding } from './screens/Onboarding'
import { ProgressScreen } from './screens/ProgressScreen'
import { Quests } from './screens/Quests'
import { Today } from './screens/Today'
import { useGame } from './useGame'

const SOON: Record<'games' | 'home', string> = {
  games: 'Мини-игры появятся в блоке 7',
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
                // Привычкам из пробной версии подставляем время суток из библиотеки по названию.
                for (const h of e.state.habits) {
                  h.timeOfDay ??= LIBRARY.find((t) => t.name === h.name)?.timeOfDay
                }
                habits.forEach((h) => e.addHabit(h, at))
                e.state.profile = profile
                e.startOfDay(at) // квесты под новые привычки
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
            onAdd={(h) =>
              act((e, at) => {
                e.addHabit(h, at)
                e.startOfDay(at)
              })
            }
            onUpdate={(h) =>
              act((e, at) => {
                e.updateHabit(h, at)
                e.startOfDay(at) // квесты сразу подстраиваются под изменения
              })
            }
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
          <Today
            engine={engine}
            now={now}
            act={act}
            storageOk={storageOk}
            onManage={() => setManaging(true)}
            onQuests={() => setTab('quests')}
          />
        ) : tab === 'quests' ? (
          <Quests engine={engine} now={now} act={act} />
        ) : tab === 'progress' ? (
          <ProgressScreen engine={engine} />
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
