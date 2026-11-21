/** Уникальный id. crypto.randomUUID есть только на https/localhost и в Safari 15.4+, поэтому есть запасной вариант. */
export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* запасной вариант ниже */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}
