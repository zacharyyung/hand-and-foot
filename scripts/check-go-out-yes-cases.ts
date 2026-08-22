/**
 * Rigorous go-out Yes/No case matrix.
 * Run with: npx tsx scripts/check-go-out-yes-cases.ts
 */
import { runAiTurn } from '../src/game/ai/runTurn'
import { canMeldDownToLastCard } from '../src/game/ai/decisions'
import { justifyDirtyingCleanBook } from '../src/game/ai/strategy'
import { buildAiPublicState } from '../src/game/ai/publicState'
import {
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  createReadyGoOutSignal,
  createWildApproveSignal,
  createWildDenySignal,
  hasExplicitGoOutApproval,
} from '../src/game/chat'
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

function bookOf(
  id: string,
  rank: Card['rank'],
  nats: number,
  wilds = 0,
): Book {
  const cards: Card[] = []
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (let i = 0; i < nats; i++) {
    cards.push(card(`${id}-n${i}`, rank, suits[i % 4]))
  }
  for (let i = 0; i < wilds; i++) {
    cards.push(
      card(
        `${id}-w${i}`,
        i % 2 === 0 ? '2' : 'Joker',
        i % 2 === 0 ? 'clubs' : 'joker',
      ),
    )
  }
  return { id, rank, teamId: 0, startedBySeatIndex: 0, cards }
}

const cleanA = bookOf('cA', 'A', 7)
const cleanQ = bookOf('cQ', 'Q', 7)
const dirtyK = bookOf('dK', 'K', 5, 2)

