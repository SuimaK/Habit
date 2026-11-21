import type { Category, Difficulty, Frequency, Habit, HabitTarget, TimeOfDay } from './core'
import { newId } from './id'

/** Шаблон привычки из библиотеки. Только название и параметры — никакого встроенного контента. */
export interface Template {
  key: string
  name: string
  category: Category
  difficulty: Difficulty
  frequency: Frequency
  target?: HabitTarget
  timeOfDay: TimeOfDay
  /** Для какого уровня подготовки подходит лучше всего. */
  level: Level[]
  /** Сколько минут в день занимает (для подбора по свободному времени). */
  minutes: number
}

export type Level = 'beginner' | 'some' | 'regular'

const daily: Frequency = { kind: 'daily' }
const times = (n: number): Frequency => ({ kind: 'timesPerWeek', times: n })
const ALL: Level[] = ['beginner', 'some', 'regular']

export const LIBRARY: Template[] = [
  // Питание
  { key: 'veg2', name: 'Овощи в 2 приёмах пищи', category: 'nutrition', difficulty: 'medium', frequency: daily, target: { amount: 2, unit: 'portions' }, timeOfDay: 'any', level: ALL, minutes: 0 },
  { key: 'veg-dinner', name: 'Овощи в ужин', category: 'nutrition', difficulty: 'easy', frequency: daily, target: { amount: 1, unit: 'portions' }, timeOfDay: 'evening', level: ALL, minutes: 0 },
  { key: 'no-sweet-noon', name: 'Без сладкого до обеда', category: 'nutrition', difficulty: 'easy', frequency: daily, timeOfDay: 'morning', level: ['beginner', 'some'], minutes: 0 },
  { key: 'no-sweet-day', name: 'День без сладкого', category: 'nutrition', difficulty: 'hard', frequency: daily, timeOfDay: 'any', level: ['some', 'regular'], minutes: 0 },
  { key: 'no-late-food', name: 'Без еды после 21:00', category: 'nutrition', difficulty: 'medium', frequency: daily, timeOfDay: 'evening', level: ALL, minutes: 0 },
  { key: 'plate', name: 'Сбалансированная тарелка в обед', category: 'nutrition', difficulty: 'easy', frequency: daily, timeOfDay: 'day', level: ALL, minutes: 0 },
  { key: 'breakfast', name: 'Завтрак до 10:00', category: 'nutrition', difficulty: 'easy', frequency: daily, timeOfDay: 'morning', level: ['beginner', 'some'], minutes: 10 },
  // Тренировки
  { key: 'warmup5', name: 'Зарядка 5 мин', category: 'workout', difficulty: 'easy', frequency: daily, target: { amount: 5, unit: 'minutes' }, timeOfDay: 'morning', level: ['beginner'], minutes: 5 },
  { key: 'warmup7', name: 'Зарядка 7 мин', category: 'workout', difficulty: 'medium', frequency: daily, target: { amount: 7, unit: 'minutes' }, timeOfDay: 'morning', level: ['beginner', 'some'], minutes: 7 },
  { key: 'stretch', name: 'Растяжка 10 мин', category: 'workout', difficulty: 'easy', frequency: daily, target: { amount: 10, unit: 'minutes' }, timeOfDay: 'evening', level: ALL, minutes: 10 },
  { key: 'steps', name: '8 000 шагов', category: 'workout', difficulty: 'medium', frequency: daily, target: { amount: 8000, unit: 'times' }, timeOfDay: 'any', level: ALL, minutes: 0 },
  { key: 'workout15', name: 'Тренировка 15 мин', category: 'workout', difficulty: 'medium', frequency: times(3), target: { amount: 15, unit: 'minutes' }, timeOfDay: 'any', level: ['beginner', 'some'], minutes: 15 },
  { key: 'workout30', name: 'Тренировка 30+ мин', category: 'workout', difficulty: 'hard', frequency: times(3), target: { amount: 30, unit: 'minutes' }, timeOfDay: 'any', level: ['some', 'regular'], minutes: 30 },
  // Медитация
  { key: 'breath3', name: 'Дыхание 3 мин', category: 'meditation', difficulty: 'easy', frequency: daily, target: { amount: 3, unit: 'minutes' }, timeOfDay: 'any', level: ALL, minutes: 3 },
  { key: 'med5', name: 'Медитация 5 мин утром', category: 'meditation', difficulty: 'easy', frequency: daily, target: { amount: 5, unit: 'minutes' }, timeOfDay: 'morning', level: ['beginner', 'some'], minutes: 5 },
  { key: 'med10', name: 'Медитация 10 мин перед сном', category: 'meditation', difficulty: 'medium', frequency: daily, target: { amount: 10, unit: 'minutes' }, timeOfDay: 'evening', level: ALL, minutes: 10 },
  { key: 'med20', name: 'Медитация 20 мин', category: 'meditation', difficulty: 'hard', frequency: daily, target: { amount: 20, unit: 'minutes' }, timeOfDay: 'any', level: ['regular'], minutes: 20 },
]

export function fromTemplate(t: Template): Habit {
  return {
    id: newId(),
    name: t.name,
    category: t.category,
    difficulty: t.difficulty,
    frequency: t.frequency,
    target: t.target,
    timeOfDay: t.timeOfDay,
    archived: false,
  }
}

export interface Answers {
  focus: Category[]
  level: Level
  /** Минут в день на привычки. */
  minutesPerDay: 10 | 20 | 40
  timeOfDay: TimeOfDay
}

/**
 * Стартовый набор из 3 привычек по ответам анкеты: по одной на выбранные направления
 * (остальные места заполняются из первого направления), с учётом уровня, времени и удобной части дня.
 */
export function suggestStarter(a: Answers): Template[] {
  const focus: Category[] = a.focus.length ? a.focus : ['nutrition', 'workout', 'meditation']
  const fits = (t: Template) => t.level.includes(a.level)
  const score = (t: Template) =>
    (t.timeOfDay === a.timeOfDay ? 2 : t.timeOfDay === 'any' ? 1 : 0) - (t.difficulty === 'hard' ? 1 : 0)

  const picked: Template[] = []
  let budget = a.minutesPerDay
  const pickFrom = (cat: Category) => {
    const options = LIBRARY.filter(
      (t) => t.category === cat && fits(t) && !picked.includes(t) && t.minutes <= Math.max(budget, 3),
    ).sort((x, y) => score(y) - score(x))
    const t = options[0]
    if (t) {
      picked.push(t)
      budget -= t.minutes
    }
  }
  for (const cat of focus) if (picked.length < 3) pickFrom(cat)
  for (let i = 0; picked.length < 3 && i < 6; i++) pickFrom(focus[i % focus.length])
  // Если направлений мало и подходящих не хватило — добираем из остальных.
  for (const cat of ['nutrition', 'workout', 'meditation'] as const) if (picked.length < 3) pickFrom(cat)
  return picked
}
