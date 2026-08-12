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

/** Max wilds allowed in any book (dirty books). */
export const MAX_WILDS_PER_BOOK = 2

/** At most one wild may be played onto a book in a single add. */
export const MAX_WILDS_PER_ADD = 1

export function canAddToBook(
  book: Book,
  cards: Card[],
  options?: { wildAlreadyAddedThisTurn?: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (cards.length === 0) {
    return { ok: false, reason: 'Select cards to add.' }
  }

  if (cards.some(isRedThree)) {
    return { ok: false, reason: 'Red 3s cannot be part of books.' }
  }

  const wildsToAdd = countWildsInCards(cards)
  const wildsAlready = bookWildCount(book)

  if (wildsToAdd > MAX_WILDS_PER_ADD) {
    return {
      ok: false,
      reason: 'You can add only 1 wild at a time to a book.',
    }
  }

  if (wildsToAdd > 0 && options?.wildAlreadyAddedThisTurn) {
    return {
      ok: false,
      reason: 'You can add only 1 wild per turn to each book.',
    }
  }

  if (wildsAlready + wildsToAdd > MAX_WILDS_PER_BOOK) {
    return {
      ok: false,
      reason:
        wildsAlready >= MAX_WILDS_PER_BOOK
          ? 'This book already has the maximum of 2 wilds.'
          : 'A book can have at most 2 wild cards.',
    }
  }

  if (!cardsShareBookRank(cards, book.rank)) {
    return { ok: false, reason: `Cards must match the ${book.rank} book or be wild.` }
  }

  return { ok: true }
}

export type WildPlayMode = 'start' | 'stage' | 'add'

/** UI hint when the current selection breaks wild rules. */
export function getWildPlayBlockReason(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
  mode: WildPlayMode,
  booksWithWildAddedThisTurn: string[] = [],
): string | null {
  if (selectedIds.length === 0) return null

  const selected = hand.filter((c) => selectedIds.includes(c.id))
  const wildsToAdd = countWildsInCards(selected)

  if (mode === 'start' || mode === 'stage') {
    if (wildsToAdd > MAX_WILDS_PER_ADD) {
      return mode === 'stage'
        ? 'You can use only 1 wild when staging a book.'
        : 'You can use only 1 wild when starting a book.'
    }
    return null
  }

  if (wildsToAdd > MAX_WILDS_PER_ADD) {
    return 'You can add only 1 wild at a time to a book.'
  }

  const rankMatches = books.filter((book) => cardsShareBookRank(selected, book.rank))
  if (rankMatches.length === 0) return null

  if (wildsToAdd > 0) {
    const blockedByTurn = rankMatches.every((book) =>
      booksWithWildAddedThisTurn.includes(book.id),
    )
    if (blockedByTurn) {
      return 'You already added a wild to that book this turn.'
    }

    const fullWild = rankMatches.every(
      (book) => bookWildCount(book) >= MAX_WILDS_PER_BOOK,
    )
    if (fullWild) {
      return 'That book already has the maximum of 2 wilds.'
    }
  }

  return null
}

/** @deprecated Use getWildPlayBlockReason */
export function getWildSelectionBlockReason(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
): string | null {
  return getWildPlayBlockReason(hand, selectedIds, books, 'add')
}

/** All team books the selected cards can be added to. */
export function findAllBooksForSelectedCards(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
  booksWithWildAddedThisTurn: string[] = [],
): Book[] {
  if (selectedIds.length === 0 || books.length === 0) return []

  const selected = hand.filter((c) => selectedIds.includes(c.id))
  if (selected.length === 0) return []

  const wilds = selected.filter(isWildCard)
  const naturals = selected.filter((c) => !isWildCard(c) && !isRedThree(c))

  // Single wild selected — may go on any book with room (< 2 wilds).
  if (wilds.length === 1 && naturals.length === 0) {
    return books.filter(
      (book) =>
        bookWildCount(book) < MAX_WILDS_PER_BOOK &&
        canAddToBook(book, [wilds[0]], {
          wildAlreadyAddedThisTurn: booksWithWildAddedThisTurn.includes(book.id),
        }).ok,
    )
  }

  return books.filter((book) =>
    canAddToBook(book, selected, {
      wildAlreadyAddedThisTurn: booksWithWildAddedThisTurn.includes(book.id),
    }).ok,
  )
}

/** True when the player must pick a target book (e.g. a lone wild fits several books). */
export function needsAddBookPicker(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
  booksWithWildAddedThisTurn: string[] = [],
): boolean {
  return (
    findAllBooksForSelectedCards(hand, selectedIds, books, booksWithWildAddedThisTurn)
      .length > 1
  )
}

export function selectionIncludesWild(hand: Card[], selectedIds: string[]): boolean {
  return hand.some((c) => selectedIds.includes(c.id) && isWildCard(c))
}

/**
 * Prefer a natural-rank match, then an already-dirty book, then a strategic clean
 * target for wilds (complete a 6-card dirty, else the smallest incomplete clean).
 */
export function pickPreferredAddBook(
  matches: Book[],
  selected: Card[] = [],
): Book | null {
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]

  const naturals = selected.filter((c) => !isWildCard(c) && !isRedThree(c))
  if (naturals.length > 0) {
    const rank = naturals[0].rank
    const byRank = matches.find((b) => b.rank === rank)
    if (byRank) return byRank
  }

  const dirty = matches.filter((b) => !isCleanBook(b))
  if (dirty.length > 0) {
    /* Prefer completing a dirty book, else the largest dirty pile. */
    const almostDone = dirty.filter((b) => b.cards.length === 6)
    if (almostDone.length > 0) {
      return [...almostDone].sort((a, b) => b.cards.length - a.cards.length)[0]
    }
    return [...dirty].sort((a, b) => b.cards.length - a.cards.length)[0]
  }

  const wildOnly =
    selected.length > 0 &&
    selected.every((c) => isWildCard(c) || isRedThree(c))

  if (wildOnly) {
    const sixCard = matches.filter((b) => b.cards.length === 6)
    if (sixCard.length > 0) return sixCard[0]

    const incomplete = matches.filter((b) => b.cards.length < 7)
    if (incomplete.length > 0) {
      return [...incomplete].sort((a, b) => a.cards.length - b.cards.length)[0]
    }

    /* Last resort among completed cleans: dirty the smallest one. */
    return [...matches].sort((a, b) => a.cards.length - b.cards.length)[0]
  }

  return [...matches].sort((a, b) => b.cards.length - a.cards.length)[0]
}

