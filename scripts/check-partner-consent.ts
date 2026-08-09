/**
 * Regression checks for AI partner wild / go-out consent.
 * Run with: npx tsx scripts/check-partner-consent.ts
 */
import {
  awaitingPartnerWildResponse,
  canAiSendWildRequest,
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  createReadyGoOutSignal,
  createWildApproveSignal,
  createWildDenySignal,
  createWildRequestSignal,
  deniedWildBookIds,
  hasPartnerGoOutApproval,
  hasPartnerWildApprovalForBook,
  isAllowedChatMessage,
  opponentsHoldManyCards,
  partnerAdvisedAgainstGoOut,
  partnerDeniedLatestWildAsk,
  pendingPartnerWildRequest,
  shouldAiAttemptGoOut,
  wasPartnerWildDeniedForBook,
  type ChatMessage,
} from '../src/game/chat'
import { needsHumanWildConsent } from '../src/game/ai/chatSignals'
import { runAiTurn, stripWildAddsSince } from '../src/game/ai/runTurn'
import { bookWildCount, isCleanBook, type Book } from '../src/game/books'
import { isWildCard, type Card } from '../src/game/cards'
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

const humanBook: Book = {
  id: 'book-human',
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
    card('w1', '2', 'clubs'),
  ],
}

const aiCleanBook: Book = {
  id: 'book-ai-clean',
  rank: 'K',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('k1', 'K'),
    card('k2', 'K', 'diamonds'),
    card('k3', 'K', 'clubs'),
    card('k4', 'K', 'spades'),
    card('k5', 'K'),
    card('k6', 'K', 'diamonds'),
    card('k7', 'K', 'clubs'),
  ],
}

const aiCleanBookQ: Book = {
  id: 'book-ai-clean-q',
  rank: 'Q',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('q1', 'Q'),
    card('q2', 'Q', 'diamonds'),
    card('q3', 'Q', 'clubs'),
    card('q4', 'Q', 'spades'),
    card('q5', 'Q'),
    card('q6', 'Q', 'diamonds'),
  ],
}

const wild = card('j1', 'Joker', 'joker')

const humanCleanBook: Book = {
  id: 'book-human-clean',
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
  ],
}

assert(
  needsHumanWildConsent(humanCleanBook, [wild], 0),
  'dirtying human clean book needs consent',
)
assert(
  !needsHumanWildConsent(humanBook, [wild], 0),
  'already-dirty book does not re-prompt (wild would already be visible)',
)
assert(
  needsHumanWildConsent(aiCleanBook, [wild], 0),
  'dirtying clean book needs consent',
)
assert(
  !needsHumanWildConsent(humanBook, [card('a9', 'A')], 0),
  'natural add does not need wild consent',
)

const ask = createWildRequestSignal(2, 'AI', '🤖', 'K', aiCleanBook.id)
assert(ask.type === 'wild_request', 'wild request type')
assert(ask.bookId === aiCleanBook.id, 'bookId attached')

const messages: ChatMessage[] = [ask]
assert(
  pendingPartnerWildRequest(messages, 0, 2) !== null,
  'human sees pending wild request',
)
assert(awaitingPartnerWildResponse(messages, 2, 0), 'AI awaits wild response')

const approve = {
  ...createWildApproveSignal(0, 'You', '🧑', aiCleanBook.id),
  timestamp: ask.timestamp + 1,
}
assert(
  hasPartnerWildApprovalForBook([...messages, approve], 2, 0, aiCleanBook.id),
  'approval matches book',
)

const deny = {
  ...createWildDenySignal(0, 'You', '🧑', aiCleanBook.id),
  timestamp: ask.timestamp + 1,
}
assert(
  deniedWildBookIds([...messages, deny], 2, 0).has(aiCleanBook.id),
  'denied book id tracked',
)
assert(
  wasPartnerWildDeniedForBook([...messages, deny], 2, 0, aiCleanBook.id),
  'deny sticks for that book',
)
assert(
  partnerDeniedLatestWildAsk([...messages, deny], 2, 0),
  'latest ask denied helper',
)

