import type { Card, Rank, Suit } from './cards'

const RANK_SORT_ORDER: Rank[] = [
  '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'Joker',
]

const SUIT_SORT_ORDER: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades', 'joker']

export function rankSortIndex(rank: Rank): number {
  const index = RANK_SORT_ORDER.indexOf(rank)
  return index === -1 ? 999 : index
}

export function suitSortIndex(suit: Suit): number {
  const index = SUIT_SORT_ORDER.indexOf(suit)
  return index === -1 ? 999 : index
}

/** Sort by natural rank (3→4→…→A→2→Joker), then suit within rank. */
export function sortCardsByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rankDiff = rankSortIndex(a.rank) - rankSortIndex(b.rank)
    if (rankDiff !== 0) return rankDiff
    return suitSortIndex(a.suit) - suitSortIndex(b.suit)
  })
}

export function sortCardIdsByHand(cards: Card[]): string[] {
  return sortCardsByRank(cards).map((c) => c.id)
}

export function mergeHandOrder(currentOrder: string[], hand: Card[]): string[] {
  const handIds = new Set(hand.map((c) => c.id))
  const kept = currentOrder.filter((id) => handIds.has(id))
  const newIds = hand.filter((c) => !currentOrder.includes(c.id)).map((c) => c.id)
  return [...kept, ...newIds]
}

export function reorderHandOrder(order: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex) return order
  const next = [...order]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}
