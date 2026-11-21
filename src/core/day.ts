/**
 * Календарный день без времени в формате "YYYY-MM-DD" (по местному времени устройства).
 * Строки такого вида сравниваются обычным < и >.
 */
export type Day = string

const pad = (n: number) => String(n).padStart(2, '0')

export function dayOf(date: Date): Day {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Полдень дня — безопасная точка для арифметики (без проблем с переходом на летнее время). */
export function noonOf(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(day: Day, n: number): Day {
  const date = noonOf(day)
  date.setDate(date.getDate() + n)
  return dayOf(date)
}

/** День недели: 1 = понедельник … 7 = воскресенье. */
export function weekday(day: Day): number {
  const w = noonOf(day).getDay() // 0 = воскресенье
  return w === 0 ? 7 : w
}

/** Понедельник недели дня. Неделя всегда начинается с понедельника. */
export function weekStart(day: Day): Day {
  return addDays(day, -(weekday(day) - 1))
}

/** Количество дней от a до b (b − a). */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((noonOf(b).getTime() - noonOf(a).getTime()) / 86_400_000)
}
