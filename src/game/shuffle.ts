import type { Card } from './cards'

/** Fisher-Yates shuffle (in-place). */
export function shuffleDeck(cards: Card[]): Card[] {
  const deck = [...cards]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}
