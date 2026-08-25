/**
 * Checks for post-defeat expert learning and in-game visibility fog.
 * Run with: npx tsx scripts/check-ai-learn-defeat.ts
 */
import { startNewGame, type GameState, type PlayerProfile } from '../src/game/deal'
import type { Card, Rank, Suit } from '../src/game/cards'
import {
  analyzeDefeatFromEpisode,
  assertPublicStateHidesOtherHands,
  clearEpisode,
  getLearnedPreferences,
  learningStrength,
  resetAiLessons,
  setEpisodeStatesForTest,
} from '../src/game/ai/learning'
import { buildAiPublicState } from '../src/game/ai/publicState'
import { pickDiscardCard, planInitialMeld } from '../src/game/ai/strategy'

function card(rank: Rank, suit: Suit, id: string): Card {
  return { id, rank, suit, deckIndex: 0 }
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

const profiles: PlayerProfile[] = [
  {
    seatIndex: 0,
    name: 'You',
    age: 30,
    isHuman: true,
    teamId: 0,
    avatar: '🙂',
    aiDifficulty: null,
  },
  {
    seatIndex: 1,
    name: 'Alex',
    age: 28,
    isHuman: false,
    teamId: 1,
    avatar: '🤖',
    aiDifficulty: 'expert',
  },
  {
    seatIndex: 2,
    name: 'Morgan',
    age: 28,
    isHuman: false,
    teamId: 0,
    avatar: '🤖',
    aiDifficulty: 'expert',
  },
  {
    seatIndex: 3,
    name: 'Sam',
    age: 28,
    isHuman: false,
    teamId: 1,
    avatar: '🤖',
    aiDifficulty: 'expert',
  },
]

resetAiLessons()
clearEpisode()

const base = startNewGame(profiles, 4)

/* --- Visibility: public state never exposes partner/opponent cards --- */
{
  assertPublicStateHidesOtherHands(base, 1)
  const pub = buildAiPublicState(base, 1)
  const partner = base.players[3]!
  const partnerIds = new Set([...partner.hand, ...partner.foot].map((c) => c.id))
  const leaked = pub.myHand.some((c) => partnerIds.has(c.id))
  assert(!leaked, 'expert AI public hand does not include partner cards')
  assert(
    pub.otherPlayers.every((p) => typeof p.handCount === 'number'),
    'other players expose counts only',
  )
  assert(
    pub.allTableBooks.length === base.teams.flatMap((t) => t.books).length,
    'table books are visible',
  )
}

/* --- Discard learning: feeding opponent ranks is avoided after lessons --- */
{
  resetAiLessons()
  const hand = [
    card('A', 'hearts', 'a1'),
    card('5', 'clubs', '5c'),
  ]
  const before: GameState = {
    ...base,
    phase: 'playing',
    turnPhase: 'play',
    currentPlayerIndex: 1,
    players: base.players.map((p, i) =>
      i === 1 ? { ...p, hand: [...hand], foot: [], isPlayingFoot: true } : p,
    ),
    teams: base.teams.map((t) =>
      t.id === 0
        ? {
            ...t,
            books: [
              {
                id: 'opp-5',
                rank: '5',
                cards: [
                  card('5', 'hearts', '5h'),
                  card('5', 'diamonds', '5d'),
                  card('5', 'spades', '5s'),
                ],
                teamId: 0,
                startedBySeatIndex: 0,
              },
            ],
          }
        : t,
    ),
  }
  const after: GameState = {
    ...before,
    discard: [...before.discard, hand[1]!],
    players: before.players.map((p, i) =>
      i === 1 ? { ...p, hand: [hand[0]!] } : p,
    ),
    currentPlayerIndex: 2,
  }
  const end: GameState = {
    ...after,
    phase: 'roundEnd',
    wentOutTeamId: 0,
    roundScores: { 0: 200, 1: -40 },
  }

  setEpisodeStatesForTest([before, after, end])
  const lesson = analyzeDefeatFromEpisode([before, after, end], 1)
  assert(!!lesson, 'defeat analysis produces a lesson')
  assert(
    (lesson?.findings.length ?? 0) > 0 || getLearnedPreferences().sampleSize > 0,
    'lesson tallies update after defeat',
  )

  const prefs = getLearnedPreferences()
  assert(prefs.defeatsAnalyzed >= 1, 'defeatsAnalyzed increments')
  assert(
    learningStrength(prefs.sampleSize, 'expert', prefs.defeatsAnalyzed) > 0.2,
    'expert learning strength meaningful after one defeat',
  )

  /* Fewer repeats needed with turbo tally multiplier. */
  for (let i = 0; i < 4; i++) {
    const taggedEnd: GameState = { ...end, roundNumber: end.roundNumber + i + 1 }
    analyzeDefeatFromEpisode([before, after, taggedEnd], 1)
  }
  const strong = getLearnedPreferences()
  assert(strong.avoidFeedingOpponents > 0.55, 'avoidFeedingOpponents rises after fed discards')

  const discardId = pickDiscardCard(
    hand,
    [],
    'expert',
    false,
    ['5'],
  )
  assert(discardId !== '5c', 'after lessons, expert avoids feeding opponent 5s')
}

/* --- Opening meld still works with learning knobs --- */
{
  const hand = [
    card('A', 'hearts', 'a1'),
    card('A', 'spades', 'a2'),
    card('A', 'clubs', 'a3'),
    card('A', 'diamonds', 'a4'),
    card('A', 'hearts', 'a5'),
  ]
  const plan = planInitialMeld(hand, [], 100, 'medium', 'expert')
  assert(!!plan, 'learned prefs do not break five-ace open at 100')
}

resetAiLessons()
clearEpisode()

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\ncheck-ai-learn-defeat: all assertions passed')
