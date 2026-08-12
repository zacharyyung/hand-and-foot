/**
 * Regression checks for strategic wild placement on clean books.
 * Run with: npx tsx scripts/check-wild-book-strategy.ts
 */
import { pickPreferredAddBook, type Book } from '../src/game/books'
import { findAddToBookActions } from '../src/game/ai/decisions'
import {
  pickBestAddToBook,
  scoreWildOnCleanTarget,
} from '../src/game/ai/strategy'
import type { AiPublicState } from '../src/game/ai/publicState'
import type { Card } from '../src/game/cards'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const card = (id: string, rank: Card['rank'], suit: Card['suit'] = 'hearts'): Card => ({
  id,
  rank,
  suit,
  deckIndex: 0,
})

function cleanBook(id: string, rank: Card['rank'], n: number): Book {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  return {
    id,
    rank,
    teamId: 0,
    startedBySeatIndex: 2,
    cards: Array.from({ length: n }, (_, i) => card(`${id}-${i}`, rank, suits[i % 4])),
  }
}

function dirtyBook(id: string, rank: Card['rank'], n: number): Book {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  const naturals = Math.max(0, n - 1)
  return {
    id,
    rank,
    teamId: 0,
    startedBySeatIndex: 2,
    cards: [
      ...Array.from({ length: naturals }, (_, i) =>
        card(`${id}-n${i}`, rank, suits[i % 4]),
      ),
      card(`${id}-w`, '2', 'clubs'),
    ],
  }
}

const wild = card('joker1', 'Joker', 'joker')

/* --- pickPreferredAddBook: wilds prefer 6-card complete, else smallest clean --- */
const smallClean = cleanBook('small', 'Q', 3)
const bigClean = cleanBook('big', 'K', 8)
const sixClean = cleanBook('six', 'A', 6)

assert(
  pickPreferredAddBook([bigClean, smallClean], [wild])?.id === 'small',
  'lone wild prefers smallest clean book, not the largest',
)
assert(
  pickPreferredAddBook([bigClean, sixClean, smallClean], [wild])?.id === 'six',
  'lone wild prefers completing a 6-card clean into dirty',
)
assert(
  pickPreferredAddBook([bigClean, dirtyBook('d', '10', 5)], [wild])?.id === 'd',
  'lone wild still prefers an already-dirty book over any clean',
)

/* --- scoreWildOnCleanTarget priorities --- */
const booksForScore = [cleanBook('keep', 'Q', 7), sixClean, smallClean, bigClean]
const goOutScore = scoreWildOnCleanTarget(sixClean, [wild], booksForScore, {
  urgency: 'medium',
  canTeamGoOut: false,
  nearGoOut: true,
})
const dumpSmall = scoreWildOnCleanTarget(smallClean, [wild], booksForScore, {
  urgency: 'high',
  canTeamGoOut: true,
  nearGoOut: false,
})
const dumpBigCompleted = scoreWildOnCleanTarget(bigClean, [wild], booksForScore, {
  urgency: 'high',
  canTeamGoOut: true,
  nearGoOut: false,
})
assert(goOutScore > dumpSmall, 'completing 6-card dirty for go-out scores above dumping small')
assert(dumpSmall > dumpBigCompleted, 'dumping on small incomplete beats dirtying a big completed clean')

/* --- pickBestAddToBook chooses strategically among justified cleans --- */
function stubPub(hand: Card[], books: Book[], overrides: Partial<AiPublicState> = {}): AiPublicState {
  return {
    mySeatIndex: 2,
    myTeamId: 0,
    myHand: hand,
    myFootCount: 0,
    isPlayingFoot: true,
    footOnHold: false,
    stockCount: 40,
    discardTop: card('disc', '3', 'spades'),
    discardCount: 1,
    myTeamBooks: books,
    allTableBooks: books,
    teamScore: 1200,
    teamMeldThresholdMet: true,
    meldPointsThisTurn: 0,
    requiredMeld: 100,
    otherPlayers: [
      {
        seatIndex: 0,
        name: 'You',
        teamId: 0,
        handCount: 8,
        footCount: 0,
        isPlayingFoot: true,
      },
      {
        seatIndex: 1,
        name: 'Opp1',
        teamId: 1,
        handCount: 12,
        footCount: 10,
        isPlayingFoot: false,
      },
      {
        seatIndex: 3,
        name: 'Opp2',
        teamId: 1,
        handCount: 12,
        footCount: 10,
        isPlayingFoot: false,
      },
    ],
    turnPhase: 'play',
    ...overrides,
  }
}

const keepClean = cleanBook('keepClean', 'Q', 7)
const almostDirty = cleanBook('almost', 'K', 6)
const tinyClean = cleanBook('tiny', 'J', 3)
const hugeClean = cleanBook('huge', 'A', 9)

