/**
 * Regression checks for clean/dirty go-out display logic.
 * Run with: npx tsx scripts/check-go-out-books.ts
 */
import {
  findAllBooksForSelectedCards,
  pickPreferredAddBook,
  teamHasCleanAndDirtyBooks,
  wouldDestroyOnlyCompletedCleanBook,
  type Book,
} from '../src/game/books'
import {
  checkFootMeld,
  FOOT_MELD_DIRTIES_ONLY_CLEAN_ERROR,
  FOOT_MELD_INELIGIBLE_GO_OUT_ERROR,
} from '../src/game/actions'
import { justifyDirtyingCleanBook } from '../src/game/ai/strategy'
import { buildAiPublicState } from '../src/game/ai/publicState'
import { runAiTurn } from '../src/game/ai/runTurn'
import {
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  createReadyGoOutSignal,
  createWildApproveSignal,
  PROACTIVE_GO_OUT_APPROVE_TEXT,
  shouldAiAttemptGoOut,
} from '../src/game/chat'
import type { Card } from '../src/game/cards'
import type { GameState, PlayerState } from '../src/game/deal'

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

/* --- Only completed clean book must stay clean for go-out --- */
assert(
  wouldDestroyOnlyCompletedCleanBook(cleanBook, [wild], books),
  'wild on sole completed clean book destroys go-out clean',
)
assert(
  !wouldDestroyOnlyCompletedCleanBook(
    { ...cleanBook, cards: cleanBook.cards.slice(0, 6) },
    [wild],
    books,
  ),
  'incomplete clean is not yet the go-out clean book',
)

const secondClean: Book = {
  id: 'c2',
  rank: 'Q',
  teamId: 0,
  startedBySeatIndex: 0,
  cards: [
    card('q1', 'Q'),
    card('q2', 'Q', 'diamonds'),
    card('q3', 'Q', 'clubs'),
    card('q4', 'Q', 'spades'),
    card('q5', 'Q'),
    card('q6', 'Q', 'diamonds'),
    card('q7', 'Q', 'clubs'),
  ],
}
assert(
  !wouldDestroyOnlyCompletedCleanBook(cleanBook, [wild], [
    cleanBook,
    secondClean,
    dirtyBook,
  ]),
  'second completed clean allows dirtying one clean',
)

function goOutPlayers(aiHand: Card[]): PlayerState[] {
  return [
    {
      profile: { seatIndex: 0, name: 'You', avatar: 'Y', isHuman: true, teamId: 0 },
      hand: [card('h1', 'J')],
      foot: [],
      isPlayingFoot: true,
      footOnHold: false,
    } as PlayerState,
    {
      profile: {
        seatIndex: 1,
        name: 'O1',
        avatar: 'O',
        isHuman: false,
        teamId: 1,
        aiDifficulty: 'expert',
      },
      hand: [card('o11', '6'), card('o12', '6', 'diamonds')],
      foot: [],
      isPlayingFoot: true,
      footOnHold: false,
    } as PlayerState,
    {
      profile: {
        seatIndex: 2,
        name: 'AI',
        avatar: 'A',
        isHuman: false,
        teamId: 0,
        aiDifficulty: 'expert',
      },
      hand: aiHand,
      foot: [],
      isPlayingFoot: true,
      footOnHold: false,
    } as PlayerState,
    {
      profile: {
        seatIndex: 3,
        name: 'O2',
        avatar: 'O',
        isHuman: false,
        teamId: 1,
        aiDifficulty: 'expert',
      },
      hand: [card('o21', '8'), card('o22', '8', 'diamonds')],
      foot: [],
      isPlayingFoot: true,
      footOnHold: false,
    } as PlayerState,
  ]
}

function goOutState(aiHand: Card[], teamBooks: Book[]): GameState {
  return {
    phase: 'playing',
    roundNumber: 4,
    playerCount: 4,
    currentPlayerIndex: 2,
    turnPhase: 'play',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
    wentOutTeamId: null,
    stock: [card('s1', '4'), card('s2', '5')],
    discard: [card('xd', '3', 'spades')],
    teams: [
      { id: 0, score: 2500, books: teamBooks, meldThresholdMet: true },
      { id: 1, score: 2400, books: [], meldThresholdMet: true },
    ],
    players: goOutPlayers(aiHand),
    roundScores: null,
    winnerTeamId: null,
    roundStarterIndex: 0,
  } as GameState
}

