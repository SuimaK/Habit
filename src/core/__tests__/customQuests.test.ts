import { describe, expect, it } from 'vitest'
import { CUSTOM_QUEST_REWARD, customProgress, loadState } from '..'
import { at, d, engine, err, must } from './helpers'

const add = (e: ReturnType<typeof engine>, target = 3, id = 'q') =>
  must(e.addCustomQuest({ id, name: 'Без кофе после 16:00', difficulty: 'medium', target }))

describe('свои квесты', () => {
  it('проверка при создании и лимит', () => {
    const e = engine()
    expect(err(e.addCustomQuest({ id: 'a', name: ' ', difficulty: 'easy', target: 3 }))).toBe('emptyName')
    expect(err(e.addCustomQuest({ id: 'a', name: 'x', difficulty: 'easy', target: 0 }))).toBe('badTarget')
    expect(err(e.addCustomQuest({ id: 'a', name: 'x', difficulty: 'easy', target: 8 }))).toBe('badTarget')
    for (let i = 0; i < 5; i++) add(e, 3, `q${i}`)
    expect(err(e.addCustomQuest({ id: 'z', name: 'x', difficulty: 'easy', target: 1 }))).toBe('tooMany')
  })

  it('отметки только в эту неделю и не в будущем; награда по сложности один раз в неделю', () => {
    const e = engine()
    add(e)
    expect(err(e.toggleCustomMark('q', d(19), at(18)))).toBe('future')
    expect(err(e.toggleCustomMark('q', d(15), at(18)))).toBe('notThisWeek')
    must(e.toggleCustomMark('q', d(16), at(18)))
    must(e.toggleCustomMark('q', d(17), at(18)))
    expect(err(e.claimCustom('q', at(18)))).toBe('notReady')
    must(e.toggleCustomMark('q', d(18), at(18)))
    const coins = e.state.coins
    const ev = must(e.claimCustom('q', at(18)))
    expect(ev.xp).toBe(CUSTOM_QUEST_REWARD.medium.xp)
    expect(e.state.coins - coins).toBe(CUSTOM_QUEST_REWARD.medium.coins)
    expect(e.state.quests.claimedCount).toBe(1)
    expect(err(e.claimCustom('q', at(19)))).toBe('claimed')
    expect(err(e.toggleCustomMark('q', d(18), at(19)))).toBe('claimed')
    // Новая неделя — с нуля.
    const q = e.state.customQuests[0]
    expect(customProgress(q, d(23))).toEqual({ done: 0, target: 3, complete: false, claimed: false })
    must(e.toggleCustomMark('q', d(23), at(23)))
    expect(customProgress(e.state.customQuests[0], d(23)).done).toBe(1)
  })

  it('снятие отметки и удаление', () => {
    const e = engine()
    add(e, 1)
    expect(must(e.toggleCustomMark('q', d(16), at(16)))).toBe(true)
    expect(must(e.toggleCustomMark('q', d(16), at(16)))).toBe(false)
    e.removeCustomQuest('q')
    expect(e.state.customQuests).toEqual([])
    add(e, 1, 'w')
    must(e.toggleCustomMark('w', d(16), at(16)))
    must(e.claimCustom('w', at(16)))
    e.removeCustomQuest('w')
    expect(e.state.customQuests[0].archived).toBe(true)
    expect(err(e.claimCustom('w', at(16)))).toBe('notFound')
    expect(err(e.updateCustomQuest({ id: 'w', name: 'x', difficulty: 'easy', target: 1 }))).toBe('notFound')
  })

  it('цикл «создать → забрать → удалить» не даёт больше 5 наград в неделю', () => {
    const e = engine()
    for (let i = 0; i < 7; i++) {
      add(e, 1, `c${i}`)
      must(e.toggleCustomMark(`c${i}`, d(16), at(16)))
      const r = e.claimCustom(`c${i}`, at(16))
      expect(err(r)).toBe(i < 5 ? 'ok' : 'weeklyLimit')
      e.removeCustomQuest(`c${i}`)
    }
    expect(e.state.quests.claimedCount).toBe(5)
  })

  it('награду за выполненную прошлую неделю можно забрать в понедельник', () => {
    const e = engine()
    add(e, 1)
    must(e.toggleCustomMark('q', d(22), at(22, 23, 59)))
    expect(err(e.toggleCustomMark('q', d(22), at(23)))).toBe('notThisWeek')
    const ev = must(e.claimCustom('q', at(23)))
    expect(ev.xp).toBe(CUSTOM_QUEST_REWARD.medium.xp)
    expect(e.state.customQuests[0].claimedWeeks).toEqual([d(16)])
    expect(err(e.claimCustom('q', at(23)))).toBe('notReady')
    // Две недели назад — уже нет.
    const f = engine()
    add(f, 1)
    must(f.toggleCustomMark('q', d(22), at(22)))
    expect(err(f.claimCustom('q', at(30)))).toBe('notReady')
  })

  it('loadState чистит свои квесты', () => {
    const s = loadState({
      habits: [],
      customQuests: [{ id: 'a', name: 'x', difficulty: 'weird', target: 99, marks: [d(1), d(1), 5, 'junk'] }, { id: 'a', name: 'dup' }, { id: 'e', name: '  ' }, { name: 'no id' }, null],
    })
    expect(s.customQuests).toEqual([{ id: 'a', name: 'x', difficulty: 'easy', target: 7, marks: [d(1)], claimedWeeks: [] }])
  })
})
