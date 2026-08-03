/**
 * Regression checks for AI partner wild / go-out consent.
 * Run with: npx tsx scripts/check-partner-consent.ts
 */
import {
  awaitingPartnerWildResponse,
  canAiSendWildRequest,
  createApproveGoOutSignal,
  createReadyGoOutSignal,
  createWildApproveSignal,
  createWildDenySignal,
  createWildRequestSignal,
  deniedWildBookIds,
  hasPartnerGoOutApproval,
  hasPartnerWildApprovalForBook,
  isAllowedChatMessage,
  pendingPartnerWildRequest,
  shouldAiAttemptGoOut,
  type ChatMessage,
} from '../src/game/chat'
import { needsHumanWildConsent } from '../src/game/ai/chatSignals'
import type { Book } from '../src/game/books'
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

const wild = card('j1', 'Joker', 'joker')

assert(
  needsHumanWildConsent(humanBook, [wild], 0),
  'wild on human-started book needs consent',
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
  ...createWildApproveSignal(0, 'You', '🧑'),
  timestamp: ask.timestamp + 1,
}
assert(
  hasPartnerWildApprovalForBook([...messages, approve], 2, 0, aiCleanBook.id),
  'approval matches book',
)

const deny = {
  ...createWildDenySignal(0, 'You', '🧑'),
  timestamp: ask.timestamp + 1,
}
assert(
  deniedWildBookIds([...messages, deny], 2, 0).has(aiCleanBook.id),
  'denied book id tracked',
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
    hand: [card('q1', 'Q')],
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
    hand: [card('q2', 'Q')],
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
        books: [humanBook, aiCleanBook],
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

console.log('check-partner-consent: all assertions passed')
