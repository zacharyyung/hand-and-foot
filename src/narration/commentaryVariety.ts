const recentByCategory = new Map<string, string[]>()
const MAX_RECENT = 5

/** Pick a line at random, avoiding the last few used for this category. */
export function pickVaried(category: string, items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!

  const recent = recentByCategory.get(category) ?? []
  const fresh = items.filter((item) => !recent.includes(item))
  const pool = fresh.length > 0 ? fresh : items
  const choice = pool[Math.floor(Math.random() * pool.length)]!

  recentByCategory.set(category, [choice, ...recent.filter((line) => line !== choice)].slice(0, MAX_RECENT))
  return choice
}

export function resetCommentaryVariety(): void {
  recentByCategory.clear()
}