function goOutState(aiHand: Card[], teamBooks: Book[], opts: Partial<GameState> = {}): GameState {
  const players: PlayerState[] = [
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

  return {
    phase: 'playing',
    roundNumber: 4,
    playerCount: 4,
    currentPlayerIndex: 2,
    turnPhase: 'play',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
    wentOutTeamId: null,
    stock: [card('s1', '4'), card('s2', '5'), card('s3', '6'), card('s4', '7')],
    discard: [card('xd', '3', 'spades')],
    teams: [
      { id: 0, score: 2500, books: teamBooks, meldThresholdMet: true },
      { id: 1, score: 2400, books: [], meldThresholdMet: true },
    ],
    players,
    roundScores: null,
    winnerTeamId: null,
    roundStarterIndex: 0,
    ...opts,
  } as GameState
}

function askThenYes(hand: Card[], books: Book[]) {
  const ask = runAiTurn(goOutState(hand, books), [])
  assert(ask.chatMessage?.type === 'ready_go_out', 'expected go-out ask')
  assert(ask.awaitingPartner === true, 'expected pause')
  const yes = {
    ...createApproveGoOutSignal(0, 'You', 'Y'),
    timestamp: ask.chatMessage!.timestamp + 1,
  }
  let after = runAiTurn(ask.state, [ask.chatMessage!, yes])
  const msgs = [ask.chatMessage!, yes]

  /* Auto-approve one wild consent if the Yes path needs it. */
  if (after.awaitingPartner && after.chatMessage?.type === 'wild_request') {
    const wildYes = {
      ...createWildApproveSignal(0, 'You', 'Y', after.chatMessage.bookId ?? ''),
      timestamp: after.chatMessage.timestamp + 1,
    }
    msgs.push(after.chatMessage, wildYes)
    after = runAiTurn(after.state, msgs)
  }

  return after
}

/* --- Natural meltdown Yes cases --- */
for (const [name, hand] of [
  ['A+discard', [card('a1', 'A'), card('d1', '4')]],
  ['K+discard', [card('k1', 'K'), card('d1', '4')]],
  ['AA+discard', [card('a1', 'A'), card('a2', 'A', 'diamonds'), card('d1', '4')]],
  ['AK+discard', [card('a1', 'A'), card('k1', 'K'), card('d1', '4')]],
  [
    'AAK+discard',
    [
      card('a1', 'A'),
      card('a2', 'A', 'diamonds'),
      card('k1', 'K'),
      card('d1', '4'),
    ],
  ],
  [
    'QQQ+discard start-book',
    [
      card('q1', 'Q'),
      card('q2', 'Q', 'diamonds'),
      card('q3', 'Q', 'clubs'),
      card('d1', '4'),
    ],
  ],
] as Array<[string, Card[]]>) {
  const done = askThenYes(hand, [cleanA, dirtyK])
  assert(done.state.phase === 'roundEnd', `${name}: Yes must end the round`)
  assert(done.state.wentOutTeamId === 0, `${name}: correct team`)
}

/* --- Wild dump onto spare clean after go-out Yes --- */
{
  const done = askThenYes(
    [card('j1', 'Joker', 'joker'), card('d1', '4')],
    [cleanA, cleanQ, dirtyK],
  )
  assert(done.state.phase === 'roundEnd', 'wild+spare clean: Yes must end the round')
  assert(done.state.wentOutTeamId === 0, 'wild+spare clean: correct team')
}

/* --- No must not end the round --- */
{
  const ask = runAiTurn(goOutState([card('a1', 'A'), card('d1', '4')], [cleanA, dirtyK]), [])
  assert(ask.chatMessage?.type === 'ready_go_out', 'No-case: ask first')
  const no = {
    ...createDenyGoOutSignal(0, 'You', 'Y'),
    timestamp: ask.chatMessage!.timestamp + 1,
  }
  const after = runAiTurn(ask.state, [ask.chatMessage!, no])
  assert(after.state.phase === 'playing', 'No must not end the round')
  assert(after.state.wentOutTeamId == null, 'No leaves wentOutTeamId null')
}

/* --- Go-out Yes then wild No: do not go out --- */
{
  const ask = runAiTurn(
    goOutState([card('j1', 'Joker', 'joker'), card('d1', '4')], [cleanA, cleanQ, dirtyK]),
    [],
  )
  assert(ask.chatMessage?.type === 'ready_go_out', 'wild-No case: go-out ask')
  const yes = {
    ...createApproveGoOutSignal(0, 'You', 'Y'),
    timestamp: ask.chatMessage!.timestamp + 1,
  }
  const afterYes = runAiTurn(ask.state, [ask.chatMessage!, yes])
  assert(
    afterYes.chatMessage?.type === 'wild_request',
    'wild-No case: expects wild ask after go-out Yes',
  )
  const wildNo = {
    ...createWildDenySignal(0, 'You', 'Y', afterYes.chatMessage!.bookId ?? ''),
    timestamp: afterYes.chatMessage!.timestamp + 1,
  }
  const afterNo = runAiTurn(afterYes.state, [
    ask.chatMessage!,
    yes,
    afterYes.chatMessage!,
    wildNo,
  ])
  assert(afterNo.state.phase === 'playing', 'wild No must not end the round')
  assert(afterNo.state.wentOutTeamId == null, 'wild No leaves wentOutTeamId null')
}

/* --- Stale Yes on a later draw turn must re-ask, not silent go-out --- */
{
  const priorAsk = createReadyGoOutSignal(2, 'AI', 'A')
  const priorYes = {
    ...createApproveGoOutSignal(0, 'You', 'Y'),
    timestamp: priorAsk.timestamp + 1,
  }
  assert(hasExplicitGoOutApproval([priorAsk, priorYes], 2, 4), 'stale Yes is explicit')
  const turn = runAiTurn(
    goOutState([card('last', '4')], [cleanA, dirtyK], { turnPhase: 'draw' }),
    [priorAsk, priorYes],
  )
  assert(turn.state.phase === 'playing', 'stale Yes on new turn does not silent go-out')
  assert(
    turn.chatMessage?.type === 'ready_go_out' || turn.state.players[2].hand.length >= 2,
    'stale Yes leads to re-ask or continued play after draw',
  )
  assert(turn.state.wentOutTeamId == null, 'no went-out on stale Yes draw turn')
}

/* --- nearGoOut while playing foot (myFootCount mirrors hand) --- */
{
  const hand = [card('j1', 'Joker', 'joker'), card('d1', '4')]
  const books = [cleanA, cleanQ, dirtyK]
  const state = goOutState(hand, books)
  const pub = buildAiPublicState(state, 2)
  assert(pub.isPlayingFoot && pub.myFootCount === hand.length, 'foot count mirrors hand')
  assert(
    justifyDirtyingCleanBook(cleanA, [hand[0]!], pub, [], [], state),
    'near go-out may dump wild onto spare completed clean',
  )
  assert(
    canMeldDownToLastCard(hand, books, [], true),
    'can meld down when spare clean can take the wild',
  )
  assert(
    !canMeldDownToLastCard(hand, [cleanA, dirtyK], [], true),
    'cannot meld down when wild would destroy the only clean',
  )
}

/* --- Unmeldable 2 cards: do not ask --- */
{
  const turn = runAiTurn(
    goOutState([card('x1', '4'), card('x2', '5', 'diamonds')], [cleanA, dirtyK]),
    [],
  )
  assert(turn.chatMessage?.type !== 'ready_go_out', 'unmeldable 2: no ask')
  assert(turn.state.wentOutTeamId == null, 'unmeldable 2: no go-out')
}

console.log('check-go-out-yes-cases: all assertions passed')
