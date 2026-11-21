import type { BaseCategory, Category } from './models'

/**
 * Направления привычек. Три стандартных (на них завязаны таймер и шкалы Сила/Энергия/Дзен)
 * можно переименовать и сменить значок, но не удалить. Свои — до DIRECTIONS_MAX всего.
 */
export interface Direction {
  id: Category
  name: string
  icon: string
  /** Название шкалы-потребности. */
  need: string
  /** Максимум шкалы за 7 дней. */
  needMax: number
  /** Есть ли у привычек направления кнопка ▶ (таймер). */
  timer: boolean
  base: boolean
  /** Цвет для оформления: id стандартного направления или c1…c4 для своих. */
  tone: string
  /** Своё направление удалено, но остаётся для истории (архивных привычек). */
  archived?: boolean
}

export interface CustomDirection {
  id: string
  name: string
  icon: string
  timer: boolean
  archived?: boolean
}

export interface DirectionsState {
  /** Переименование и значки стандартных направлений. */
  base: Partial<Record<BaseCategory, { name?: string; icon?: string }>>
  custom: CustomDirection[]
}

export const BASE_CATEGORIES: BaseCategory[] = ['nutrition', 'workout', 'meditation']
export const DIRECTIONS_MAX = 5
export const CUSTOM_NEED_MAX = 10
export const DIRECTION_NAME_MAX = 24

const BASE: Record<BaseCategory, Omit<Direction, 'id' | 'base' | 'tone'>> = {
  nutrition: { name: 'Питание', icon: '🥗', need: 'Энергия', needMax: 30, timer: false },
  workout: { name: 'Тренировки', icon: '💪', need: 'Сила', needMax: 10, timer: true },
  meditation: { name: 'Медитация', icon: '🧘', need: 'Дзен', needMax: 10, timer: true },
}

/** Значки на выбор (без воды — её в приложении не отслеживаем). */
export const DIRECTION_ICONS = ['🥗', '💪', '🧘', '📚', '😴', '🎨', '🎵', '🌿', '🧹', '✍️', '🗣️', '🧠', '🚶', '🌞', '❤️', '⭐'] as const

export const initialDirections = (): DirectionsState => ({ base: {}, custom: [] })

export const isBaseCategory = (c: unknown): c is BaseCategory => c === 'nutrition' || c === 'workout' || c === 'meditation'

/** Все направления: сначала стандартные, потом свои (включая удалённые — с пометкой archived). */
export function allDirections(d: DirectionsState): Direction[] {
  const base = BASE_CATEGORIES.map((id) => ({ id, base: true, tone: id as string, ...BASE[id], name: d.base[id]?.name || BASE[id].name, icon: d.base[id]?.icon || BASE[id].icon }))
  const custom = d.custom.map((c, i) => ({ tone: `c${(i % 4) + 1}`, id: c.id, name: c.name, icon: c.icon, need: c.name, needMax: CUSTOM_NEED_MAX, timer: c.timer, base: false, archived: c.archived }))
  return [...base, ...custom]
}

/** Действующие направления (для выбора в привычке, шкал и квестов). */
export const activeDirections = (d: DirectionsState) => allDirections(d).filter((x) => !x.archived)

export function directionOf(d: DirectionsState, id: Category): Direction {
  return allDirections(d).find((x) => x.id === id) ?? { id, name: 'Без направления', icon: '•', need: '', needMax: CUSTOM_NEED_MAX, timer: false, base: false, tone: 'c1', archived: true }
}

export const directionName = (d: DirectionsState, id: Category) => directionOf(d, id).name

export type DirectionError = 'empty' | 'tooLong' | 'duplicate' | 'limit' | 'notFound' | 'base' | 'hasHabits'

/** Проверка названия: не пустое, не длиннее лимита, не совпадает с другим действующим направлением. */
export function validateDirectionName(d: DirectionsState, name: string, selfId?: string): DirectionError | null {
  const n = name.trim()
  if (!n) return 'empty'
  if (n.length > DIRECTION_NAME_MAX) return 'tooLong'
  const lower = n.toLocaleLowerCase('ru')
  if (activeDirections(d).some((x) => x.id !== selfId && x.name.toLocaleLowerCase('ru') === lower)) return 'duplicate'
  return null
}

/** Класс цвета направления: cat-workout, cat-c1 … */
export const toneOf = (d: DirectionsState, id: Category) => directionOf(d, id).tone
