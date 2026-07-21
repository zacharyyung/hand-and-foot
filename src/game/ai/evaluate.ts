import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import {
  bookWildCount,
  isCleanBook,
  isDirtyBook,
  teamHasCleanAndDirtyBooks,
} from '../books'
import {
  cardPointValue,
  heldCardPenalty,
  sumCardPoints,
  teamBoardPoints,
  WINNING_SCORE,
} from '../scoring'
import type { AiPublicState } from './publicState'
import {
  buildCardBeliefs,
  expectedStockDrawValue,
  type CardBeliefs,
} from './beliefs'

function teamHasCompletedCleanBook(books: Book[]): boolean {
  return books.some((b) => b.cards.length >= 7 && isCleanBook(b))
}

function teamHasCompletedDirtyBook(books: Book[]): boolean {
  return books.some((b) => b.cards.length >= 7 && isDirtyBook(b))
}

function teamNeedsCleanBook(books: Book[]): boolean {
  return !books.some((b) => b.cards.length >= 3 && isCleanBook(b))
}

function teamNeedsDirtyBook(books: Book[]): boolean {
  return !books.some((b) => b.cards.length >= 3 && isDirtyBook(b))
}

/**
 * Linear value function in the spirit of TD / RL evaluation networks:
 * handcrafted features with tuned weights, scored from the acting team's view.
 */
export interface EvalFeatures {
  boardPoints: number
  completedCleanBonus: number
  completedDirtyBonus: number
  cleanProgress: number
  dirtyProgress: number
  goOutReady: number
  handStructure: number
  wildCapital: number
  heldPenalty: number
  footProgress: number
  racePressure: number
  stockPressure: number
  drawExpectation: number
  thresholdGap: number
  partnerSupport: number
  winningProximity: number
}

export interface PositionEval {
  score: number
  features: EvalFeatures
}

const W = {
  board: 1.0,
  completedClean: 320,
  completedDirty: 140,
  cleanProgress: 28,
  dirtyProgress: 18,
  goOutReady: 220,
  handStructure: 1.0,
  wildCapital: 1.0,
  heldPenalty: -1.15,
  footProgress: 1.0,
  racePressure: 1.0,
  stockPressure: 1.0,
  drawExpectation: 0.55,
  thresholdGap: -1.4,
  partnerSupport: 1.0,
  winningProximity: 0.08,
} as const

function rankGroups(hand: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>()
  for (const card of hand) {
    if (isRedThree(card) || isWildCard(card)) continue
    const list = groups.get(card.rank) ?? []
    list.push(card)
    groups.set(card.rank, list)
  }
  return groups
}

function bookProgressValue(books: Book[]): { clean: number; dirty: number } {
  let clean = 0
  let dirty = 0
  for (const book of books) {
    const size = Math.min(book.cards.length, 7)
    const progress = size / 7
    if (isCleanBook(book)) {
      // Clean books approaching 7 are extremely valuable (300 bonus).
      clean += progress * progress * (size >= 7 ? 1.2 : 1)
      if (size === 6) clean += 0.45
      if (size === 5) clean += 0.2
    } else {
      dirty += progress * (size >= 7 ? 1.1 : 1)
      if (size === 6) dirty += 0.25
      // Prefer dirty books that still have wild slots when we hold wilds.
      if (bookWildCount(book) < 2) dirty += 0.08
    }
  }
  return { clean, dirty }
}

function handStructureValue(hand: Card[], teamBooks: Book[]): number {
  const groups = rankGroups(hand)
  const teamRanks = new Set(teamBooks.map((b) => b.rank))
  let value = 0

  for (const [rank, cards] of groups) {
    const n = cards.length
    const pts = sumCardPoints(cards)
    if (teamRanks.has(rank)) {
      // Already-booked ranks should be melded, not hoarded — treat as liability.
      value -= n * 26 + pts * 0.5
      continue
    }
    if (n >= 3) value += 55 + n * 12 + pts * 0.25
    else if (n === 2) value += 28 + pts * 0.2
    else value += -6 + Math.min(pts, 20) * 0.05 // orphan singles are liabilities
  }

  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  const jokers = wilds.filter((c) => c.rank === 'Joker').length
  const deuces = wilds.length - jokers
  value += jokers * 42 + deuces * 18

  // Extra pressure to park wilds when a dirty slot exists.
  const dirtySlots = teamBooks.filter(
    (b) => !isCleanBook(b) && bookWildCount(b) < 2,
  ).length
  if (dirtySlots > 0 && wilds.length > 0) {
    value -= Math.min(wilds.length, dirtySlots) * 20
  }

  const redThrees = hand.filter(isRedThree).length
  value -= redThrees * 280

  return value
}

