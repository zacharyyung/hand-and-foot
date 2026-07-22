import type { Card } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import type { GameState } from '../deal'
import { getTeam } from '../actions'
import { cardPointValue, meldContributionFromCards } from '../scoring'

const LEARNING_KEY = 'hand-and-foot-ai-learning'
const LEARNING_VERSION = 1

/** Rolling tallies of how humans (and all players) actually play. */
export interface AiLearningMemory {
  version: number
  gamesObserved: number
  roundsObserved: number
  transitionsObserved: number
  human: MoveTallies
  allPlayers: MoveTallies
  updatedAt: number
}

interface MoveTallies {
  initialMelds: number
  initialMeldBooks: number
  initialMeldCleanBooks: number
  initialMeldDirtyBooks: number
  initialMeldCardTotal: number
  initialMeldPointTotal: number
  /** Books with 4+ cards on the opening meld. */
  initialLargeBooks: number
  /** Opening melds while stock still had plenty of cards (early round). */
  earlyRoundInitialMelds: number
  bookStarts: number
  cleanBookStarts: number
  dirtyBookStarts: number
  largeBookStarts: number
  adds: number
  naturalAdds: number
  wildAdds: number
  completingAdds: number
  discards: number
  discardFromPairOrBetter: number
  discardOntoTeamRank: number
  discardHighPoint: number
  discardLowPoint: number
}

export interface LearnedPreferences {
  /** Push to lay the opening meld as soon as it is legal. */
  earlyMeldAggressiveness: number
  /** Prefer clean books over dirty. */
  cleanBias: number
  /** Prefer starting with 4–7 card books when points allow. */
  largeBookBias: number
  /** Avoid discarding from pairs / triples. */
  protectPairs: number
  /** Prefer adding to existing books before starting new ones. */
  buildExistingBias: number
  sampleSize: number
}

function emptyTallies(): MoveTallies {
  return {
    initialMelds: 0,
    initialMeldBooks: 0,
    initialMeldCleanBooks: 0,
    initialMeldDirtyBooks: 0,
    initialMeldCardTotal: 0,
    initialMeldPointTotal: 0,
    initialLargeBooks: 0,
    earlyRoundInitialMelds: 0,
    bookStarts: 0,
    cleanBookStarts: 0,
    dirtyBookStarts: 0,
    largeBookStarts: 0,
    adds: 0,
    naturalAdds: 0,
    wildAdds: 0,
    completingAdds: 0,
    discards: 0,
    discardFromPairOrBetter: 0,
    discardOntoTeamRank: 0,
    discardHighPoint: 0,
    discardLowPoint: 0,
  }
}

function emptyMemory(): AiLearningMemory {
  return {
    version: LEARNING_VERSION,
    gamesObserved: 0,
    roundsObserved: 0,
    transitionsObserved: 0,
    human: emptyTallies(),
    allPlayers: emptyTallies(),
    updatedAt: Date.now(),
  }
}

let cached: AiLearningMemory | null = null

export function loadAiLearning(): AiLearningMemory {
  if (cached) return cached
  try {
    const raw = localStorage.getItem(LEARNING_KEY)
    if (!raw) {
      cached = emptyMemory()
      return cached
    }
    const parsed = JSON.parse(raw) as AiLearningMemory
    if (!parsed || parsed.version !== LEARNING_VERSION) {
      cached = emptyMemory()
      return cached
    }
    cached = {
      ...emptyMemory(),
      ...parsed,
      human: { ...emptyTallies(), ...parsed.human },
      allPlayers: { ...emptyTallies(), ...parsed.allPlayers },
    }
    return cached
  } catch {
    cached = emptyMemory()
    return cached
  }
}