/* No on book A, then Yes on book B must not rewrite A's denial. */
const askK = { ...createWildRequestSignal(2, 'AI', '🤖', 'K', aiCleanBook.id), timestamp: 100 }
const denyK = {
  ...createWildDenySignal(0, 'You', '🧑', aiCleanBook.id),
  timestamp: 101,
}
const askQ = {
  ...createWildRequestSignal(2, 'AI', '🤖', 'Q', aiCleanBookQ.id),
  timestamp: 102,
}
const approveQ = {
  ...createWildApproveSignal(0, 'You', '🧑', aiCleanBookQ.id),
  timestamp: 103,
}
const multiBook: ChatMessage[] = [askK, denyK, askQ, approveQ]
assert(
  wasPartnerWildDeniedForBook(multiBook, 2, 0, aiCleanBook.id),
  'No on K stays after Yes on Q',
)
assert(
  !hasPartnerWildApprovalForBook(multiBook, 2, 0, aiCleanBook.id),
  'Yes on Q does not approve K',
)
assert(
  hasPartnerWildApprovalForBook(multiBook, 2, 0, aiCleanBookQ.id),
  'Yes on Q approves Q',
)
assert(
  !wasPartnerWildDeniedForBook(multiBook, 2, 0, aiCleanBookQ.id),
  'Q is not denied',
)
assert(
  deniedWildBookIds(multiBook, 2, 0).has(aiCleanBook.id),
  'denied set still includes K',
)
assert(
  !deniedWildBookIds(multiBook, 2, 0).has(aiCleanBookQ.id),
  'denied set does not include Q',
)

/* Legacy replies without bookId must not leak across later asks. */
const legacyAskK = {
  ...createWildRequestSignal(2, 'AI', '🤖', 'K', aiCleanBook.id),
  timestamp: 200,
}
const legacyDeny = {
  ...createWildDenySignal(0, 'You', '🧑', aiCleanBook.id),
  bookId: undefined,
  timestamp: 201,
}
const legacyAskQ = {
  ...createWildRequestSignal(2, 'AI', '🤖', 'Q', aiCleanBookQ.id),
  timestamp: 202,
}
const legacyApprove = {
  ...createWildApproveSignal(0, 'You', '🧑', aiCleanBookQ.id),
  bookId: undefined,
  timestamp: 203,
}
const legacyThread: ChatMessage[] = [
  legacyAskK,
  legacyDeny as ChatMessage,
  legacyAskQ,
  legacyApprove as ChatMessage,
]
assert(
  wasPartnerWildDeniedForBook(legacyThread, 2, 0, aiCleanBook.id),
  'legacy No on K survives later Yes',
)
assert(
  hasPartnerWildApprovalForBook(legacyThread, 2, 0, aiCleanBookQ.id),
  'legacy Yes still binds to later ask Q',
)

function stubState(overrides?: Partial<GameState>): GameState {
  const human: PlayerState = {
    profile: {
      seatIndex: 0,
      name: 'You',
      avatar: '🧑',
      isHuman: true,
      teamId: 0,
    },
    hand: [card('qh1', 'Q')],
    foot: [],
    isPlayingFoot: true,
    footOnHold: false,
  } as PlayerState
  const ai: PlayerState = {
    profile: {
      seatIndex: 2,
      name: 'AI',
      avatar: '🤖',
      isHuman: false,
      teamId: 0,
      aiDifficulty: 'normal',
    },
    hand: [card('qh2', 'Q')],
    foot: [],
    isPlayingFoot: true,
    footOnHold: false,
  } as PlayerState
  const opp1 = {
    ...human,
    profile: { ...human.profile, seatIndex: 1, teamId: 1, isHuman: false, name: 'Opp1' },
    hand: Array.from({ length: 10 }, (_, i) => card(`o1-${i}`, '5')),
    foot: Array.from({ length: 10 }, (_, i) => card(`of1-${i}`, '6')),
    isPlayingFoot: false,
  } as PlayerState
  const opp2 = {
    ...ai,
    profile: { ...ai.profile, seatIndex: 3, teamId: 1, name: 'Opp2' },
    hand: Array.from({ length: 10 }, (_, i) => card(`o2-${i}`, '7')),
    foot: Array.from({ length: 10 }, (_, i) => card(`of2-${i}`, '8')),
    isPlayingFoot: false,
  } as PlayerState

  return {
    phase: 'playing',
    playerCount: 4,
    currentPlayerIndex: 2,
    turnPhase: 'play',
    roundNumber: 1,
    roundStarterIndex: 0,
    stock: [],
    discard: [],
    players: [human, opp1, ai, opp2],
    teams: [
      {
        id: 0,
        score: 0,
        books: [humanBook, aiCleanBook, aiCleanBookQ],
        meldThresholdMet: true,
      },
      {
        id: 1,
        score: 0,
        books: [],
        meldThresholdMet: true,
      },
    ],
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
    wentOutTeamId: null,
    roundScores: null,
    winnerTeamId: null,
    ...overrides,
  }
}

