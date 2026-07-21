import type { Card, Rank } from '../cards'
import { createDecks, isRedThree } from '../cards'
import type { Book } from '../books'
import type { AiPublicState } from './publicState'
import { cardPointValue } from '../scoring'

/** Per-rank / wild counts for imperfect-information reasoning. */
export interface CardBeliefs {
  /** Cards of each natural rank still unseen (stock + hidden hands/feet). */
  remainingByRank: Map<Rank, number>
  remainingJokers: number
  remainingDeuces: number
  remainingRedThrees: number
  /** Total unseen cards (stock + opponents + partner + own foot if not playing). */
  unseenTotal: number
  stockCount: number
  /** Fraction of unseen cards that sit in the stock. */
  stockShare: number
}

const NATURAL_RANKS: Rank[] = [
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
]

function emptyRankMap(): Map<Rank, number> {
  const map = new Map<Rank, number>()
  for (const rank of NATURAL_RANKS) map.set(rank, 0)
  map.set('2', 0)
  map.set('Joker', 0)
  return map
}

function tallyCard(counts: Map<Rank, number>, card: Card): void {
  if (isRedThree(card)) {
    counts.set('3', (counts.get('3') ?? 0) + 1)
    return
  }
  counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
}

/** Full multi-deck composition for this seat count. */
export function totalDeckComposition(playerCount: number): Map<Rank, number> {
  const totals = emptyRankMap()
  for (const card of createDecks(playerCount)) {
    tallyCard(totals, card)
  }
  return totals
}

/**
 * Bayesian card-counting model from public information only.
 * Unseen mass is stock + every hidden pile (partner/opponents/own unopened foot).
 */
export function buildCardBeliefs(
  pub: AiPublicState,
  playerCount: number,
): CardBeliefs {
  const totals = totalDeckComposition(playerCount)
  const seen = emptyRankMap()

  for (const card of pub.myHand) tallyCard(seen, card)
  for (const book of pub.allTableBooks) {
    for (const card of book.cards) tallyCard(seen, card)
  }
  if (pub.discardTop) tallyCard(seen, pub.discardTop)

  // Discard below the top is unknown to players — treat as unseen (fair info).
  // Own unopened foot is also unseen.

  const remainingByRank = emptyRankMap()
  let remainingJokers = 0
  let remainingDeuces = 0
  let remainingRedThrees = 0
  let unseenTotal = 0

  for (const [rank, total] of totals) {
    const left = Math.max(0, total - (seen.get(rank) ?? 0))
    remainingByRank.set(rank, left)
    unseenTotal += left
    if (rank === 'Joker') remainingJokers = left
    else if (rank === '2') remainingDeuces = left
  }

  // Red 3s are counted inside rank '3' (2 red + 2 black per deck). Approximate:
  // each deck has 2 red 3s; we only know exact reds we've seen.
  const redThreesSeen =
    pub.myHand.filter(isRedThree).length +
    pub.allTableBooks.reduce(
      (n, b) => n + b.cards.filter(isRedThree).length,
      0,
    ) +
    (pub.discardTop && isRedThree(pub.discardTop) ? 1 : 0)
  remainingRedThrees = Math.max(0, playerCount * 2 - redThreesSeen)

  const stockCount = pub.stockCount
  const stockShare = unseenTotal > 0 ? Math.min(1, stockCount / unseenTotal) : 0

  return {
    remainingByRank,
    remainingJokers,
    remainingDeuces,
    remainingRedThrees,
    unseenTotal,
    stockCount,
    stockShare,
  }
}

/** P(next stock card is this natural rank | uniform over unseen). */
export function rankDrawProbability(beliefs: CardBeliefs, rank: Rank): number {
  if (beliefs.unseenTotal <= 0 || beliefs.stockCount <= 0) return 0
  const left = beliefs.remainingByRank.get(rank) ?? 0
  return (left / beliefs.unseenTotal) * beliefs.stockShare
}

/** Expected point value of drawing `n` cards from stock (independent approx). */
export function expectedStockDrawValue(beliefs: CardBeliefs, n = 2): number {
  if (beliefs.unseenTotal <= 0 || beliefs.stockCount <= 0) return 0

  let expectedOne = 0
  for (const [rank, count] of beliefs.remainingByRank) {
    if (count <= 0) continue
    const p = count / beliefs.unseenTotal
    const proxy: Card = {
      id: 'belief',
      rank,
      suit: rank === 'Joker' ? 'joker' : 'spades',
      deckIndex: 0,
    }
    // Red 3 risk is folded into rank-3 average as a soft penalty.
    let value = cardPointValue(proxy)
    if (rank === '3' && beliefs.remainingRedThrees > 0) {
      const redShare = beliefs.remainingRedThrees / Math.max(1, count)
      value = redShare * -300 + (1 - redShare) * 5
    }
    expectedOne += p * value
  }

  return expectedOne * Math.min(n, beliefs.stockCount)
}

/**
 * Soft estimate: how many copies of `rank` an average hidden pile of size `pileSize` holds.
 */
export function expectedCopiesInPile(
  beliefs: CardBeliefs,
  rank: Rank,
  pileSize: number,
): number {
  if (beliefs.unseenTotal <= 0 || pileSize <= 0) return 0
  const left = beliefs.remainingByRank.get(rank) ?? 0
  return (left / beliefs.unseenTotal) * pileSize
}

/** How "dead" a natural rank is for starting/continuing books. */
export function rankAvailability(
  beliefs: CardBeliefs,
  rank: Rank,
  teamBooks: Book[],
): number {
  if (teamBooks.some((b) => b.rank === rank)) return 0
  return beliefs.remainingByRank.get(rank) ?? 0
}

/** Prefer discarding ranks that are plentiful among opponents / scarce for us. */
export function discardFeedRisk(
  beliefs: CardBeliefs,
  rank: Rank,
  opponentCardCount: number,
): number {
  if (rank === '2' || rank === 'Joker') return 0
  const expectedOpp = expectedCopiesInPile(beliefs, rank, opponentCardCount)
  // Higher = more likely an opponent is collecting this rank.
  return expectedOpp
}