function wildCapitalValue(hand: Card[], teamBooks: Book[]): number {
  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  if (wilds.length === 0) return 0

  const dirtySlots = teamBooks.filter(
    (b) => !isCleanBook(b) && bookWildCount(b) < 2 && b.cards.length < 7,
  ).length
  const needsDirty = teamNeedsDirtyBook(teamBooks)
  let value = 0
  for (const wild of wilds) {
    const base = wild.rank === 'Joker' ? 48 : 22
    if (dirtySlots > 0) value += base + 12
    else if (needsDirty) value += base * 0.7
    else value += base * 0.35
  }
  return value
}

function footProgressValue(pub: AiPublicState): number {
  let value = 0
  if (pub.isPlayingFoot) {
    value += 110
    value += Math.max(0, 14 - pub.myHand.length) * 12
    if (pub.myHand.length <= 3) value += 55
    if (pub.myHand.length === 1) value += 80
  } else {
    // Strong incentive to empty the hand and pick up the foot.
    value += Math.max(0, 12 - pub.myHand.length) * 10
    if (pub.myHand.length <= 3) value += 45
    if (pub.myHand.length <= 1) value += 70
  }
  return value
}

function racePressureValue(pub: AiPublicState): number {
  const opponents = pub.otherPlayers.filter((p) => p.teamId !== pub.myTeamId)
  const partners = pub.otherPlayers.filter((p) => p.teamId === pub.myTeamId)
  const goOutReady = teamHasCleanAndDirtyBooks(pub.myTeamBooks) && pub.teamMeldThresholdMet

  let pressure = 0
  for (const opp of opponents) {
    const held = opp.handCount + opp.footCount
    if (opp.isPlayingFoot && opp.footCount === 0 && opp.handCount <= 3) {
      pressure -= goOutReady ? 30 : 120
    } else if (held <= 5) {
      pressure -= goOutReady ? 10 : 55
    } else if (held <= 8) {
      pressure -= 18
    }
  }

  for (const partner of partners) {
    const held = partner.handCount + partner.footCount
    if (partner.isPlayingFoot && partner.footCount === 0 && partner.handCount <= 3) {
      pressure += goOutReady ? 70 : 25
    } else if (held <= 6 && partner.isPlayingFoot) {
      pressure += 20
    }
  }

  return pressure
}

function stockPressureValue(pub: AiPublicState): number {
  const held = pub.myHand.length + pub.myFootCount
  if (pub.stockCount <= 12 && held >= 10) return -70
  if (pub.stockCount <= 20 && held >= 12) return -40
  if (pub.stockCount <= 35 && held >= 16) return -22
  return 0
}

function partnerSupportValue(pub: AiPublicState): number {
  const partners = pub.otherPlayers.filter((p) => p.teamId === pub.myTeamId)
  if (partners.length === 0) return 0
  let value = 0
  for (const partner of partners) {
    // Partner still buried in hand with a big pile — keep building board.
    if (!partner.isPlayingFoot && partner.handCount >= 9) value += 12
    if (partner.isPlayingFoot && partner.handCount <= 4) value += 18
  }
  return value
}

/**
 * Evaluate a public position for the acting AI.
 * Higher is better for that AI's team.
 */