const state = stubState()
assert(canAiSendWildRequest(state, 2, []), 'AI can send wild request')
assert(isAllowedChatMessage(state, ask, []), 'wild_request allowed by chat validation')

const goOutAsk = createReadyGoOutSignal(2, 'AI', '🤖')
assert(
  !shouldAiAttemptGoOut(state, 2, [goOutAsk]),
  'AI does not go out while waiting on human',
)
assert(
  !shouldAiAttemptGoOut(state, 2, []),
  'AI does not go out before asking human',
)

const goOutYes = {
  ...createApproveGoOutSignal(0, 'You', '🧑'),
  timestamp: goOutAsk.timestamp + 1,
}
assert(
  hasPartnerGoOutApproval(state, 2, [goOutAsk, goOutYes]),
  'human go-out approval detected',
)
assert(
  shouldAiAttemptGoOut(state, 2, [goOutAsk, goOutYes]),
  'AI goes out after human says yes',
)

/* Human No must stick even when opponents still hold many cards. */
assert(
  opponentsHoldManyCards(state, 2),
  'precondition: opponents hold many cards (old escape hatch)',
)

const goOutNo = {
  ...createDenyGoOutSignal(0, 'You', '🧑'),
  timestamp: goOutAsk.timestamp + 1,
}
assert(
  partnerAdvisedAgainstGoOut([goOutAsk, goOutNo], 2, 4),
  'human No is recorded as advice against go-out',
)
assert(
  !shouldAiAttemptGoOut(state, 2, [goOutAsk, goOutNo]),
  'AI does not go out after human says no (even with many opponent cards)',
)

const afterNoTurn = runAiTurn(state, [goOutAsk, goOutNo])
assert(
  afterNoTurn.state.phase === 'playing',
  'after No the round continues (AI does not go out)',
)
assert(
  afterNoTurn.state.wentOutTeamId === null,
  'after No no team has gone out',
)
assert(
  afterNoTurn.state.players[2].hand.length === 1,
  'after No AI still holds the last foot card',
)
assert(
  afterNoTurn.state.currentPlayerIndex !== 2,
  'after No AI ends its turn without discarding to go out',
)

/* Next turn after No: AI may ask again (saying No does not permanently silence them). */
const nextTurnAfterNo = stubState({
  currentPlayerIndex: 2,
  turnPhase: 'draw',
  /* Draw naturals that meld onto the K book so the AI ends on one foot card again. */
  stock: [card('ns1', 'K'), card('ns2', 'K', 'diamonds'), card('ns3', '6')],
  discard: [card('nd1', '3', 'spades')],
  players: stubState().players.map((p, i) =>
    i === 2
      ? {
          ...p,
          hand: [card('nlast', 'Q')],
          foot: [],
          isPlayingFoot: true,
          footOnHold: false,
        }
      : p,
  ),
})
const reAskTurn = runAiTurn(nextTurnAfterNo, [goOutAsk, goOutNo])
assert(
  reAskTurn.chatMessage?.type === 'ready_go_out',
  'AI asks to go out again on a later turn after No',
)
assert(reAskTurn.awaitingPartner === true, 're-ask pauses for yes/no again')
assert(
  reAskTurn.state.wentOutTeamId === null,
  're-ask does not go out until the human answers',
)

const goOutClear = {
  ...createApproveGoOutSignal(0, 'You', '🧑', 'You should go out!'),
  timestamp: goOutNo.timestamp + 1,
}
assert(
  hasPartnerGoOutApproval(state, 2, [goOutAsk, goOutNo, goOutClear]),
  'You should go out! clears a prior No',
)
assert(
  shouldAiAttemptGoOut(state, 2, [goOutAsk, goOutNo, goOutClear]),
  'AI goes out after You should go out! clears the No',
)

/* --- Ask-before-place: wild must not be on the book while the prompt is up --- */
function bookFromState(game: GameState, id: string): Book {
  for (const team of game.teams) {
    const found = team.books.find((b) => b.id === id)
    if (found) return found
  }
  throw new Error(`missing book ${id}`)
}