const dirtyFull: Book = {
  id: 'd-full',
  rank: 'K',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('kf1', 'K'),
    card('kf2', 'K', 'diamonds'),
    card('kf3', 'K', 'clubs'),
    card('kf4', 'K', 'spades'),
    card('kf5', 'K'),
    card('wf1', '2', 'clubs'),
    card('wf2', 'Joker', 'joker'),
  ],
}

const soleCleanState = goOutState(
  [wild, card('d1', '4'), card('e1', '5')],
  [cleanBook, dirtyFull],
)
const solePub = buildAiPublicState(soleCleanState, 2)
const priorAsk = createReadyGoOutSignal(2, 'AI', 'A')
const priorYes = {
  ...createApproveGoOutSignal(0, 'You', 'Y'),
  timestamp: priorAsk.timestamp + 1,
}
assert(
  !justifyDirtyingCleanBook(
    cleanBook,
    [wild],
    solePub,
    [],
    [priorAsk, priorYes],
    soleCleanState,
  ),
  'AI must not dirty sole completed clean even with go-out urgency/approval',
)

const soleAskTurn = runAiTurn(soleCleanState, [priorAsk, priorYes])
assert(
  soleAskTurn.chatMessage?.type !== 'wild_request',
  'AI must not ask to wild the only completed clean book',
)
assert(
  soleAskTurn.state.teams[0].books.every(
    (b) => b.id !== cleanBook.id || b.cards.every((c) => c.id !== wild.id),
  ),
  'sole completed clean stays clean during AI turn',
)
assert(
  teamHasCleanAndDirtyBooks(soleAskTurn.state.teams[0].books),
  'go-out books still intact after AI turn that held a wild',
)

/* Dirtied-only-clean + last card: no go-out ask, no round end, turn passes */
const alreadyDirtied: Book = {
  ...cleanBook,
  cards: [...cleanBook.cards, card('jx', 'Joker', 'joker')],
}
const stuck = goOutState([card('last', '4')], [alreadyDirtied, dirtyBook])
assert(!teamHasCleanAndDirtyBooks(stuck.teams[0].books), 'fixture has no clean book')
assert(
  !shouldAiAttemptGoOut(stuck, 2, [priorAsk, priorYes]),
  'stale Yes cannot force go-out',
)
const stuckTurn = runAiTurn(stuck, [priorAsk, priorYes])
assert(stuckTurn.chatMessage?.type !== 'ready_go_out', 'no go-out ask without clean book')
assert(stuckTurn.state.phase !== 'roundEnd', 'cannot go out without clean+dirty books')
assert(stuckTurn.state.wentOutTeamId == null, 'wentOutTeamId stays null')
assert(
  stuckTurn.state.currentPlayerIndex !== 2,
  'AI passes instead of soft-locking on last foot card',
)

/* Last card alone: hold without asking; proactive clearance goes out. */
const oneCard = goOutState([card('last1', '4')], [cleanBook, dirtyBook])
const oneCardTurn = runAiTurn(oneCard, [])
assert(
  oneCardTurn.chatMessage?.type !== 'ready_go_out',
  'does not ask on last card alone',
)
assert(oneCardTurn.awaitingPartner !== true, 'no pause on last card alone')
assert(oneCardTurn.state.phase === 'playing', 'does not go out without partner clearance')
assert(
  oneCardTurn.state.players[2].hand.length === 1,
  'holds the last foot card without asking',
)
assert(oneCardTurn.state.currentPlayerIndex !== 2, 'passes turn on last card alone')
const proactiveOneCard = {
  ...createApproveGoOutSignal(0, 'You', 'Y', PROACTIVE_GO_OUT_APPROVE_TEXT),
  timestamp: 1,
}
const oneCardDone = runAiTurn(oneCard, [proactiveOneCard])
assert(oneCardDone.state.phase === 'roundEnd', 'proactive clearance goes out on last card')
assert(oneCardDone.state.wentOutTeamId === 0, 'correct team after proactive last-card go-out')

