import type { Card, Rank } from './cards'
import { isRedThree, isWildCard } from './cards'

export interface Book {
  id: string
  rank: Rank
  cards: Card[]
  teamId: number
  /** Seat index of the player who started this book (books appear in front of them). */
  startedBySeatIndex: number
}

export function bookWildCount(book: Book): number {
  return book.cards.filter(isWildCard).length
}

export function isCleanBook(book: Book): boolean {
  return bookWildCount(book) === 0
}

export function isDirtyBook(book: Book): boolean {
  return bookWildCount(book) > 0
}

export function naturalRank(card: Card): Rank | null {
  if (isWildCard(card) || isRedThree(card)) return null
  return card.rank
}

export function cardsShareBookRank(cards: Card[], rank: Rank): boolean {
  return cards.every((card) => {
    if (isRedThree(card)) return false
    if (isWildCard(card)) return true
    return card.rank === rank
  })
}

export function countWildsInCards(cards: Card[]): number {
  return cards.filter(isWildCard).length
}

export function canStartBook(
  cards: Card[],
  teamBooks: Book[],
): { ok: true; rank: Rank } | { ok: false; reason: string } {
  if (cards.length < 3) {
    return { ok: false, reason: 'Need at least 3 cards to start a book.' }
  }

  if (cards.some(isRedThree)) {
    return { ok: false, reason: 'Red 3s cannot be part of books.' }
  }

  const wildCount = countWildsInCards(cards)
  if (wildCount > 1) {
    return { ok: false, reason: 'You can use at most 1 wild when starting a book.' }
  }

  const naturals = cards.filter((c) => !isWildCard(c))
  if (naturals.length === 0) {
    return { ok: false, reason: 'A book needs natural cards, not only wilds.' }
  }

  const rank = naturals[0].rank
  if (!cardsShareBookRank(cards, rank)) {
    return { ok: false, reason: 'All natural cards must share the same rank.' }
  }

  if (teamBooks.some((book) => book.rank === rank)) {
    return { ok: false, reason: `Your team already has a ${rank} book.` }
  }

  return { ok: true, rank }
}

export function canAddToBook(
  book: Book,
  cards: Card[],
): { ok: true } | { ok: false; reason: string } {
  if (cards.length === 0) {
    return { ok: false, reason: 'Select cards to add.' }
  }

  if (cards.some(isRedThree)) {
    return { ok: false, reason: 'Red 3s cannot be part of books.' }
  }

  const wildsToAdd = countWildsInCards(cards)
  if (wildsToAdd > 1) {
    return { ok: false, reason: 'You cannot add more than 1 wild at a time.' }
  }

  if (bookWildCount(book) + wildsToAdd > 2) {
    return { ok: false, reason: 'A book can have at most 2 wild cards.' }
  }

  if (!cardsShareBookRank(cards, book.rank)) {
    return { ok: false, reason: `Cards must match the ${book.rank} book or be wild.` }
  }

  return { ok: true }
}

/** Going out requires completed books (7+ cards) — one clean and one dirty. */
export function teamHasCleanAndDirtyBooks(books: Book[]): boolean {
  const completed = books.filter((b) => b.cards.length >= 7)
  return completed.some(isCleanBook) && completed.some(isDirtyBook)
}
