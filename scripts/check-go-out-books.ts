/**
 * Regression checks for clean/dirty go-out display logic.
 * Run with: npx tsx scripts/check-go-out-books.ts
 */
import {
  findAllBooksForSelectedCards,
  pickPreferredAddBook,
  teamHasCleanAndDirtyBooks,
  type Book,
} from '../src/game/books'
import {
  checkFootMeld,
  FOOT_MELD_DIRTIES_ONLY_CLEAN_ERROR,
  FOOT_MELD_INELIGIBLE_GO_OUT_ERROR,
} from '../src/game/actions'
import type { Card } from '../src/game/cards'
import type { PlayerState } from '../src/game/deal'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const card = (id: string, rank: Card['rank'], suit: Card['suit'] = 'hearts'): Card => ({
  id,
  rank,
  suit,
  deckIndex: 0,
})

const cleanBook: Book = {
  id: 'c1',
  rank: 'A',
  teamId: 0,
  startedBySeatIndex: 0,
  cards: [
    card('a1', 'A'),
    card('a2', 'A', 'diamonds'),
    card('a3', 'A', 'clubs'),
    card('a4', 'A', 'spades'),
    card('a5', 'A'),
    card('a6', 'A', 'diamonds'),
    card('a7', 'A', 'clubs'),
  ],
}

const dirtyBook: Book = {
  id: 'd1',
  rank: 'K',
  teamId: 0,
  startedBySeatIndex: 0,
  cards: [
    card('k1', 'K'),
    card('k2', 'K', 'diamonds'),
    card('k3', 'K', 'clubs'),
    card('k4', 'K', 'spades'),
    card('k5', 'K'),
    card('k6', 'K', 'diamonds'),
    card('w1', '2', 'clubs'),
  ],
}

const books = [cleanBook, dirtyBook]
assert(teamHasCleanAndDirtyBooks(books), 'team already has clean + dirty completed books')

const wild = card('j1', 'Joker', 'joker')
const discard = card('q1', 'Q')
const hand = [wild, discard]
const player = {
  hand,
  isPlayingFoot: true,
  foot: [],
  footOnHold: false,
} as unknown as PlayerState

const options = findAllBooksForSelectedCards(hand, [wild.id], books)
assert(options[0]?.id === cleanBook.id, 'options keep table order (clean first)')
const preferred = pickPreferredAddBook(options, [wild])
assert(preferred?.id === dirtyBook.id, 'picker preference chooses dirty book for lone wild')

const dirtyTarget = books.map((b) =>
  b.id === dirtyBook.id ? { ...b, cards: [...b.cards, wild] } : b,
)
const dirtyOk = checkFootMeld(player, [wild.id], dirtyTarget, true, {
  booksBeforeMeld: books,
  meldThresholdMetBeforeMeld: true,
})
assert(dirtyOk.ok, 'adding wild to dirty book while leaving one card is allowed')

const cleanTarget = books.map((b) =>
  b.id === cleanBook.id ? { ...b, cards: [...b.cards, wild] } : b,
)
const cleanBlocked = checkFootMeld(player, [wild.id], cleanTarget, true, {
  booksBeforeMeld: books,
  meldThresholdMetBeforeMeld: true,
})
assert(!cleanBlocked.ok, 'dirtying only clean book while leaving one card is blocked')
assert(
  cleanBlocked.ok === false && cleanBlocked.error === FOOT_MELD_DIRTIES_ONLY_CLEAN_ERROR,
  'shows specific dirty-only-clean message instead of generic missing-books warning',
)

const incompleteDirty: Book = {
  ...dirtyBook,
  cards: dirtyBook.cards.slice(0, 5),
}
const missingBooks = [cleanBook, incompleteDirty]
const missingBlocked = checkFootMeld(
  player,
  [wild.id],
  missingBooks.map((b) =>
    b.id === incompleteDirty.id ? { ...b, cards: [...b.cards, wild] } : b,
  ),
  true,
  {
    booksBeforeMeld: missingBooks,
    meldThresholdMetBeforeMeld: true,
  },
)
assert(!missingBlocked.ok, 'still blocked when dirty book is not completed')
assert(
  missingBlocked.ok === false &&
    missingBlocked.error === FOOT_MELD_INELIGIBLE_GO_OUT_ERROR,
  'keeps generic message when books were never go-out ready',
)

console.log('check-go-out-books: all assertions passed')
