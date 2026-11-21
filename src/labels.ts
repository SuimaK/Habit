import type { Category, Difficulty, Frequency, HabitTarget, TimeOfDay } from './core'

export const CATEGORY_LABEL: Record<Category, string> = {
  nutrition: 'Питание',
  workout: 'Тренировки',
  meditation: 'Медитация',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Лёгкая',
  medium: 'Средняя',
  hard: 'Сложная',
}

export const TIME_LABEL: Record<TimeOfDay, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
  any: 'В любое время',
}

export const TIME_ORDER: Record<TimeOfDay, number> = { morning: 0, day: 1, evening: 2, any: 3 }

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function frequencyLabel(f: Frequency): string {
  switch (f.kind) {
    case 'daily':
      return 'Каждый день'
    case 'weekdays':
      return [...f.days].sort().map((d) => WEEKDAYS[d - 1]).join(', ')
    case 'timesPerWeek':
      return `${f.times} ${plural(f.times, 'раз', 'раза', 'раз')} в неделю`
  }
}

export function targetLabel(t: HabitTarget): string {
  const n = t.amount.toLocaleString('ru-RU')
  switch (t.unit) {
    case 'minutes':
      return `${n} мин`
    case 'portions':
      return `${n} ${plural(t.amount, 'порция', 'порции', 'порций')}`
    case 'times':
      return `${n} ${plural(t.amount, 'раз', 'раза', 'раз')}`
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export const SKINS = [
  { color: '#f6d9c0', name: 'очень светлая' },
  { color: '#f1c7a5', name: 'светлая' },
  { color: '#dca37c', name: 'смуглая' },
  { color: '#b07650', name: 'тёмная' },
  { color: '#7a4c33', name: 'очень тёмная' },
]
export const HAIRS = [
  { color: '#2b1d16', name: 'чёрные' },
  { color: '#6b4430', name: 'каштановые' },
  { color: '#b5723a', name: 'медные' },
  { color: '#e2c27a', name: 'светлые' },
  { color: '#a3a3a3', name: 'седые' },
  { color: '#c4553a', name: 'рыжие' },
]
export const SHIRTS = [
  { color: '#e9875f', name: 'коралловая' },
  { color: '#7b8ce0', name: 'синяя' },
  { color: '#63a36b', name: 'зелёная' },
  { color: '#d16fa0', name: 'розовая' },
  { color: '#e9b44c', name: 'жёлтая' },
  { color: '#5e6b8c', name: 'серо-синяя' },
]

export interface Look {
  skin: string
  hair: string
  shirt: string
}

export const DEFAULT_LOOK: Look = { skin: '#f1c7a5', hair: '#6b4430', shirt: '#e9875f' }