/* Going out path: need dirty — prefer completing the 6-card book. */
const goOutBooks = [keepClean, almostDirty, tinyClean, hugeClean]
const goOutHand = [wild, card('disc4', '4')]
const goOutPub = stubPub(goOutHand, goOutBooks, {
  stockCount: 30,
  otherPlayers: [
    {
      seatIndex: 0,
      name: 'You',
      teamId: 0,
      handCount: 2,
      footCount: 0,
      isPlayingFoot: true,
    },
    {
      seatIndex: 1,
      name: 'Opp1',
      teamId: 1,
      handCount: 4,
      footCount: 0,
      isPlayingFoot: true,
    },
    {
      seatIndex: 3,
      name: 'Opp2',
      teamId: 1,
      handCount: 5,
      footCount: 0,
      isPlayingFoot: true,
    },
  ],
})
const goOutActions = findAddToBookActions(goOutHand, goOutBooks, true, [], true).filter(
  (a) => a.cardIds.includes(wild.id),
)
const goOutPick = pickBestAddToBook(goOutActions, goOutPub, [], 'expert')
assert(goOutPick != null, 'go-out wild pick finds a target')
assert(
  goOutPick!.bookId === 'almost',
  `go-out wild should complete 6-card book, got ${goOutPick!.bookId}`,
)

/* Prefer already-dirty books over any clean when dumping wilds. */
const dumpBooks = [keepClean, tinyClean, hugeClean, dirtyBook('haveDirty', '10', 7)]
const dumpHand = [wild, card('d5', '5')]
const dumpPub = stubPub(dumpHand, dumpBooks, {
  stockCount: 12,
  myHand: dumpHand,
  otherPlayers: [
    {
      seatIndex: 0,
      name: 'You',
      teamId: 0,
      handCount: 1,
      footCount: 0,
      isPlayingFoot: true,
    },
    {
      seatIndex: 1,
      name: 'Opp1',
      teamId: 1,
      handCount: 3,
      footCount: 0,
      isPlayingFoot: true,
    },
    {
      seatIndex: 3,
      name: 'Opp2',
      teamId: 1,
      handCount: 2,
      footCount: 0,
      isPlayingFoot: true,
    },
  ],
})
const dumpActions = findAddToBookActions(dumpHand, dumpBooks, true, [], true).filter(
  (a) => a.cardIds.includes(wild.id),
)
const dumpPick = pickBestAddToBook(dumpActions, dumpPub, [], 'expert')
assert(dumpPick != null, 'dump wild pick finds a target')
assert(
  dumpPick!.bookId === 'haveDirty',
  `dump wild should prefer existing dirty book, got ${dumpPick!.bookId}`,
)

/* Among cleans only: dump onto the smallest incomplete, not a big completed clean. */
const cleanOnlyBooks = [keepClean, tinyClean, hugeClean]
const cleanOnlyHand = [wild, card('d5', '5'), card('d6', '6'), card('d4', '4')]
const cleanOnlyPub = stubPub(cleanOnlyHand, cleanOnlyBooks, {
  stockCount: 12,
  myHand: cleanOnlyHand,
  otherPlayers: dumpPub.otherPlayers,
})
const cleanOnlyActions = findAddToBookActions(
  cleanOnlyHand,
  cleanOnlyBooks,
  true,
  [],
  true,
).filter((a) => a.cardIds.includes(wild.id))
const cleanOnlyPick = pickBestAddToBook(cleanOnlyActions, cleanOnlyPub, [], 'expert')
assert(cleanOnlyPick != null, 'clean-only dump finds a target')
assert(
  cleanOnlyPick!.bookId === 'tiny',
  `clean-only dump should hit smallest incomplete, got ${cleanOnlyPick!.bookId}`,
)
assert(cleanOnlyPick!.bookId !== 'huge', 'must not prefer largest completed clean')
assert(cleanOnlyPick!.bookId !== 'keepClean', 'must not prefer completed clean over tiny')

/* findAddToBookActions priority: 6-card wild complete > small dump > big completed. */
const priActions = findAddToBookActions(
  [wild, card('x4', '4'), card('x5', '5')],
  [hugeClean, tinyClean, almostDirty, keepClean],
  true,
  [],
  true,
).filter((a) => a.cardIds.includes(wild.id))
const byBook = (id: string) => priActions.find((a) => a.bookId === id)?.priority ?? -9999
assert(
  byBook('almost') > byBook('tiny'),
  'priority: completing 6-card beats dumping on tiny',
)
assert(
  byBook('tiny') > byBook('huge'),
  'priority: tiny incomplete beats huge completed clean',
)

console.log('check-wild-book-strategy: all assertions passed')
