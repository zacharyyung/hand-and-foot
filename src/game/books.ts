import type { Card, Rank } from './cards'
import { cardLabel, isRedThree, isWildCard } from './cards'

const BOOK_RANK_ORDER: Rank[] = [
  '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'Joker',
]

function rankSortIndex(rank: Rank): number {
  const index = BOOK_RANK_ORDER.indexOf(rank)
  return index === -1 ? BOOK_RANK_ORDER.length : index
}

/** Sort books left-to-right by rank (3 → A, then 2s, then jokers). */
export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const rankDiff = rankSortIndex(a.rank) - rankSortIndex(b.rank)
    if (rankDiff !== 0) return rankDiff

    const aComplete = a.cards.length >= 7
    const bComplete = b.cards.length >= 7
    if (aComplete !== bComplete) return aComplete ? -1 : 1

    return b.cards.length - a.cards.length
  })
}

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

/** Fan order for display: wilds sit behind naturals so the book rank stays visible. */
export function cardsForBookFan(cards: Card[]): Card[] {
  const wilds: Card[] = []
  const naturals: Card[] = []
  for (const card of cards) {
    if (isWildCard(card)) wilds.push(card)
    else naturals.push(card)
  }
  return [...wilds, ...naturals]
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

/** All team books the selected cards can be added to. */
export function findAllBooksForSelectedCards(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
): Book[] {
  if (selectedIds.length === 0 || books.length === 0) return []

  const selected = hand.filter((c) => selectedIds.includes(c.id))
  if (selected.length === 0) return []

  return books.filter((book) => canAddToBook(book, selected).ok)
}

export function selectionIncludesWild(hand: Card[], selectedIds: string[]): boolean {
  return hand.some((c) => selectedIds.includes(c.id) && isWildCard(c))
}

/** Pick the team book selected cards can be added to, if any. */
export function findBookForSelectedCards(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
): Book | null {
  const matches = findAllBooksForSelectedCards(hand, selectedIds, books)
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]

  const selected = hand.filter((c) => selectedIds.includes(c.id))
  const naturals = selected.filter((c) => !isWildCard(c) && !isRedThree(c))
  if (naturals.length > 0) {
    const rank = naturals[0].rank
    const byRank = matches.find((b) => b.rank === rank)
    if (byRank) return byRank
  }

  const dirty = matches.filter((b) => !isCleanBook(b))
  if (dirty.length > 0) {
    return [...dirty].sort((a, b) => b.cards.length - a.cards.length)[0]
  }

  return [...matches].sort((a, b) => b.cards.length - a.cards.length)[0]
}

/** Whether discarding this card should prompt — it legally fits a team book. */
export function shouldWarnDiscardToBook(
  hand: Card[],
  cardId: string,
  books: Book[],
): { cardName: string; bookRank: Rank } | null {
  if (books.length === 0) return null

  const card = hand.find((c) => c.id === cardId)
  if (!card || isRedThree(card)) return null

  const book = findBookForSelectedCards(hand, [cardId], books)
  if (!book) return null

  return { cardName: cardLabel(card), bookRank: book.rank }
}

/** Going out requires completed books (7+ cards) — one clean and one dirty. */
export function teamHasCleanAndDirtyBooks(books: Book[]): boolean {
  const completed = books.filter((b) => b.cards.length >= 7)
  return completed.some(isCleanBook) && completed.some(isDirtyBook)
}

export function getGoOutBlockReason(
  books: Book[],
  meldThresholdMet: boolean,
): string | null {
  if (!meldThresholdMet) {
    return 'Your team must meet the meld threshold before going out.'
  }
  if (!teamHasCleanAndDirtyBooks(books)) {
    return 'Need 1 clean and 1 dirty completed book (7+) to go out.'
  }
  return null
}
