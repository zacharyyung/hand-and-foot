/**
 * Quick sanity checks for initial-meld planning (run with: npx tsx scripts/check-ai-meld.ts)
 */
import { planInitialMeld } from '../src/game/ai/strategy'
import type { Card, Rank, Suit } from '../src/game/cards'

function card(rank: Rank, suit: Suit, id: string): Card {
  return { id, rank, suit, deckIndex: 0 }
}

function tens(n: number): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades', 'hearts', 'diamonds', 'clubs']
  return Array.from({ length: n }, (_, i) => card('10', suits[i]!, `10-${i}`))
}

function kings(n: number): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades', 'hearts', 'diamonds', 'clubs']
  return Array.from({ length: n }, (_, i) => card('K', suits[i]!, `K-${i}`))
}

function fives(n: number): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  return Array.from({ length: n }, (_, i) => card('5', suits[i]!, `5-${i}`))
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

// Five 10s = 50 — must meld alone for opening requirement
{
  const hand = tens(5)
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(!!plan && plan.length >= 1, 'expert melds five 10s for 50')
  const totalCards = plan?.flat().length ?? 0
  assert(totalCards >= 5, `uses all five 10s (got ${totalCards})`)
}

// Three kings (30) + three fives (15) = 45 — still short, may be null unless wild
{
  const hand = [...kings(3), ...fives(3)]
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(plan === null, '45 points cannot meet 50 without more cards')
}

// Four kings (40) + three fives (15) = 55 — should meld
{
  const hand = [...kings(4), ...fives(3)]
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(!!plan && plan.length >= 2, 'four kings + three fives meets 50')
}

// Three aces + wild deuce = 80 — dirty book alone meets 50
{
  const hand = [
    card('A', 'hearts', 'A1'),
    card('A', 'diamonds', 'A2'),
    card('A', 'clubs', 'A3'),
    card('2', 'spades', '2s'),
  ]
  const plan = planInitialMeld(hand, [], 50, 'medium', 'expert')
  assert(!!plan && plan.length >= 1, 'dirty ace book meets opening 50')
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`)
  process.exit(1)
}
console.log('\nAll checks passed.')
