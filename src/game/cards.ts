export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker'

export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'
  | 'Joker'

export interface Card {
  id: string
  rank: Rank
  suit: Suit
  deckIndex: number
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
]

export const CARDS_PER_HAND = 11
export const CARDS_PER_FOOT = 11

export function isRedCard(card: Card): boolean {
  return card.suit === 'hearts' || card.suit === 'diamonds'
}

export function isWildCard(card: Card): boolean {
  return card.rank === '2' || card.rank === 'Joker'
}

export function isRedThree(card: Card): boolean {
  return card.rank === '3' && isRedCard(card)
}

/**
 * Natural cards that select together on long-press.
 * Red threes are their own class — never grouped with black threes.
 */
export function sameNaturalSelectClass(a: Card, b: Card): boolean {
  if (isWildCard(a) || isWildCard(b)) return false
  if (a.rank !== b.rank) return false
  if (a.rank === '3') return isRedThree(a) === isRedThree(b)
  return true
}

export function cardLabel(card: Card): string {
  if (card.rank === 'Joker') return '🃏'
  const suitSymbol: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
    joker: '🃏',
  }
  return `${card.rank}${suitSymbol[card.suit]}`
}

/** Build combined decks: one standard deck (+ 2 jokers) per player. */
export function createDecks(playerCount: number): Card[] {
  const cards: Card[] = []

  for (let deck = 0; deck < playerCount; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `d${deck}-${rank}-${suit}`,
          rank,
          suit,
          deckIndex: deck,
        })
      }
    }
    cards.push({
      id: `d${deck}-joker-1`,
      rank: 'Joker',
      suit: 'joker',
      deckIndex: deck,
    })
    cards.push({
      id: `d${deck}-joker-2`,
      rank: 'Joker',
      suit: 'joker',
      deckIndex: deck,
    })
  }

  return cards
}
