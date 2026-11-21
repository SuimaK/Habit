import { useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
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
  return (
    <div className="app">
      <main>
        {tab === 'today' ? (
          <Today engine={engine} now={now} act={act} storageOk={storageOk} />
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
