import type { Card } from './cards'
import { isRedThree } from './cards'
import type { Book } from './books'
import { bookWildCount } from './books'

export function cardPointValue(card: Card): number {
  if (isRedThree(card)) return -300
  if (card.rank === 'Joker') return 50
  if (card.rank === '2') return 20
  if (card.rank === 'A') return 20
  if (card.rank === '10' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10
  return 5
}

export function meldThreshold(teamScore: number): number {
  if (teamScore <= 999) return 50
  if (teamScore <= 1499) return 100
  if (teamScore <= 1999) return 150
  return 200
}

export function sumCardPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardPointValue(card), 0)
}

/** Points lost for cards still in hand or foot at round end. */
export function heldCardPenalty(cards: Card[]): number {
  return cards.reduce((sum, card) => {
    if (isRedThree(card)) return sum + 300
    return sum + cardPointValue(card)
  }, 0)
}

export function bookBonus(book: Book): number {
  if (book.cards.length < 7) return 0
  return bookWildCount(book) > 0 ? 100 : 300
}

export const WINNING_SCORE = 5000
export const GOING_OUT_BONUS = 100
