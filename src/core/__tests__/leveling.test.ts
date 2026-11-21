import { describe, expect, it } from 'vitest'
import { levelProgress, titleFor, totalXpForLevel, xpToReach } from '..'

describe('уровни', () => {
  it('XP за уровень по формуле 100·N^1.5', () => {
    expect(xpToReach(1)).toBe(0)
    expect(xpToReach(2)).toBe(283)
    expect(xpToReach(4)).toBe(800)
    expect(xpToReach(10)).toBe(3162)
  })

  it('уровень 2 примерно за 2 дня, уровень 10 примерно за 3 месяца при 140 XP/день', () => {
    expect(Math.ceil(totalXpForLevel(2) / 140)).toBe(3) // 2,02 дня: на третий день утром
    expect(totalXpForLevel(2) / 140).toBeLessThan(2.1)
    const days = totalXpForLevel(10) / 140
    expect(days).toBeGreaterThan(80)
    expect(days).toBeLessThan(110)
  })

  it('прогресс по суммарному XP', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpInLevel: 0, xpForNextLevel: 283 })
    expect(levelProgress(282).level).toBe(1)
    expect(levelProgress(283)).toEqual({ level: 2, xpInLevel: 0, xpForNextLevel: 520 })
    expect(levelProgress(300).xpInLevel).toBe(17)
    expect(levelProgress(-5).level).toBe(1)
    const t10 = totalXpForLevel(10)
    expect(levelProgress(t10).level).toBe(10)
    expect(levelProgress(t10 - 1).level).toBe(9)
  })

  it('титул меняется каждые 5 уровней', () => {
    expect(titleFor(1)).toBe('Новичок')
    expect(titleFor(4)).toBe('Новичок')
    expect(titleFor(5)).toBe('Ученик')
    expect(titleFor(10)).toBe('Адепт')
    expect(titleFor(15)).toBe('Мастер')
    expect(titleFor(20)).toBe('Гуру')
    expect(titleFor(99)).toBe('Гуру')
  })
})