export function evaluatePosition(
  pub: AiPublicState,
  playerCount: number,
  beliefs?: CardBeliefs,
): PositionEval {
  const model = beliefs ?? buildCardBeliefs(pub, playerCount)
  const books = pub.myTeamBooks
  const progress = bookProgressValue(books)
  const completedClean = teamHasCompletedCleanBook(books) ? 1 : 0
  const completedDirty = teamHasCompletedDirtyBook(books) ? 1 : 0
  const goOutReady =
    pub.teamMeldThresholdMet && teamHasCleanAndDirtyBooks(books) ? 1 : 0

  const required = pub.requiredMeld
  const thresholdGap = pub.teamMeldThresholdMet
    ? 0
    : Math.max(0, required - pub.meldPointsThisTurn)

  const board = teamBoardPoints(books)
  const held = heldCardPenalty(pub.myHand)
  // Foot contents are hidden — approximate remaining foot penalty from count.
  const footEstimate = pub.isPlayingFoot ? 0 : pub.myFootCount * 8

  const features: EvalFeatures = {
    boardPoints: board,
    completedCleanBonus: completedClean,
    completedDirtyBonus: completedDirty,
    cleanProgress: progress.clean,
    dirtyProgress: progress.dirty,
    goOutReady,
    handStructure: handStructureValue(pub.myHand, books),
    wildCapital: wildCapitalValue(pub.myHand, books),
    heldPenalty: held + footEstimate,
    footProgress: footProgressValue(pub),
    racePressure: racePressureValue(pub),
    stockPressure: stockPressureValue(pub),
    drawExpectation: expectedStockDrawValue(model, 2),
    thresholdGap,
    partnerSupport: partnerSupportValue(pub),
    winningProximity: Math.min(pub.teamScore, WINNING_SCORE),
  }

  // Soft bonuses when we still need a clean/dirty book type on the table.
  let needBias = 0
  if (teamNeedsCleanBook(books)) needBias -= 40
  if (teamNeedsDirtyBook(books)) needBias -= 25

  const score =
    features.boardPoints * W.board +
    features.completedCleanBonus * W.completedClean +
    features.completedDirtyBonus * W.completedDirty +
    features.cleanProgress * W.cleanProgress +
    features.dirtyProgress * W.dirtyProgress +
    features.goOutReady * W.goOutReady +
    features.handStructure * W.handStructure +
    features.wildCapital * W.wildCapital +
    features.heldPenalty * W.heldPenalty +
    features.footProgress * W.footProgress +
    features.racePressure * W.racePressure +
    features.stockPressure * W.stockPressure +
    features.drawExpectation * W.drawExpectation +
    features.thresholdGap * W.thresholdGap +
    features.partnerSupport * W.partnerSupport +
    features.winningProximity * W.winningProximity +
    needBias

  return { score, features }
}

/** Quick hand-only structure score used when comparing initial-meld leftovers. */
export function evaluateLeftoverHand(hand: Card[], teamBooks: Book[]): number {
  return (
    handStructureValue(hand, teamBooks) +
    wildCapitalValue(hand, teamBooks) -
    heldCardPenalty(hand) * 1.1
  )
}

/** Marginal book quality for a prospective start (clean preferred). */
export function evaluateStartQuality(
  cards: Card[],
  clean: boolean,
  urgency: 'low' | 'medium' | 'high',
  needsClean: boolean,
  needsDirty: boolean,
): number {
  let score = sumCardPoints(cards) + (cards.length >= 7 ? (clean ? 300 : 100) : 0)
  if (clean) {
    score += urgency === 'low' ? 55 : urgency === 'medium' ? 35 : 18
    if (needsClean) score += 40
  } else {
    score -= urgency === 'low' ? 70 : urgency === 'medium' ? 40 : 12
    if (needsDirty) score += 45
    else score -= 50
  }
  return score
}

export function cardRetainValue(card: Card, hand: Card[], teamBooks: Book[]): number {
  if (isRedThree(card)) return -400
  if (isWildCard(card)) {
    return card.rank === 'Joker' ? 90 : 45
  }
  const same = hand.filter((c) => c.rank === card.rank && !isWildCard(c) && !isRedThree(c))
  const onBook = teamBooks.some((b) => b.rank === card.rank)
  let value = cardPointValue(card) * 0.2
  if (onBook) value += 35
  if (same.length >= 3) value += 40
  else if (same.length === 2) value += 25
  else value -= 8
  return value
}
