/**
 * Regression: after skip-and-run into the foot, the AI must keep melding
 * playable foot cards in the same turn (not wait until the next turn).
 *
 * Run with: npx tsx scripts/check-ai-foot-meld.ts
 */
import { runAiTurn } from '../src/game/ai/runTurn'
import type { Book } from '../src/game/books'
import type { Card, Rank, Suit } from '../src/game/cards'
import type { GameState, PlayerState } from '../src/game/deal'
import { findAddToBookActions, findStartBookActions } from '../src/game/ai/decisions'
import { aiMeldPlayBudget, cardsHeldByAi } from '../src/game/ai/strategy'
import { buildAiPublicState } from '../src/game/ai/publicState'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

function card(rank: Rank, id: string, suit: Suit = 'hearts'): Card {
  return { id, rank, suit, deckIndex: 0 }
}

function ofRank(rank: Rank, n: number, prefix: string): Card[] {
  return Array.from({ length: n }, (_, i) =>
    card(rank, `${prefix}-${i}`, SUITS[i % 4]!),
  )
}

function book(rank: Rank, cards: Card[], teamId = 0, id?: string): Book {
  return {
    id: id ?? `book-${rank}`,
    rank,
    cards,
    teamId,
    startedBySeatIndex: 0,
  }
}

function mkPlayer(
  seat: number,
  partial: Partial<PlayerState> & Pick<PlayerState, 'hand' | 'foot'>,
): PlayerState {
  return {
    profile: {
      seatIndex: seat,
      name: `P${seat}`,
      age: 30,
      avatar: '🤖',
      teamId: seat % 2,
      isHuman: false,
      aiDifficulty: 'normal',
    },
    isPlayingFoot: false,
    footOnHold: false,
    ...partial,
  }
}

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

{
  const heldHand = cardsHeldByAi(
    buildAiPublicState(
      {
        phase: 'playing',
        playerCount: 4,
        players: [
          mkPlayer(0, {
            hand: ofRank('K', 5, 'h'),
            foot: ofRank('Q', 11, 'f'),
            isPlayingFoot: false,
          }),
          mkPlayer(1, { hand: ofRank('5', 3, 'a'), foot: ofRank('6', 11, 'b') }),
          mkPlayer(2, { hand: ofRank('7', 3, 'c'), foot: ofRank('8', 11, 'd') }),
          mkPlayer(3, { hand: ofRank('4', 3, 'e'), foot: ofRank('3', 11, 'g') }),
        ],
        teams: [
          { id: 0, score: 0, books: [], meldThresholdMet: true },
          { id: 1, score: 0, books: [], meldThresholdMet: true },
        ],
        stock: [],
        discard: [],
        currentPlayerIndex: 0,
        roundStarterIndex: 0,
        roundNumber: 1,
        turnPhase: 'play',
        meldPointsThisTurn: 0,
        booksWithWildAddedThisTurn: [],
        wentOutTeamId: null,
        roundScores: null,
        winnerTeamId: null,
      },
      0,
    ),
  )
  assert(heldHand === 16, `cardsHeldByAi while in hand counts hand+foot (got ${heldHand})`)

  const heldFoot = cardsHeldByAi(
    buildAiPublicState(
      {
        phase: 'playing',
        playerCount: 4,
        players: [
          mkPlayer(0, {
            hand: ofRank('K', 13, 'hf'),
            foot: [],
            isPlayingFoot: true,
          }),
          mkPlayer(1, { hand: ofRank('5', 3, 'a2'), foot: ofRank('6', 11, 'b2') }),
          mkPlayer(2, { hand: ofRank('7', 3, 'c2'), foot: ofRank('8', 11, 'd2') }),
          mkPlayer(3, { hand: ofRank('4', 3, 'e2'), foot: ofRank('3', 11, 'g2') }),
        ],
        teams: [
          { id: 0, score: 0, books: [], meldThresholdMet: true },
          { id: 1, score: 0, books: [], meldThresholdMet: true },
        ],
        stock: [],
        discard: [],
        currentPlayerIndex: 0,
        roundStarterIndex: 0,
        roundNumber: 1,
        turnPhase: 'play',
        meldPointsThisTurn: 0,
        booksWithWildAddedThisTurn: [],
        wentOutTeamId: null,
        roundScores: null,
        winnerTeamId: null,
      },
      0,
    ),
  )
  assert(heldFoot === 13, `cardsHeldByAi in foot does not double-count (got ${heldFoot})`)
}