export function saveAiLearning(memory: AiLearningMemory): void {
  cached = { ...memory, updatedAt: Date.now() }
  try {
    localStorage.setItem(LEARNING_KEY, JSON.stringify(cached))
  } catch {
    // ignore quota / private mode
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function ratio(num: number, den: number, fallback: number): number {
  if (den <= 0) return fallback
  return clamp01(num / den)
}

/**
 * Turn observed tallies into strategy knobs.
 * Human play is weighted more heavily than overall table play.
 */
export function getLearnedPreferences(
  memory: AiLearningMemory = loadAiLearning(),
): LearnedPreferences {
  const h = memory.human
  const a = memory.allPlayers
  const sampleSize = h.initialMelds + h.bookStarts + h.adds + h.discards

  const blend = (humanVal: number, allVal: number, humanN: number, allN: number) => {
    if (humanN + allN === 0) return (humanVal + allVal) / 2
    const hw = humanN * 2
    const aw = allN
    return (humanVal * hw + allVal * aw) / (hw + aw)
  }

  const humanClean =
    h.initialMeldCleanBooks + h.cleanBookStarts
  const humanDirty =
    h.initialMeldDirtyBooks + h.dirtyBookStarts
  const allClean = a.initialMeldCleanBooks + a.cleanBookStarts
  const allDirty = a.initialMeldDirtyBooks + a.dirtyBookStarts

  const cleanBias = blend(
    ratio(humanClean, humanClean + humanDirty, 0.65),
    ratio(allClean, allClean + allDirty, 0.6),
    humanClean + humanDirty,
    allClean + allDirty,
  )

  const largeBookBias = blend(
    ratio(
      h.initialLargeBooks + h.largeBookStarts,
      Math.max(1, h.initialMeldBooks + h.bookStarts),
      0.45,
    ),
    ratio(
      a.initialLargeBooks + a.largeBookStarts,
      Math.max(1, a.initialMeldBooks + a.bookStarts),
      0.4,
    ),
    h.initialMeldBooks + h.bookStarts,
    a.initialMeldBooks + a.bookStarts,
  )

  const earlyMeldAggressiveness = blend(
    ratio(h.earlyRoundInitialMelds, Math.max(1, h.initialMelds), 0.75),
    ratio(a.earlyRoundInitialMelds, Math.max(1, a.initialMelds), 0.7),
    h.initialMelds,
    a.initialMelds,
  )

  const protectPairs = blend(
    1 - ratio(h.discardFromPairOrBetter, Math.max(1, h.discards), 0.25),
    1 - ratio(a.discardFromPairOrBetter, Math.max(1, a.discards), 0.3),
    h.discards,
    a.discards,
  )

  const buildExistingBias = blend(
    ratio(h.adds, Math.max(1, h.adds + h.bookStarts), 0.55),
    ratio(a.adds, Math.max(1, a.adds + a.bookStarts), 0.5),
    h.adds + h.bookStarts,
    a.adds + a.bookStarts,
  )

  return {
    earlyMeldAggressiveness: clamp01(earlyMeldAggressiveness),
    cleanBias: clamp01(cleanBias),
    largeBookBias: clamp01(largeBookBias),
    protectPairs: clamp01(protectPairs),
    buildExistingBias: clamp01(buildExistingBias),
    sampleSize,
  }
}

function bookIsClean(cards: Card[]): boolean {
  return cards.every((c) => !isWildCard(c))
}

function recordBookStart(tallies: MoveTallies, cards: Card[], isInitial: boolean) {
  const clean = bookIsClean(cards)
  if (isInitial) {
    tallies.initialMeldBooks += 1
    if (clean) tallies.initialMeldCleanBooks += 1
    else tallies.initialMeldDirtyBooks += 1
    tallies.initialMeldCardTotal += cards.length
    tallies.initialMeldPointTotal += meldContributionFromCards(cards)
    if (cards.length >= 4) tallies.initialLargeBooks += 1
  } else {
    tallies.bookStarts += 1
    if (clean) tallies.cleanBookStarts += 1
    else tallies.dirtyBookStarts += 1
    if (cards.length >= 4) tallies.largeBookStarts += 1
  }
}

function recordAdd(tallies: MoveTallies, cards: Card[], prevLen: number) {
  tallies.adds += 1
  const wilds = cards.filter(isWildCard).length
  if (wilds > 0) tallies.wildAdds += 1
  if (cards.length > wilds) tallies.naturalAdds += 1
  if (prevLen < 7 && prevLen + cards.length >= 7) tallies.completingAdds += 1
}

function recordDiscard(
  tallies: MoveTallies,
  card: Card,
  handBefore: Card[],
  teamBooks: Book[],
) {
  tallies.discards += 1
  const points = cardPointValue(card)
  if (points >= 20) tallies.discardHighPoint += 1
  else if (points <= 5) tallies.discardLowPoint += 1

  if (!isWildCard(card) && !isRedThree(card)) {
    const sameRank = handBefore.filter(
      (c) => c.rank === card.rank && !isWildCard(c) && !isRedThree(c),
    ).length
    if (sameRank >= 2) tallies.discardFromPairOrBetter += 1
    if (teamBooks.some((b) => b.rank === card.rank)) {
      tallies.discardOntoTeamRank += 1
    }
  }
}

function findSeatThatActed(prev: GameState, next: GameState): number | null {
  // Discard advances the seat; meld plays keep the same current player.
  if (prev.currentPlayerIndex !== next.currentPlayerIndex) {
    return prev.currentPlayerIndex
  }
  if (prev.turnPhase !== next.turnPhase || prev.meldPointsThisTurn !== next.meldPointsThisTurn) {
    return prev.currentPlayerIndex
  }
  // Books changed on someone's team while same seat — that seat acted.
  for (let i = 0; i < prev.players.length; i++) {
    const before = prev.players[i]!
    const after = next.players[i]!
    if (before.hand.length !== after.hand.length || before.foot.length !== after.foot.length) {
      return i
    }
  }
  return prev.currentPlayerIndex
}

function newBooksForTeam(prevBooks: Book[], nextBooks: Book[]): Book[] {
  const prevIds = new Set(prevBooks.map((b) => b.id))
  return nextBooks.filter((b) => !prevIds.has(b.id))
}

function cardsAddedToBook(prev: Book | undefined, next: Book): Card[] {
  if (!prev) return next.cards
  const prevIds = new Set(prev.cards.map((c) => c.id))
  return next.cards.filter((c) => !prevIds.has(c.id))
}

/**
 * Study a state transition from any seat (human or AI) and update memory.
 * Safe to call on every game update — no-ops when nothing meld/discard-like happened.
 */
export function observeGameTransition(prev: GameState, next: GameState): void {
  if (prev === next) return
  if (prev.phase === 'playing' && next.phase === 'roundEnd') {
    const memory = loadAiLearning()
    memory.roundsObserved += 1
    saveAiLearning(memory)
  }
  if (prev.phase !== 'gameOver' && next.phase === 'gameOver') {
    const memory = loadAiLearning()
    memory.gamesObserved += 1
    saveAiLearning(memory)
  }
  if (prev.phase !== 'playing' || next.phase !== 'playing') return

  const seat = findSeatThatActed(prev, next)
  if (seat == null) return
  const player = prev.players[seat]
  if (!player) return

  const isHuman = player.profile.isHuman
  const memory = loadAiLearning()
  const targets = isHuman
    ? [memory.human, memory.allPlayers]
    : [memory.allPlayers]

  const prevTeam = getTeam(prev, player.profile.teamId)
  const nextTeam = getTeam(next, player.profile.teamId)
  const started = newBooksForTeam(prevTeam.books, nextTeam.books)
  const wasInitial =
    !prevTeam.meldThresholdMet &&
    (nextTeam.meldThresholdMet || started.length > 0) &&
    prev.meldPointsThisTurn === 0

  let learnedSomething = false

  if (started.length > 0) {
    learnedSomething = true
    for (const tallies of targets) {
      if (wasInitial) {
        tallies.initialMelds += 1
        // Stock still high ⇒ early in the round.
        if (prev.stock.length >= 40) tallies.earlyRoundInitialMelds += 1
      }
      for (const book of started) {
        recordBookStart(tallies, book.cards, wasInitial)
      }
    }
  }

  for (const nextBook of nextTeam.books) {
    const prevBook = prevTeam.books.find((b) => b.id === nextBook.id)
    if (!prevBook) continue
    if (nextBook.cards.length <= prevBook.cards.length) continue
    const added = cardsAddedToBook(prevBook, nextBook)
    if (added.length === 0) continue
    learnedSomething = true
    for (const tallies of targets) {
      recordAdd(tallies, added, prevBook.cards.length)
    }
  }

  // Discard: discard pile grew and hand shrank for the acting seat.
  if (next.discard.length > prev.discard.length) {
    const discarded = next.discard[next.discard.length - 1]
    if (discarded) {
      const handBefore =
        prev.players[seat]!.hand.length > 0
          ? prev.players[seat]!.hand
          : prev.players[seat]!.foot
      learnedSomething = true
      for (const tallies of targets) {
        recordDiscard(tallies, discarded, handBefore, prevTeam.books)
      }
    }
  }

  if (learnedSomething) {
    memory.transitionsObserved += 1
    saveAiLearning(memory)
  }
}

/** Test helper — reset in-memory + storage learning. */
export function resetAiLearning(): void {
  cached = emptyMemory()
  try {
    localStorage.removeItem(LEARNING_KEY)
  } catch {
    // ignore
  }
}

export function learningStrength(sampleSize: number, difficulty: 'normal' | 'expert'): number {
  // Ramp from 0 → 1 as we see more human-like samples.
  const ramp = clamp01(sampleSize / 40)
  return difficulty === 'expert' ? ramp : ramp * 0.45
}
