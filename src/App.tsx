import { useEffect, useRef, useState } from 'react'
import { dayOf, needs, type GameEngine, type Habit, type Profile } from './core'
import { TabBar, type Tab } from './components/TabBar'
import { LIBRARY } from './library'
import { HabitsManager } from './screens/HabitsManager'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { Onboarding } from './screens/Onboarding'
import { ProgressScreen } from './screens/ProgressScreen'
import { Quests } from './screens/Quests'
import { RewardScreen, type SessionResult } from './screens/RewardScreen'
import { Timer } from './screens/Timer'
import { Today } from './screens/Today'
import { readTimer, writeTimer, type TimerData } from './timerStore'
import { useGame } from './useGame'

const SOON = 'Мини-игры появятся в блоке 7'

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
  const [settings, setSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<Profile | null>(null)
  const [timer, setTimer] = useState<TimerOpen | null>(() => restoreTimer(engine))
  const [reward, setReward] = useState<(SessionResult & { day: string }) | null>(null)
  const s = engine.state
  const timerHabit = timer && s.habits.find((h) => h.id === timer.habitId && !h.archived)

  function finishSession(h: Habit, minutes: number, moodBefore: number | undefined, endedAt: number) {
    const result = act((e, at) => {
      const today = dayOf(at)
      // Сессия засчитывается в день, когда она фактически закончилась.
      // Если это было в прошлый день (приложение было закрыто), прошлый день уже подведён — без отметки.
      const day = dayOf(new Date(endedAt)) < today ? dayOf(new Date(endedAt)) : today
      const value = () => needs(e.state.habits, e.state.completions, today).find((n) => n.category === h.category)!
      const before = value()
      const r = day === today ? e.complete(h.id, at) : null
      e.logSession({ habitId: h.id, day, minutes, moodBefore })
      const after = value()
      return {
        habit: h,
        day,
        minutes,
        event: r?.ok ? r.value : undefined,
        note: !r
          ? 'Таймер закончился в прошлый день — сессия записана в историю без отметки сегодня.'
          : r.ok
            ? undefined
            : (COMPLETE_NOTE[r.error] ?? 'Отметить не получилось — сессия записана.'),
        need: { label: before.label, before: before.value, after: after.value, max: before.max },
      }
    })
    writeTimer(null)
    setTimer(null)
    setReward(result)
  }

  /** После настроек — фокус на заголовок «Дом». */
  const refocusHome = useRef(false)
  useEffect(() => {
    if (!refocusHome.current || settings) return
    refocusHome.current = false
    document.querySelector<HTMLElement>('.home h1')?.focus()
  })
  /** После таймера или награды — фокус обратно на список «Сегодня» (для VoiceOver). */
  const refocus = useRef(false)
  function focusToday() {
    refocus.current = true
  }
  useEffect(() => {
    if (!refocus.current || timer || reward) return
    refocus.current = false
    document.querySelector<HTMLElement>('.habits h2')?.focus()
  })

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
            onFinish={(minutes, moodBefore, endedAt) => finishSession(timerHabit, minutes, moodBefore, endedAt)}
            onExit={() => {
              writeTimer(null)
              setTimer(null)
              focusToday()
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

  if (settings && s.profile) {
    return (
      <div className="app">
        <main>
          <Settings
            profile={s.profile}
            onSave={(p) =>
              act((e) => {
                e.state.profile = p
              })
            }
            onHabits={() => setManaging(true)}
            draft={settingsDraft}
            onDraft={setSettingsDraft}
            onClose={() => {
              setSettings(false)
              setSettingsDraft(null)
              refocusHome.current = true
            }}
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
        ) : tab === 'home' ? (
          <Home engine={engine} now={now} act={act} onSettings={() => setSettings(true)} />
        ) : (
          <div className="screen soon">
            <p>{SOON}</p>
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
            focusToday()
          }}
        />
      )}
    </div>
  )
}
