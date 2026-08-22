/**
 * Smoke-check: discarding the last hand card with foot waiting activates foot-on-hold.
 */
import { discardCard, canGoToFoot } from '../src/game/actions'
import type { Card } from '../src/game/cards'
import type { GameState, PlayerState } from '../src/game/deal'

function card(id: string, rank: Card['rank'] = '10', suit: Card['suit'] = 'hearts'): Card {
  return { id, rank, suit, deckIndex: 0 }
}

function player(partial: Partial<PlayerState> & Pick<PlayerState, 'hand' | 'foot'>): PlayerState {
  return {
    profile: {
      seatIndex: 0,
      name: 'You',
      age: 30,
      avatar: '🐶',
      teamId: 0,
      isHuman: true,
      aiDifficulty: null,
    },
    isPlayingFoot: false,
    footOnHold: false,
    ...partial,
  }
}

function baseState(players: PlayerState[]): GameState {
  return {
    phase: 'playing',
    playerCount: 4,
    players,
    teams: [
      { id: 0, score: 0, books: [], meldThresholdMet: true },
      { id: 1, score: 0, books: [], meldThresholdMet: true },
    ],
    stock: [card('stock-1', '4'), card('stock-2', '5')],
    discard: [card('disc-1', 'A')],
    currentPlayerIndex: 0,
    roundStarterIndex: 0,
    roundNumber: 3,
    turnPhase: 'play',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
    wentOutTeamId: null,
    roundScores: null,
    winnerTeamId: null,
  }
}

const lastHand = card('last-10')
const footCards = Array.from({ length: 11 }, (_, i) => card(`foot-${i}`, '7'))
const you = player({ hand: [lastHand], foot: footCards })
const others = [1, 2, 3].map((seat) =>
  player({
    hand: [card(`h-${seat}`)],
    foot: [card(`f-${seat}`)],
    profile: {
      seatIndex: seat,
      name: `P${seat}`,
      age: 30,
      avatar: '🤖',
      teamId: seat % 2,
      isHuman: false,
      aiDifficulty: 'normal',
    },
  }),
)

if (!canGoToFoot(you)) {
  console.error('FAIL: canGoToFoot should be true with H1 F11')
  process.exit(1)
}

const result = discardCard(baseState([you, ...others]), lastHand.id)
if (result.error) {
  console.error('FAIL: discard error', result.error)
  process.exit(1)
}

const after = result.state.players[0]
if (after.hand.length !== 0) {
  console.error('FAIL: hand should be empty after go-to-foot discard', after.hand.length)
  process.exit(1)
}
if (!after.footOnHold) {
  console.error('FAIL: foot should be on hold until next turn')
  process.exit(1)
}
if (after.isPlayingFoot) {
  console.error('FAIL: should not be playing foot yet')
  process.exit(1)
}
if (after.foot.length !== 11) {
  console.error('FAIL: foot pile should still have 11 cards', after.foot.length)
  process.exit(1)
}
if (result.state.currentPlayerIndex === 0) {
  console.error('FAIL: turn should advance after discard')
  process.exit(1)
}

console.log('OK: discard last hand card goes to foot (on hold) and advances turn')
