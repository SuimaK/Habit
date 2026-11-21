import { useState } from 'react'
import { dayOf, needs, type GameEngine, type Habit } from './core'
import { TabBar, type Tab } from './components/TabBar'
import { LIBRARY } from './library'
import { HabitsManager } from './screens/HabitsManager'
import { Onboarding } from './screens/Onboarding'
import { ProgressScreen } from './screens/ProgressScreen'
import { Quests } from './screens/Quests'
import { RewardScreen, type SessionResult } from './screens/RewardScreen'
import { Timer } from './screens/Timer'
import { Today } from './screens/Today'
import { readTimer, writeTimer, type TimerData } from './timerStore'
import { useGame } from './useGame'

const SOON: Record<'games' | 'home', string> = {
  games: 'Мини-игры появятся в блоке 7',
  home: 'Дом и магазин появятся в блоке 6',
}

interface TimerOpen {
  habitId: string
  data: TimerData | null
}

/** Незаконченный таймер после перезапуска — если его привычка ещё активна. */
function restoreTimer(engine: GameEngine): TimerOpen | null {
  const t = readTimer()
  if (t && engine.state.habits.some((h) => h.id === t.habitId && !h.archived)) return { habitId: t.habitId, data: t }
  if (t) writeTimer(null)
  return null
}

const COMPLETE_NOTE: Record<string, string> = {
  alreadyCompletedToday: 'Привычка уже отмечена сегодня — сессия записана без новой награды.',
  weeklyTargetReached: 'Норма на эту неделю уже выполнена — сессия записана без награды.',
  notScheduledToday: 'Сегодня эта привычка не запланирована — сессия записана без награды.',
}

export default function App() {
  const { engine, now, act, storageOk } = useGame()
  const [tab, setTab] = useState<Tab>('today')
  const [managing, setManaging] = useState(false)
  const [timer, setTimer] = useState<TimerOpen | null>(() => restoreTimer(engine))
  const [reward, setReward] = useState<(SessionResult & { day: string }) | null>(null)
  const s = engine.state
  const timerHabit = timer && s.habits.find((h) => h.id === timer.habitId && !h.archived)

  function finishSession(h: Habit, minutes: number, moodBefore?: number) {
    const result = act((e, at) => {
      const day = dayOf(at)
      const value = () => needs(e.state.habits, e.state.completions, day).find((n) => n.category === h.category)!
      const before = value()
      const r = e.complete(h.id, at)
      e.logSession({ habitId: h.id, day, minutes, moodBefore })
      const after = value()
      return {
        habit: h,
        day,
        minutes,
        event: r.ok ? r.value : undefined,
        note: r.ok ? undefined : (COMPLETE_NOTE[r.error] ?? 'Отметить не получилось — сессия записана.'),
        need: { label: before.label, before: before.value, after: after.value, max: before.max },
      }
    })
    writeTimer(null)
    setTimer(null)
    setReward(result)
  }

  if (s.profile && timer && timerHabit) {
    return (
      <div className="app">
        <main>
          <Timer
            key={timer.habitId}
            habit={timerHabit}
            data={timer.data}
            onChange={(data) => {
              writeTimer(data)
              setTimer({ habitId: timer.habitId, data })
            }}
            onFinish={(minutes, moodBefore) => finishSession(timerHabit, minutes, moodBefore)}
            onExit={() => {
              writeTimer(null)
              setTimer(null)
            }}
          />
        </main>
      </div>
    )
  }

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
      <main inert={!!reward}>
        {tab === 'today' ? (
          <Today
            engine={engine}
            now={now}
            act={act}
            storageOk={storageOk}
            onManage={() => setManaging(true)}
            onQuests={() => setTab('quests')}
            onTimer={(h) => setTimer({ habitId: h.id, data: null })}
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
      <div inert={!!reward}>
        <TabBar tab={tab} onChange={setTab} />
      </div>
      {reward && (
        <RewardScreen
          result={reward}
          onClose={(mood) => {
            if (mood) act((e) => e.setMoodAfter(reward.habit.id, reward.day, mood))
            setReward(null)
          }}
        />
      )}
    </div>
  )
}