/* With 2 unmeldable cards, do not ask yet — discard one and pass (ask next opportunity). */
const ready = goOutState(
  [card('keep1', '4'), card('keep2', '5', 'diamonds')],
  [cleanBook, dirtyBook],
)
const readyAsk = runAiTurn(ready, [])
assert(
  readyAsk.chatMessage?.type !== 'ready_go_out',
  'does not ask early with 2 unmeldable cards',
)
assert(readyAsk.state.wentOutTeamId == null, 'does not go out with 2 unmeldable cards')
assert(
  readyAsk.state.players[2].hand.length === 1,
  'discards one unmeldable card and keeps the other',
)

/* Meldable extras: ask while 2+ cards remain, then Yes goes out */
const meldable = goOutState(
  [card('keepQ1', 'A'), card('keepQ2', '4')],
  [cleanBook, dirtyBook],
)
const meldableAsk = runAiTurn(meldable, [])
assert(
  meldableAsk.chatMessage?.type === 'ready_go_out',
  'asks while go-out is reachable and 2+ cards remain',
)
assert(
  meldableAsk.state.players[2].hand.length === 2,
  'asks before melding down to the last card',
)
assert(meldableAsk.awaitingPartner === true, 'pauses for Yes/No before meltdown')

/* After Yes on a prior ask while already on last card, AI goes out */
const lastCardCleared = goOutState([card('last2', '4')], [cleanBook, dirtyBook])
const priorAskTwo = createReadyGoOutSignal(2, 'AI', 'A')
const priorYesTwo = {
  ...createApproveGoOutSignal(0, 'You', 'Y'),
  timestamp: priorAskTwo.timestamp + 1,
}
const readyDone = runAiTurn(lastCardCleared, [priorAskTwo, priorYesTwo])
assert(readyDone.state.phase === 'roundEnd', 'goes out with clean+dirty after Yes')
assert(readyDone.state.wentOutTeamId === 0, 'correct team went out')

/* Mid-turn Yes after last-card ask must go out. */
const yesAfterAsk = {
  ...createApproveGoOutSignal(0, 'You', 'Y'),
  timestamp: (meldableAsk.chatMessage?.timestamp ?? 0) + 1,
}
const afterYes = runAiTurn(meldableAsk.state, [meldableAsk.chatMessage!, yesAfterAsk])
assert(afterYes.state.phase === 'roundEnd', 'Yes after last-card ask goes out')
assert(afterYes.state.wentOutTeamId === 0, 'correct team went out after Yes')

/* Start-book path: 3 naturals + discard with no open book of that rank. */
const startBookHand = [
  card('q1', 'Q'),
  card('q2', 'Q', 'diamonds'),
  card('q3', 'Q', 'clubs'),
  card('qd', '4'),
]
const startBookAsk = runAiTurn(goOutState(startBookHand, [cleanBook, dirtyBook]), [])
assert(
  startBookAsk.chatMessage?.type === 'ready_go_out',
  'asks when go-out path is start-book then discard',
)
assert(startBookAsk.awaitingPartner === true, 'start-book go-out ask pauses')
assert(
  startBookAsk.state.players[2].hand.length === 4,
  'asks before melding down on the start-book path',
)
const startBookYes = {
  ...createApproveGoOutSignal(0, 'You', 'Y'),
  timestamp: (startBookAsk.chatMessage?.timestamp ?? 0) + 1,
}
const startBookDone = runAiTurn(startBookAsk.state, [
  startBookAsk.chatMessage!,
  startBookYes,
])
assert(startBookDone.state.phase === 'roundEnd', 'Yes after start-book ask goes out')
assert(startBookDone.state.wentOutTeamId === 0, 'correct team after start-book Yes')

