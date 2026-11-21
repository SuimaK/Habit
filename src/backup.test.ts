import { describe, expect, it } from 'vitest'
import { makeBackup, makeCsv, parseBackup } from './backup'
import { GameEngine } from './core'

const now = new Date(2026, 10, 21, 12)

function sample() {
  const e = new GameEngine()
  e.addHabit({ id: 'h1', name: '=Медитация; "тихо"', category: 'meditation', difficulty: 'medium', frequency: { kind: 'daily' }, archived: false }, now)
  e.complete('h1', now)
  e.logSession({ habitId: 'h1', day: '2026-11-21', minutes: 10, moodBefore: 2, moodAfter: 4 })
  e.state.profile = { name: 'Кейт', skin: '#f1c7a5', hair: '#6b4430', shirt: '#e9875f', createdDay: '2026-11-01' }
  return e.state
}

describe('резервная копия', () => {
  it('сохраняется и восстанавливается без потерь', () => {
    const s = sample()
    const { name, text } = makeBackup(s, now)
    expect(name).toBe('privychki-2026-11-21.json')
    const r = parseBackup(text)
    if (!r.ok) throw new Error(r.error)
    expect(r.state).toEqual(s)
    expect(r.summary).toMatchObject({ name: 'Кейт', habits: 1, completions: 1, coins: s.coins })
  })
  it('отличает мусор', () => {
    expect(parseBackup('не json')).toEqual({ ok: false, error: 'notJson' })
    expect(parseBackup('{"a":1}')).toEqual({ ok: false, error: 'notBackup' })
    expect(parseBackup('[1,2]')).toEqual({ ok: false, error: 'notBackup' })
    expect(parseBackup(JSON.stringify({ habits: [] })).ok).toBe(true)
  })
  it('CSV: заголовок, экранирование, защита от формул', () => {
    const { text, name } = makeCsv(sample(), now)
    expect(name).toBe('privychki-history-2026-11-21.csv')
    const lines = text.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('Дата;Тип;Привычка;Направление;XP;Монеты;Минуты;Настроение до;Настроение после')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain(`"'=Медитация; ""тихо"""`)
    expect(lines[2]).toMatch(/^2026-11-21;Таймер;.*;Медитация;;;10;2;4$/)
  })
})