{
  const budget = aiMeldPlayBudget(7, 11, false)
  assert(budget >= 18, `budget covers hand+foot singles (got ${budget})`)
  assert(aiMeldPlayBudget(13, 0, true) >= 21, 'foot budget covers a full foot')
}

// Skip-and-run: many single-rank adds from hand, then a playable foot.
{
  const cleanRanks: Rank[] = ['4', '5', '6', '7', '8', '9', '10']
  const teamBooks = [
    ...cleanRanks.map((r) => book(r, ofRank(r, 3, `b${r}`))),
    book('Q', [...ofRank('Q', 6, 'bQ'), card('2', 'bQw')], 0, 'dirtyQ'),
    book('A', ofRank('A', 7, 'bA'), 0, 'cleanA'),
  ]
  const hand = cleanRanks.map((r) => card(r, `h-${r}`))
  const foot = [
    ...cleanRanks.map((r) => card(r, `f-${r}`)),
    card('J', 'fJ0'),
    card('J', 'fJ1'),
    card('J', 'fJ2'),
    card('8', 'f8x'),
  ]

  const players = [
    mkPlayer(0, {
      hand,
      foot,
      profile: {
        seatIndex: 0,
        name: 'Partner',
        age: 30,
        avatar: '🤖',
        teamId: 0,
        isHuman: false,
        aiDifficulty: 'normal',
      },
    }),
    mkPlayer(1, {
      hand: ofRank('5', 3, 'p5'),
      foot: ofRank('6', 11, 'p6'),
      profile: {
        seatIndex: 1,
        name: 'You',
        age: 30,
        avatar: '🐶',
        teamId: 0,
        isHuman: true,
        aiDifficulty: null,
      },
    }),
    mkPlayer(2, { hand: ofRank('7', 3, 'o7'), foot: ofRank('8', 11, 'o8') }),
    mkPlayer(3, { hand: ofRank('4', 3, 'o4'), foot: ofRank('3', 11, 'o3') }),
  ]

  const state: GameState = {
    phase: 'playing',
    playerCount: 4,
    players,
    teams: [
      { id: 0, score: 500, books: teamBooks, meldThresholdMet: true },
      {
        id: 1,
        score: 500,
        books: [book('9', ofRank('9', 4, 'ob9'), 1)],
        meldThresholdMet: true,
      },
    ],
    stock: Array.from({ length: 40 }, (_, i) => card('5', `stock-${i}`)),
    discard: [card('A', 'disc')],
    currentPlayerIndex: 0,
    roundStarterIndex: 0,
    roundNumber: 2,
    turnPhase: 'play',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
    wentOutTeamId: null,
    roundScores: null,
    winnerTeamId: null,
  }

  const beforeBookCards = state.teams[0]!.books.reduce((s, b) => s + b.cards.length, 0)
  const origRandom = Math.random
  Math.random = () => 0.99
  const result = runAiTurn(state, [])
  Math.random = origRandom

  const after = result.state.players[0]!
  const afterBooks = result.state.teams[0]!.books
  const afterBookCards = afterBooks.reduce((s, b) => s + b.cards.length, 0)
  const melded = afterBookCards - beforeBookCards

  assert(after.isPlayingFoot, 'skip-and-run activates the foot this turn')
  assert(melded >= 16, `melds hand + foot books in one turn (got ${melded})`)
  assert(
    afterBooks.some((b) => b.rank === 'J' && b.cards.length >= 3),
    'starts the stranded Jack book before discard cushion is gone',
  )

  const remainingAdds = findAddToBookActions(
    after.hand,
    afterBooks,
    true,
    result.state.booksWithWildAddedThisTurn,
    true,
  )
  const remainingStarts = findStartBookActions(after.hand, afterBooks, true, true)
  const playableLeft =
    remainingAdds.some((a) => after.hand.length - a.cardIds.length >= 1) ||
    remainingStarts.some((a) => after.hand.length - a.cardIds.length >= 1)

  assert(
    !playableLeft,
    `no legal foot melds left stranded (hand ${after.hand.length}: ${after.hand.map((c) => c.rank).join(' ')})`,
  )
  assert(
    after.hand.length <= 1,
    `does not bank a pile of foot cards (got ${after.hand.length})`,
  )
  if (after.hand.length === 0) {
    assert(
      result.state.phase === 'roundEnd' || result.state.wentOutTeamId === 0,
      'empty hand means they discarded out',
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`)
  process.exit(1)
}
console.log('\nAll checks passed.')
