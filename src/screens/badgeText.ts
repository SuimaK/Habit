import { BADGES } from '../core'

export function badgeTitles(ids: string[]): string {
  return ids.map((id) => `«${BADGES.find((b) => b.id === id)?.title ?? id}»`).join(', ')
}
