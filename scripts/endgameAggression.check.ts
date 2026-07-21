/**
 * Regression checks for endgame expert aggression.
 * Run: npx tsx scripts/endgameAggression.check.ts
 */
import type { Card } from '../src/game/cards'
import type { Book } from '../src/game/books'
import type { GameState, PlayerState, TeamState } from '../src/game/deal'
import { buildAiPublicState } from '../src/game/ai/publicState'
import { justifyDirtyingCleanBook, meldPressure } from '../src/game/ai/strategy'
import { planExpertTurn } from '../src/game/ai/expert'

function card(id: string, rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  return { id, rank, suit, deckIndex: 0 }
}

function makeBook(id: string, rank: Card['rank'], cards: Card[], teamId = 1): Book {
  return { id, rank, cards, teamId, startedBySeatIndex: 1 }
}

function baseState(partial: {
  hand: Card[]
  books: Book[]
  teamScore?: number
  opponentHand?: number
}): GameState {
  const team0: TeamState = { id: 0, score: 0, books: [], meldThresholdMet: true }
  const team1: TeamState = {
    id: 1,
    score: partial.teamScore ?? 500,
    books: partial.books,
    meldThresholdMet: true,
  }

  const mkPlayer = (
    seat: number,
    teamId: number,
    hand: Card[],
    isHuman: boolean,
  ): PlayerState => ({
    profile: {
      seatIndex: seat,
      name: `P${seat}`,
      age: 30,
      avatar: '🤖',
      teamId,
      isHuman,
      aiDifficulty: isHuman ? null : 'expert',
    },
    hand,
    foot: [],
    isPlayingFoot: true,
    footOnHold: false,
  })

  const oppHandCount = partial.opponentHand ?? 2
  const oppHand = Array.from({ length: oppHandCount }, (_, i) => card(`opp-${i}`, '4'))

  return {
    phase: 'playing',
    playerCount: 4,
    players: [
      mkPlayer(0, 0, oppHand, true),
      mkPlayer(1, 1, partial.hand, false),
      mkPlayer(2, 0, [card('o2', '5')], false),
      mkPlayer(3, 1, [card('p3', '6')], false),
    ],
    teams: [team0, team1],
    stock: Array.from({ length: 30 }, (_, i) => card(`stock-${i}`, '7')),
    discard: [card('disc', '8')],
    currentPlayerIndex: 1,
    roundStarterIndex: 0,
    roundNumber: 1,
    turnPhase: 'play',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
    wentOutTeamId: null,
    roundScores: null,
    winnerTeamId: null,
  }
}

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

{
  const clean7 = makeBook('c7', 'K', [
    card('k1', 'K'),
    card('k2', 'K'),
    card('k3', 'K'),
    card('k4', 'K'),
    card('k5', 'K'),
    card('k6', 'K'),
    card('k7', 'K'),
  ])
  const clean6 = makeBook('c6', 'Q', [
    card('q1', 'Q'),
    card('q2', 'Q'),
    card('q3', 'Q'),
    card('q4', 'Q'),
    card('q5', 'Q'),
    card('q6', 'Q'),
  ])
  const wild = card('w1', '2', 'hearts')
  const hand = [wild, card('h1', '9'), card('h2', '10')]
  const state = baseState({
    hand,
    books: [clean7, clean6],
    teamScore: 500,
    opponentHand: 2,
  })
  const pub = buildAiPublicState(state, 1)
  assert(meldPressure(pub) === 'high', 'small foot + opponent race => high pressure')
  assert(
    justifyDirtyingCleanBook(clean6, [wild], pub, [], [], state) === true,
    'must allow dirtying clean-6 for go-out even in early round',
  )
  const plan = planExpertTurn(state, [])
  const melds = plan.filter((p) => p.type === 'addToBook' || p.type === 'startBook')
  assert(melds.length > 0, 'planner must meld (not discard-only) to finish dirty book')
  const dirtyAdd = plan.find(
    (p) => p.type === 'addToBook' && p.bookId === 'c6' && p.cardIds.includes('w1'),
  )
  assert(!!dirtyAdd, 'planner should add the wild onto the clean-6 book')
}

{
  const clean7 = makeBook('c7b', 'A', [
    card('a1', 'A'),
    card('a2', 'A'),
    card('a3', 'A'),
    card('a4', 'A'),
    card('a5', 'A'),
    card('a6', 'A'),
    card('a7', 'A'),
  ])
  const dirty7 = makeBook('d7', 'J', [
    card('j1', 'J'),
    card('j2', 'J'),
    card('j3', 'J'),
    card('j4', 'J'),
    card('j5', 'J'),
    card('j6', '2', 'clubs'),
    card('j7', 'J'),
  ])
  const hand = [
    card('extra1', 'A'),
    card('extra2', 'A'),
    card('extra3', 'J'),
    card('dead', '8'),
  ]
  const state = baseState({
    hand,
    books: [clean7, dirty7],
    teamScore: 1600,
    opponentHand: 3,
  })
  const plan = planExpertTurn(state, [])
  const adds = plan.filter((p) => p.type === 'addToBook')
  assert(adds.length >= 1, 'go-out-ready foot must dump onto existing books before discard')
}

if (failed) {
  console.error(`Regression failures: ${failed}`)
  // eslint-disable-next-line no-throw-literal
  throw new Error('failed')
}
console.log('All endgame aggression regressions passed.')