const nearCompleteClean: Book = {
  id: 'book-timing-k',
  rank: 'K',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('tk1', 'K'),
    card('tk2', 'K', 'diamonds'),
    card('tk3', 'K', 'clubs'),
    card('tk4', 'K', 'spades'),
    card('tk5', 'K'),
    card('tk6', 'K', 'diamonds'),
  ],
}
const completedCleanAces: Book = {
  id: 'book-timing-a',
  rank: 'A',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('ta1', 'A'),
    card('ta2', 'A', 'diamonds'),
    card('ta3', 'A', 'clubs'),
    card('ta4', 'A', 'spades'),
    card('ta5', 'A'),
    card('ta6', 'A', 'diamonds'),
    card('ta7', 'A', 'clubs'),
  ],
}
const timingWild = card('tj1', 'Joker', 'joker')

const timingState = stubState({
  roundNumber: 3,
  teams: [
    {
      id: 0,
      score: 1500,
      books: [nearCompleteClean, completedCleanAces],
      meldThresholdMet: true,
    },
    {
      id: 1,
      score: 1200,
      books: [],
      meldThresholdMet: true,
    },
  ],
  players: [
    {
      profile: {
        seatIndex: 0,
        name: 'You',
        avatar: '🧑',
        isHuman: true,
        teamId: 0,
      },
      hand: [card('th1', 'Q')],
      foot: [],
      isPlayingFoot: true,
      footOnHold: false,
    } as PlayerState,
    {
      profile: {
        seatIndex: 1,
        name: 'Opp1',
        avatar: '🤖',
        isHuman: false,
        teamId: 1,
        aiDifficulty: 'expert',
      },
      hand: Array.from({ length: 12 }, (_, i) => card(`to1-${i}`, '5')),
      foot: Array.from({ length: 10 }, (_, i) => card(`tof1-${i}`, '6')),
      isPlayingFoot: false,
      footOnHold: false,
    } as PlayerState,
    {
      profile: {
        seatIndex: 2,
        name: 'AI',
        avatar: '🤖',
        isHuman: false,
        teamId: 0,
        aiDifficulty: 'expert',
      },
      hand: [timingWild, card('tx1', '4')],
      foot: [],
      isPlayingFoot: true,
      footOnHold: false,
    } as PlayerState,
    {
      profile: {
        seatIndex: 3,
        name: 'Opp2',
        avatar: '🤖',
        isHuman: false,
        teamId: 1,
        aiDifficulty: 'expert',
      },
      hand: Array.from({ length: 12 }, (_, i) => card(`to2-${i}`, '7')),
      foot: Array.from({ length: 10 }, (_, i) => card(`tof2-${i}`, '8')),
      isPlayingFoot: false,
      footOnHold: false,
    } as PlayerState,
  ],
  stock: [card('ts1', '4'), card('ts2', '5')],
  discard: [card('td1', '3', 'spades')],
})

function runUntilWildAsk(game: GameState) {
  let result = runAiTurn(game, [])
  for (let i = 0; i < 40; i++) {
    if (result.chatMessage?.type === 'wild_request') return result
    result = runAiTurn(game, [])
  }
  throw new Error('AI never asked to dirty the clean book')
}

const askResult = runUntilWildAsk(timingState)
assert(askResult.awaitingPartner === true, 'AI pauses for yes/no')
assert(
  askResult.chatMessage?.bookId === nearCompleteClean.id,
  'ask targets the clean book',
)

const bookAtAsk = bookFromState(askResult.state, nearCompleteClean.id)
assert(isCleanBook(bookAtAsk), 'book is still clean while prompt is up')
assert(bookWildCount(bookAtAsk) === 0, 'no wild on the book while prompt is up')
assert(
  askResult.state.players[2].hand.some((c) => c.id === timingWild.id),
  'wild stays in AI hand while prompt is up',
)
assert(
  !bookAtAsk.cards.some((c) => c.id === timingWild.id || isWildCard(c)),
  'proposed wild is not in the book until Yes',
)

const waiting = runAiTurn(askResult.state, [askResult.chatMessage!])
assert(waiting.awaitingPartner === true, 'still paused without an answer')
assert(
  isCleanBook(bookFromState(waiting.state, nearCompleteClean.id)),
  'book stays clean while waiting',
)