/** Pick the team book selected cards can be added to, if any. */
export function findBookForSelectedCards(
  hand: Card[],
  selectedIds: string[],
  books: Book[],
  booksWithWildAddedThisTurn: string[] = [],
): Book | null {
  const matches = findAllBooksForSelectedCards(
    hand,
    selectedIds,
    books,
    booksWithWildAddedThisTurn,
  )
  const selected = hand.filter((c) => selectedIds.includes(c.id))
  return pickPreferredAddBook(matches, selected)
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

/** Warn before a wild dirties an existing clean book (loses the clean-book bonus). */
export function shouldWarnDirtyCleanBook(
  book: Book,
  cards: Card[],
): { bookRank: Rank } | null {
  if (!isCleanBook(book)) return null
  if (countWildsInCards(cards) === 0) return null
  return { bookRank: book.rank }
}

/** Going out requires completed books (7+ cards) — one clean and one dirty. */
export function teamHasCleanAndDirtyBooks(books: Book[]): boolean {
  const completed = books.filter((b) => b.cards.length >= 7)
  return completed.some(isCleanBook) && completed.some(isDirtyBook)
}

/**
 * True when adding these cards would dirty the team's only completed (7+) clean
 * book — destroying go-out eligibility that already required that clean book.
 */
export function wouldDestroyOnlyCompletedCleanBook(
  book: Book,
  cards: Card[],
  teamBooks: Book[],
): boolean {
  if (!isCleanBook(book)) return false
  if (countWildsInCards(cards) === 0) return false
  /* Incomplete clean piles are not yet the go-out clean book. */
  if (book.cards.length < 7) return false
  return !teamBooks.some(
    (b) => b.id !== book.id && b.cards.length >= 7 && isCleanBook(b),
  )
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