/* Multi-card natural meltdown: A A K + discard. */
const multiNat = goOutState(
  [
    card('ma1', 'A'),
    card('ma2', 'A', 'diamonds'),
    card('mk1', 'K'),
    card('md1', '4'),
  ],
  [cleanBook, dirtyBook],
)
const multiAsk = runAiTurn(multiNat, [])
assert(multiAsk.chatMessage?.type === 'ready_go_out', 'asks while 4 meldable naturals remain')
assert(
  multiAsk.state.players[2].hand.length === 4,
  'asks before meltdown on multi-card natural path',
)
const multiYes = {
  ...createApproveGoOutSignal(0, 'You', 'Y'),
  timestamp: (multiAsk.chatMessage?.timestamp ?? 0) + 1,
}
const multiDone = runAiTurn(multiAsk.state, [multiAsk.chatMessage!, multiYes])
assert(multiDone.state.phase === 'roundEnd', 'Yes with melded-down naturals goes out')

/* Mid-turn No: must not go out; may finish the turn holding the last card. */
const noAfterAsk = {
  ...createDenyGoOutSignal(0, 'You', 'Y'),
  timestamp: (meldableAsk.chatMessage?.timestamp ?? 0) + 1,
}
const afterNo = runAiTurn(meldableAsk.state, [meldableAsk.chatMessage!, noAfterAsk])
assert(afterNo.state.phase === 'playing', 'No after ask does not end the round')
assert(afterNo.state.wentOutTeamId == null, 'No leaves wentOutTeamId null')
assert(
  afterNo.state.players[2].hand.length >= 1,
  'after No the AI still has cards',
)

/*
 * Reported bug: wild + discard with a spare completed clean — go-out ask first,
 * then wild consent during meltdown after Yes, then discard finishes.
 */
const wildSpareClean = goOutState(
  [card('wj1', 'Joker', 'joker'), card('wd1', '4')],
  [cleanBook, secondClean, dirtyFull],
)
const wildConsentAsk = runAiTurn(wildSpareClean, [])
assert(
  wildConsentAsk.awaitingPartner === true &&
    wildConsentAsk.chatMessage?.type === 'ready_go_out',
  'asks to go out while 2 cards remain before wild meltdown',
)
assert(
  wildConsentAsk.state.phase === 'playing',
  'does not go out until partner approves the ask',
)
const wildGoOutYes = {
  ...createApproveGoOutSignal(0, 'You', 'Y'),
  timestamp: (wildConsentAsk.chatMessage?.timestamp ?? 0) + 1,
}
const wildGoOutAsk = runAiTurn(wildConsentAsk.state, [
  wildConsentAsk.chatMessage!,
  wildGoOutYes,
])
assert(
  wildGoOutAsk.chatMessage?.type === 'wild_request',
  'asks wild consent during meltdown after go-out Yes',
)
assert(wildGoOutAsk.awaitingPartner === true, 'wild consent pauses before finishing')
const wildBookYes = {
  ...createWildApproveSignal(
    0,
    'You',
    'Y',
    wildGoOutAsk.chatMessage!.bookId ?? secondClean.id,
  ),
  timestamp: (wildGoOutAsk.chatMessage?.timestamp ?? 0) + 1,
}
const wildGoOutDone = runAiTurn(wildGoOutAsk.state, [
  wildConsentAsk.chatMessage!,
  wildGoOutYes,
  wildGoOutAsk.chatMessage!,
  wildBookYes,
])
assert(
  wildGoOutDone.state.phase === 'roundEnd',
  'wild Yes + go-out Yes finishes the round (reported bug)',
)
assert(wildGoOutDone.state.wentOutTeamId === 0, 'correct team after wild dump go-out')

/* Sole clean + wild: never ask / never destroy go-out clean. */
const soleWild = goOutState(
  [card('sj1', 'Joker', 'joker'), card('sd1', '4')],
  [cleanBook, dirtyFull],
)
const soleWildTurn = runAiTurn(soleWild, [])
assert(
  soleWildTurn.chatMessage?.type !== 'ready_go_out',
  'does not ask to go out when wild would destroy the only clean',
)
assert(soleWildTurn.state.wentOutTeamId == null, 'sole-clean wild turn does not go out')

console.log('check-go-out-books: all assertions passed')