const denyTiming = {
  ...createWildDenySignal(0, 'You', '🧑', nearCompleteClean.id),
  timestamp: askResult.chatMessage!.timestamp + 1,
}
const afterNo = runAiTurn(askResult.state, [askResult.chatMessage!, denyTiming])
assert(
  isCleanBook(bookFromState(afterNo.state, nearCompleteClean.id)),
  'No keeps the book clean — wild is not placed',
)
assert(
  !bookFromState(afterNo.state, nearCompleteClean.id).cards.some(
    (c) => c.id === timingWild.id,
  ),
  'denied wild is not on the book',
)

const askAgain = runUntilWildAsk(timingState)
const approveTiming = {
  ...createWildApproveSignal(0, 'You', '🧑', nearCompleteClean.id),
  timestamp: askAgain.chatMessage!.timestamp + 1,
}
const afterYes = runAiTurn(askAgain.state, [askAgain.chatMessage!, approveTiming])
const bookAfterYes = bookFromState(afterYes.state, nearCompleteClean.id)
assert(
  bookWildCount(bookAfterYes) >= 1,
  'after Yes the wild lands on the book',
)
assert(
  bookAfterYes.cards.some((c) => c.id === timingWild.id),
  'after Yes the same wild card is on the book',
)

/* stripWildAddsSince must pull mid-turn wilds off books when pausing to ask. */
const stripClean: Book = {
  id: 'book-strip-clean',
  rank: 'K',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('sk1', 'K'),
    card('sk2', 'K', 'diamonds'),
    card('sk3', 'K', 'clubs'),
    card('sk4', 'K', 'spades'),
    card('sk5', 'K'),
    card('sk6', 'K', 'diamonds'),
  ],
}
const stripDirty: Book = {
  id: 'book-strip-dirty',
  rank: 'A',
  teamId: 0,
  startedBySeatIndex: 2,
  cards: [
    card('sa1', 'A'),
    card('sa2', 'A', 'diamonds'),
    card('sa3', 'A', 'clubs'),
    card('sa4', 'A', 'spades'),
    card('saw', '2', 'hearts'),
  ],
}
const stripWild = card('strip-j', 'Joker', 'joker')
const stripExtraWild = card('strip-2', '2', 'clubs')

const stripBefore = stubState({
  teams: [
    {
      id: 0,
      score: 1500,
      books: [stripClean, stripDirty],
      meldThresholdMet: true,
    },
    {
      id: 1,
      score: 1200,
      books: [],
      meldThresholdMet: true,
    },
  ],
  players: stubState().players.map((p, i) =>
    i === 2
      ? {
          ...p,
          hand: [stripWild, stripExtraWild, card('sx1', '4')],
          foot: [],
          isPlayingFoot: true,
        }
      : p,
  ),
})

const stripAfter: GameState = {
  ...stripBefore,
  players: stripBefore.players.map((p, i) =>
    i === 2
      ? {
          ...p,
          hand: p.hand.filter(
            (c) => c.id !== stripWild.id && c.id !== stripExtraWild.id,
          ),
        }
      : p,
  ),
  teams: [
    {
      ...stripBefore.teams[0],
      books: [
        { ...stripClean, cards: [...stripClean.cards, stripWild] },
        { ...stripDirty, cards: [...stripDirty.cards, stripExtraWild] },
      ],
    },
    stripBefore.teams[1],
  ],
  booksWithWildAddedThisTurn: [stripClean.id, stripDirty.id],
}

assert(!isCleanBook(bookFromState(stripAfter, stripClean.id)), 'precondition: clean dirtied')
assert(
  bookWildCount(bookFromState(stripAfter, stripDirty.id)) === 2,
  'precondition: dirty gained a wild',
)

const stripped = stripWildAddsSince(stripBefore, stripAfter, 2)
assert(
  isCleanBook(bookFromState(stripped, stripClean.id)),
  'strip restores the asked clean book',
)
assert(
  bookWildCount(bookFromState(stripped, stripDirty.id)) === 1,
  'strip removes the same-turn wild from the dirty book too',
)
assert(
  stripped.players[2].hand.some((c) => c.id === stripWild.id),
  'strip returns the clean-book wild to hand',
)
assert(
  stripped.players[2].hand.some((c) => c.id === stripExtraWild.id),
  'strip returns the dirty-book wild to hand',
)
assert(
  stripped.booksWithWildAddedThisTurn.length === 0,
  'strip clears wild-added-this-turn markers',
)

console.log('check-partner-consent: all assertions passed')
