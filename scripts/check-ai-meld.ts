/**
 * Sanity checks for initial-meld planning, including high thresholds.
 * Run with: npx tsx scripts/check-ai-meld.ts
 */
import { planInitialMeld } from '../src/game/ai/strategy'
import { meldContributionFromCards } from '../src/game/scoring'
import type { Card, Rank, Suit } from '../src/game/cards'

function card(rank: Rank, suit: Suit, id: string): Card {
  return { id, rank, suit, deckIndex: 0 }
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades', 'hearts', 'diamonds', 'clubs']

function ofRank(rank: Rank, n: number, prefix = rank): Card[] {
  return Array.from({ length: n }, (_, i) => card(rank, SUITS[i % SUITS.length]!, `${prefix}-${i}`))
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

function planPoints(hand: Card[], plan: string[][]): number {
  return plan.reduce((sum, ids) => {
    const cards = ids
      .map((id) => hand.find((c) => c.id === id))
      .filter((c): c is Card => Boolean(c))
    return sum + meldContributionFromCards(cards)
  }, 0)
}

// Five 10s = 50 — must meld alone for opening requirement
{
  const hand = ofRank('10', 5)
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(!!plan && plan.length >= 1, 'expert melds five 10s for 50')
  const totalCards = plan?.flat().length ?? 0
  assert(totalCards >= 5, `uses all five 10s (got ${totalCards})`)
}

// Three kings (30) + three fives (15) = 45 — still short
{
  const hand = [...ofRank('K', 3), ...ofRank('5', 3)]
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(plan === null, '45 points cannot meet 50 without more cards')
}

// Four kings (40) + three fives (15) = 55 — should meld
{
  const hand = [...ofRank('K', 4), ...ofRank('5', 3)]
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(!!plan && plan.length >= 2, 'four kings + three fives meets 50')
}

// Three aces + wild deuce = 80 — dirty book alone meets 50
{
  const hand = [...ofRank('A', 3), card('2', 'spades', '2s')]
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(!!plan && plan.length >= 1, 'dirty ace book meets opening 50')
}

// Five aces = 100 — must open at the 100-point threshold without waiting for partner
{
  const hand = ofRank('A', 5)
  for (const difficulty of ['normal', 'expert'] as const) {
    const plan = planInitialMeld(hand, [], 100, 'medium', difficulty)
    assert(!!plan, `${difficulty} opens with five aces for 100`)
    if (plan) {
      assert(planPoints(hand, plan) >= 100, `${difficulty} five-ace plan scores >= 100`)
    }
  }
}

// Seven aces = completed clean book (140 + 300) — clears 200
{
  const hand = ofRank('A', 7)
  const plan = planInitialMeld(hand, [], 200, 'high', 'expert')
  assert(!!plan, 'expert opens 200 with seven aces (completed clean book)')
  if (plan) {
    assert(planPoints(hand, plan) >= 200, 'seven-ace plan scores >= 200')
    assert(plan.some((book) => book.length >= 7), 'uses a completed book for 200')
  }
}

// Mixed high threshold: 4K (40) + 4Q (40) + 4J (40) = 120 → meet 100
{
  const hand = [...ofRank('K', 4), ...ofRank('Q', 4), ...ofRank('J', 4)]
  const plan = planInitialMeld(hand, [], 100, 'medium', 'expert')
  assert(!!plan && plan.length >= 2, 'expert opens 100 with K/Q/J fours')
  if (plan) {
    assert(planPoints(hand, plan) >= 100, 'K/Q/J plan scores >= 100')
  }
}

// 150: five aces (100) + five kings (50)
{
  const hand = [...ofRank('A', 5), ...ofRank('K', 5)]
  const plan = planInitialMeld(hand, [], 150, 'high', 'expert')
  assert(!!plan, 'expert opens 150 with five aces + five kings')
  if (plan) {
    assert(planPoints(hand, plan) >= 150, 'A/K plan scores >= 150')
  }
}

// Normal difficulty should also open at 100 with a strong hand (not leave it to partner)
{
  const hand = [...ofRank('A', 4), ...ofRank('K', 4), ...ofRank('10', 3)]
  // 80 + 40 + 30 = 150
  const plan = planInitialMeld(hand, [], 100, 'medium', 'normal')
  assert(!!plan, 'normal AI opens 100 with A/K/10 pile')
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`)
  process.exit(1)
}
console.log('\nAll checks passed.')
