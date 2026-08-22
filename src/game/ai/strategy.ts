import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import {
  bookWildCount,
  canAddToBook,
  canStartBook,
  countWildsInCards,
  isCleanBook,
  isDirtyBook,
  wouldDestroyOnlyCompletedCleanBook,
} from '../books'
import type { GameState } from '../deal'
import type { ChatMessage } from '../chat'
import { hasPartnerWildApprovalForBook, opponentTeamSignaledGoOut } from '../chat'
import { partnerGoOutSignaledInChat } from './chatSignals'
import { cardPointValue, meldThreshold, meldContributionFromCards } from '../scoring'
import { partnerSeat, type PlayerCount } from '../teams'
import type { AiDifficulty } from '../deal'
import type { AiPublicState } from './publicState'
import { footMeldAllowedForHand } from '../actions'
import { findAddToBookActions, findStartBookActions, type AiAction } from './decisions'
import {
  getLearnedPreferences,
  learningStrength,
  type LearnedPreferences,
} from './learning'

function learnedOrDefault(): LearnedPreferences {
  return getLearnedPreferences()
}

/** Human partner already said Yes to dirtying this specific book. */
function bookHasPartnerWildApproval(
  bookId: string,
  pub: AiPublicState,
  chatMessages: ChatMessage[],
  state?: GameState,
): boolean {
  if (!state) return false
  const partnerIdx = partnerSeat(pub.mySeatIndex, state.playerCount as PlayerCount)
  if (!state.players[partnerIdx]?.profile.isHuman) return false
  return hasPartnerWildApprovalForBook(
    chatMessages,
    pub.mySeatIndex,
    partnerIdx,
    bookId,
  )
}

function groupByRank(hand: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>()
  for (const card of hand) {
    if (isRedThree(card) || isWildCard(card)) continue
    const list = groups.get(card.rank) ?? []
    list.push(card)
    groups.set(card.rank, list)
  }
  return groups
}

function hasWilds(cards: Card[]): boolean {
  return cards.some(isWildCard)
}

interface StartOption {
  cardIds: string[]
  score: number
  rank: Rank
  clean: boolean
}

function footMeldKeepsDiscard(
  hand: Card[],
  meldCardIds: string[],
  isPlayingFoot: boolean,
  booksAfterMeld: Book[],
  meldThresholdMetAfterMeld: boolean,
): boolean {
  return footMeldAllowedForHand(
    hand,
    meldCardIds,
    isPlayingFoot,
    booksAfterMeld,
    meldThresholdMetAfterMeld,
  )
}

function pushStartOption(
  options: StartOption[],
  hand: Card[],
  teamBooks: Book[],
  combo: Card[],
  isPlayingFoot: boolean,
  meldThresholdMetAfterMeld: boolean,
): void {
  const cardIds = combo.map((c) => c.id)
  const check = canStartBook(combo, teamBooks)
  if (!check.ok) return
  const projectedBook: Book = {
    id: `preview-${check.rank}`,
    rank: check.rank,
    cards: combo,
    teamId: teamBooks[0]?.teamId ?? 0,
    startedBySeatIndex: 0,
  }
  if (
    !footMeldKeepsDiscard(
      hand,
      cardIds,
      isPlayingFoot,
      [...teamBooks, projectedBook],
      meldThresholdMetAfterMeld,
    )
  ) {
    return
  }
  options.push({
    cardIds,
    score: meldContributionFromCards(combo),
    rank: check.rank,
    clean: !hasWilds(combo),
  })
}

/**
 * Enumerate legal book starts per rank at every useful size (3–7), clean and
 * with one wild. Previously only the first 3-card combo was kept, which blocked
 * opening melds that need larger books to clear 100/150/200-point thresholds.
 */
function getStartOptions(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot = false,
  meldThresholdMetAfterMeld = true,
): StartOption[] {
  const options: StartOption[] = []
  const groups = groupByRank(hand)
  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  const takenRanks = new Set(teamBooks.map((b) => b.rank))

  for (const [rank, naturals] of groups) {
    if (takenRanks.has(rank)) continue

    const maxClean = Math.min(7, naturals.length)
    for (let size = 3; size <= maxClean; size++) {
      pushStartOption(
        options,
        hand,
        teamBooks,
        naturals.slice(0, size),
        isPlayingFoot,
        meldThresholdMetAfterMeld,
      )
    }

    if (wilds.length === 0 || naturals.length < 2) continue
    // One representative wild is enough — card IDs differ but scores do not.
    const wild = wilds[0]
    const maxNat = Math.min(6, naturals.length)
    for (let natCount = 2; natCount <= maxNat; natCount++) {
      const combo = [...naturals.slice(0, natCount), wild]
      if (combo.length > 7) continue
      pushStartOption(
        options,
        hand,
        teamBooks,
        combo,
        isPlayingFoot,
        meldThresholdMetAfterMeld,
      )
    }
  }

  return options
}

/** Keep a small set of sizes per rank so the initial-meld search stays fast. */
function compactStartOptions(options: StartOption[], required: number): StartOption[] {
  const byRank = new Map<Rank, StartOption[]>()
  for (const opt of options) {
    const list = byRank.get(opt.rank) ?? []
    list.push(opt)
    byRank.set(opt.rank, list)
  }

  const compacted: StartOption[] = []
  const seen = new Set<string>()

  function add(opt: StartOption | undefined) {
    if (!opt) return
    const key = opt.cardIds.slice().sort().join(',')
    if (seen.has(key)) return
    seen.add(key)
    compacted.push(opt)
  }

  for (const list of byRank.values()) {
    const clean = list.filter((o) => o.clean).sort((a, b) => b.score - a.score)
    const dirty = list.filter((o) => !o.clean).sort((a, b) => b.score - a.score)

    add(clean[0])
    add([...clean].sort((a, b) => a.cardIds.length - b.cardIds.length)[0])
    add(clean.find((o) => o.score >= required))
    add(clean.find((o) => o.cardIds.length === 4 || o.cardIds.length === 5))
    add(clean.find((o) => o.cardIds.length >= 7))

    add(dirty[0])
    add(dirty.find((o) => o.score >= required))
    add(dirty.find((o) => o.cardIds.length >= 7))
  }

  return compacted
}

/** Pick non-overlapping books that meet the meld point requirement. */
export function planInitialMeld(
  hand: Card[],
  teamBooks: Book[],
  required: number,
  urgency: 'low' | 'medium' | 'high',
  difficulty: AiDifficulty = 'normal',
  isPlayingFoot = false,
): string[][] | null {
  // After a successful initial meld the threshold is met for foot checks.
  const allOptions = getStartOptions(hand, teamBooks, isPlayingFoot, true)
  const options = compactStartOptions(allOptions, required)
  if (options.length === 0) return null

  const needsDirty = teamNeedsDirtyBook(teamBooks)
  const needsClean = teamNeedsCleanBook(teamBooks)
  const highRequirement = required >= 100

  const learned = learnedOrDefault()
  const strength = learningStrength(learned.sampleSize, difficulty)

  const scoreOption = (opt: StartOption) => {
    let s = opt.score
    const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length
    const sizeBonus = opt.cardIds.length >= 4 ? (opt.cardIds.length - 3) * 8 : 0

    if (difficulty === 'expert') {
      if (opt.clean) {
        s += urgency === 'low' ? 50 : urgency === 'medium' ? 35 : 20
        s += rankCount * 6
      } else {
        // At high opening requirements, dirty books are often necessary — don't over-penalize.
        const dirtyPenalty = highRequirement
          ? urgency === 'high'
            ? 4
            : 12
          : urgency === 'low'
            ? 50
            : urgency === 'medium'
              ? 25
              : 8
        s -= dirtyPenalty
        if (needsDirty) s += 18
        else if (!highRequirement) s -= 30
      }
      if (needsClean && opt.clean) s += 12
      if (urgency === 'high' || highRequirement) s += opt.score * 0.35
      // Prefer plans that clear the opening requirement in fewer, larger books.
      s += sizeBonus
      if (opt.score >= required) s += 80
      if (opt.cardIds.length >= 7) s += 40
      if (strength > 0) {
        if (opt.clean) s += learned.cleanBias * 40 * strength
        else s -= (1 - learned.cleanBias) * 25 * strength
        if (opt.cardIds.length >= 4) s += learned.largeBookBias * 30 * strength
        if (learned.earlyMeldAggressiveness > 0.55 && opt.score >= required * 0.6) {
          s += learned.earlyMeldAggressiveness * 35 * strength
        }
      }
    } else {
      if (opt.clean) {
        s += urgency === 'low' ? 25 : urgency === 'medium' ? 18 : 10
        s += rankCount * 4
      } else {
        s -= highRequirement ? (needsDirty ? 8 : 20) : needsDirty ? 15 : 50
        if (needsDirty) s += urgency === 'low' ? 12 : 8
      }
      if (needsClean && opt.clean) s += 15
      if (urgency === 'high' || highRequirement) s += opt.score * 0.35
      s += sizeBonus * 0.5
      if (opt.score >= required) s += 40
      if (opt.cardIds.length >= 7) s += 20
    }

    return s
  }

  const sorted = [...options].sort((a, b) => scoreOption(b) - scoreOption(a))
  // High thresholds and medium/high urgency need dirty stacks to actually get in.
  const allowDirtyStack = urgency !== 'low' || required <= 50 || highRequirement

  function dirtyBooksInPlan(chosen: string[][]): number {
    return chosen.filter((ids) =>
      ids.some((id) => {
        const card = hand.find((c) => c.id === id)
        return card && isWildCard(card)
      }),
    ).length
  }

  function search(
    index: number,
    used: Set<string>,
    chosen: string[][],
    points: number,
  ): string[][] | null {
    if (points >= required) return chosen
    if (index >= sorted.length) return null

    const opt = sorted[index]
    if (opt.cardIds.some((id) => used.has(id))) {
      return search(index + 1, used, chosen, points)
    }

    // Prefer including higher-scored options first so we actually open early.
    if (!(!opt.clean && dirtyBooksInPlan(chosen) >= 1 && !allowDirtyStack)) {
      const nextUsed = new Set(used)
      opt.cardIds.forEach((id) => nextUsed.add(id))
      const withOpt = search(
        index + 1,
        nextUsed,
        [...chosen, opt.cardIds],
        points + opt.score,
      )
      if (withOpt) return withOpt
    }

    return search(index + 1, used, chosen, points)
  }

  const plan = search(0, new Set(), [], 0)
  if (!plan) return null

  /*
   * After defeats that missed openings, expert skips the clean-only retry when
   * learned early-meld aggressiveness is high — get on the board first.
   */
  const preferOpenOverPurity =
    strength > 0.35 && learned.earlyMeldAggressiveness >= 0.7

  // Expert clean-only preference is only for early 50-point opens at low urgency.
  // At 100+ the AI must prioritize clearing the threshold over book purity.
  if (
    difficulty !== 'expert' ||
    urgency !== 'low' ||
    required > 50 ||
    preferOpenOverPurity
  ) {
    return plan
  }

  const cleanOnly = options.filter((o) => o.clean)
  if (cleanOnly.length > 0) {
    const cleanSorted = [...cleanOnly].sort((a, b) => scoreOption(b) - scoreOption(a))
    const cleanPlan = searchCleanOnly(cleanSorted, required)
    if (cleanPlan) return cleanPlan
  }

  return plan
}

function searchCleanOnly(
  sorted: StartOption[],
  required: number,
): string[][] | null {
  function search(
    index: number,
    used: Set<string>,
    chosen: string[][],
    points: number,
  ): string[][] | null {
    if (points >= required) return chosen
    if (index >= sorted.length) return null

    const opt = sorted[index]
    if (opt.cardIds.some((id) => used.has(id))) {
      return search(index + 1, used, chosen, points)
    }

    const nextUsed = new Set(used)
    opt.cardIds.forEach((id) => nextUsed.add(id))
    const withOpt = search(
      index + 1,
      nextUsed,
      [...chosen, opt.cardIds],
      points + opt.score,
    )
    if (withOpt) return withOpt

    return search(index + 1, used, chosen, points)
  }

  return search(0, new Set(), [], 0)
}

export function meldUrgency(teamScore: number): 'low' | 'medium' | 'high' {
  const req = meldThreshold(teamScore)
  if (req >= 150) return 'high'
  if (req >= 100) return 'medium'
  return 'low'
}

/** How hard the AI should push to meld — rises with meld limits, hand size, and a shrinking stock. */
export function meldPressure(pub: AiPublicState): 'low' | 'medium' | 'high' {
  let level = meldUrgency(pub.teamScore)
  const held = pub.myHand.length + pub.myFootCount
  const learned = learnedOrDefault()
  const strength = learningStrength(learned.sampleSize, 'expert')

  if (held >= 22) return 'high'
  if (held >= 18) level = 'high'
  else if (held >= 14 && level === 'low') level = 'medium'

  if (pub.stockCount <= 20 && held >= 8) level = 'high'
  else if (pub.stockCount <= 40 && held >= 10 && level === 'low') level = 'medium'

  if (!pub.teamMeldThresholdMet && pub.requiredMeld >= 100 && level === 'low') {
    level = 'medium'
  }
  if (!pub.teamMeldThresholdMet && pub.requiredMeld >= 150) {
    level = 'high'
  }
  // At 100+ with a full-ish hand, open aggressively — do not wait for partner.
  if (
    !pub.teamMeldThresholdMet &&
    pub.requiredMeld >= 100 &&
    held >= 12 &&
    level !== 'high'
  ) {
    level = 'high'
  }

  // Opening rounds (50-point meld): don't stall — treat as at least medium until in.
  if (!pub.teamMeldThresholdMet && pub.requiredMeld <= 50 && level === 'low') {
    level = 'medium'
  }

  if (pub.isPlayingFoot && pub.myFootCount >= 9 && level === 'low') {
    level = 'medium'
  }

  /* Learned from lost races: when opponents look light, push harder. */
  const opponentLight = pub.otherPlayers.some(
    (p) =>
      p.teamId !== pub.myTeamId &&
      p.handCount + p.footCount <= 6,
  )
  if (
    strength > 0.2 &&
    learned.raceUrgency >= 0.6 &&
    opponentLight &&
    level !== 'high'
  ) {
    level = level === 'low' ? 'medium' : 'high'
  }

  if (
    strength > 0.25 &&
    learned.earlyMeldAggressiveness >= 0.7 &&
    !pub.teamMeldThresholdMet &&
    level === 'low'
  ) {
    level = 'medium'
  }

  return level
}

/** Urgency used for initial meld planning — push harder as the threshold climbs. */
export function initialMeldUrgency(
  required: number,
  urgency: 'low' | 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  if (required >= 150) return 'high'
  if (required >= 100) return urgency === 'high' ? 'high' : 'medium'
  if (required <= 50) return urgency === 'high' ? 'high' : 'medium'
  return urgency
}

export function shouldRandomlySkipMeld(
  difficulty: AiDifficulty,
  urgency: 'low' | 'medium' | 'high',
  kind: 'add' | 'endTurn',
  teamMeldThresholdMet = true,
): boolean {
  if (!teamMeldThresholdMet) return false
  if (difficulty === 'expert' || urgency === 'high') return false
  if (kind === 'add') {
    return Math.random() < (urgency === 'low' ? 0.08 : 0.02)
  }
  return Math.random() < (urgency === 'low' ? 0.1 : 0.03)
}

export function teamNeedsDirtyBook(books: Book[]): boolean {
  return !books.some((b) => b.cards.length >= 3 && isDirtyBook(b))
}

export function teamNeedsCleanBook(books: Book[]): boolean {
  return !books.some((b) => b.cards.length >= 3 && isCleanBook(b))
}

export function teamHasCompletedCleanBook(books: Book[]): boolean {
  return books.some((b) => b.cards.length >= 7 && isCleanBook(b))
}

export function teamHasCompletedDirtyBook(books: Book[]): boolean {
  return books.some((b) => b.cards.length >= 7 && isDirtyBook(b))
}

/**
 * Point-aware score for dirtying a clean book with wilds.
 * Higher is better. Call only after justifyDirtyingCleanBook allows it.
 *
 * Priorities:
 * 1. Completing a 6-card book into a dirty (+100) — especially when needed to go out
 * 2. Dumping wilds onto the smallest incomplete clean books (least clean-bonus waste)
 * 3. Avoid dirtying large completed cleans (lose 200 from the 300→100 bonus)
 */
export function scoreWildOnCleanTarget(
  book: Book,
  cards: Card[],
  teamBooks: Book[],
  opts: {
    urgency: 'low' | 'medium' | 'high'
    canTeamGoOut: boolean
    nearGoOut: boolean
  },
): number {
  if (!isCleanBook(book) || countWildsInCards(cards) === 0) return 0

  const size = book.cards.length
  const newSize = size + cards.length
  const completes = newSize >= 7
  const otherCompletedClean = teamBooks.some(
    (b) => b.id !== book.id && b.cards.length >= 7 && isCleanBook(b),
  )
  const needsDirtyCompleted = !teamHasCompletedDirtyBook(teamBooks)

  let score = 0

  /* Completing a near-done book as dirty: bank the +100 bonus now. */
  if (size === 6 && completes) {
    score += 220
    if (needsDirtyCompleted && otherCompletedClean) score += 180
    if (opts.canTeamGoOut || opts.nearGoOut) score += 120
    if (opts.urgency === 'high') score += 40
    return score
  }

  /* Completing from 5 with multiple cards into dirty. */
  if (size === 5 && completes) {
    score += 90
    if (needsDirtyCompleted && otherCompletedClean) score += 100
    if (opts.canTeamGoOut || opts.nearGoOut) score += 60
  }

  /* Dirtying an already-completed clean burns 200 bonus points — last resort. */
  if (size >= 7) {
    score -= 250
    /* Bigger completed cleans are worse to dirty (more natural progress wasted). */
    score -= Math.min(size - 7, 6) * 35
    if (opts.urgency === 'high' && opts.nearGoOut) score += 40
    return score
  }

  /*
   * Dumping onto incomplete cleans: prefer the fewest cards so a short pile
   * becomes dirty instead of a nearly-clean book that was close to +300.
   */
  score += (6 - size) * 45
  if (opts.urgency === 'high') score += 20
  return score
}

function teammates(otherPlayers: AiPublicState['otherPlayers'], myTeamId: number) {
  return otherPlayers.filter((p) => p.teamId === myTeamId)
}

function opponents(otherPlayers: AiPublicState['otherPlayers'], myTeamId: number) {
  return otherPlayers.filter((p) => p.teamId !== myTeamId)
}

/** Partner is in foot with very few cards — team may be closing. */
function partnerNearGoOut(
  otherPlayers: AiPublicState['otherPlayers'],
  myTeamId: number,
  chatMessages: ChatMessage[] = [],
  state?: GameState,
): boolean {
  if (state && partnerGoOutSignaledInChat(chatMessages, state, myTeamId)) {
    return true
  }
  return teammates(otherPlayers, myTeamId).some(
    (p) => p.isPlayingFoot && p.footCount === 0 && p.handCount <= 3,
  )
}

/** Any opponent is low on cards — or signaled go-out in table chat. */
function opponentRacing(
  otherPlayers: AiPublicState['otherPlayers'],
  myTeamId: number,
  chatMessages: ChatMessage[] = [],
  playerCount?: PlayerCount,
): boolean {
  if (playerCount && opponentTeamSignaledGoOut(chatMessages, myTeamId, playerCount)) {
    return true
  }
  return opponents(otherPlayers, myTeamId).some((p) => p.handCount + p.footCount <= 5)
}

/** Can the wild(s) in hand go to an already-dirty book instead? */
export function hasAlternativeWildTarget(
  hand: Card[],
  teamBooks: Book[],
  targetCleanBookId: string,
  booksWithWildAddedThisTurn: string[],
): boolean {
  const wilds = hand.filter(isWildCard)
  if (wilds.length === 0) return true

  for (const book of teamBooks) {
    if (book.id === targetCleanBookId) continue
    if (bookWildCount(book) === 0) continue
    if (bookWildCount(book) >= 2) continue
    if (booksWithWildAddedThisTurn.includes(book.id)) continue

    for (const wild of wilds) {
      const check = canAddToBook(book, [wild], {
        wildAlreadyAddedThisTurn: booksWithWildAddedThisTurn.includes(book.id),
      })
      if (check.ok) return true
    }
  }

  return false
}

/**
 * Wild on a clean book costs a 300→100 bonus swing — only allow when dumping/endgame
 * or completing the team's required dirty book to go out.
 * Never destroy the only completed clean book (that breaks go-out).
 */
export function justifyDirtyingCleanBook(
  book: Book,
  cards: Card[],
  pub: AiPublicState,
  booksWithWildAddedThisTurn: string[],
  chatMessages: ChatMessage[] = [],
  state?: GameState,
): boolean {
  if (!isCleanBook(book)) return true
  if (countWildsInCards(cards) === 0) return true

  const books = pub.myTeamBooks
  /* Hard rule: keep go-out clean book intact unless another completed clean remains. */
  if (wouldDestroyOnlyCompletedCleanBook(book, cards, books)) return false

  /*
   * Partner already said Yes to dirtying this book — honor that consent even when
   * a same-rank natural or another dirty sink would otherwise score higher.
   */
  if (bookHasPartnerWildApproval(book.id, pub, chatMessages, state)) return true

  const urgency = meldPressure(pub)
  const heldCards = pub.myHand.length + pub.myFootCount
  const alternative = hasAlternativeWildTarget(
    pub.myHand,
    books,
    book.id,
    booksWithWildAddedThisTurn,
  )

  /* Prefer already-dirty books whenever they can take the wild. */
  if (alternative) return false

  const newSize = book.cards.length + cards.length
  const completes = newSize >= 7
  const otherCompletedClean = books.some(
    (b) => b.id !== book.id && b.cards.length >= 7 && isCleanBook(b),
  )
  const needsDirtyCompleted = !teamHasCompletedDirtyBook(books)
  const earlyRound = pub.teamScore <= 999 && urgency === 'low'
  const nearGoOut =
    partnerNearGoOut(pub.otherPlayers, pub.myTeamId, chatMessages, state) ||
    /* While playing foot, held cards live in hand — myFootCount mirrors hand size. */
    (pub.isPlayingFoot && pub.myHand.length <= 4)

  if (earlyRound) return false

  /*
   * Best case: finish a 5–6 card clean as a *new* dirty completion (+100) to unlock
   * go-out. Dirtying an already-completed clean (7+) is handled only as a dump last resort.
   */
  const completesForGoOut =
    completes &&
    otherCompletedClean &&
    needsDirtyCompleted &&
    book.cards.length >= 5 &&
    book.cards.length < 7

  if (completesForGoOut) {
    if (book.cards.length === 6) return true
    if (urgency !== 'low' || nearGoOut) return true
  }

  /* Urgency dumps are allowed only when another completed clean book remains. */
  if (!otherCompletedClean) return false

  /* Prefer dumping onto incomplete piles — never burn a big completed clean first. */
  const dumpingOntoSmallIncomplete = book.cards.length < 7
  const mustShedWilds =
    pub.myHand.length <= 4 &&
    pub.myHand.filter((c) => isWildCard(c) && !isRedThree(c)).length > 0

  /*
   * Near go-out with a spare completed clean: allow dumping onto an already-finished
   * clean so Yes can finish the round when the dirty sink is full. Must run before
   * urgency gates that return `dumpingOntoSmallIncomplete` (false for 7+ books).
   */
  if (nearGoOut && mustShedWilds && book.cards.length >= 7) {
    return true
  }

  if (
    dumpingOntoSmallIncomplete &&
    (nearGoOut || mustShedWilds) &&
    (urgency !== 'low' || pub.stockCount <= 25)
  ) {
    return true
  }

  if (
    urgency === 'high' &&
    heldCards <= 6 &&
    pub.myHand.length <= 3 &&
    partnerNearGoOut(pub.otherPlayers, pub.myTeamId, chatMessages, state)
  ) {
    return dumpingOntoSmallIncomplete
  }

  if (
    urgency === 'high' &&
    pub.myHand.length <= 2 &&
    opponentRacing(
      pub.otherPlayers,
      pub.myTeamId,
      chatMessages,
      state?.playerCount as PlayerCount | undefined,
    )
  ) {
    return dumpingOntoSmallIncomplete
  }

  if (
    urgency === 'high' &&
    heldCards >= 14 &&
    pub.stockCount <= 25 &&
    completes &&
    book.cards.length >= 5 &&
    book.cards.length < 7
  ) {
    return true
  }

  /* Late-game dump: shed wilds onto the smallest incomplete cleans. */
  if (
    urgency === 'high' &&
    dumpingOntoSmallIncomplete &&
    (pub.myHand.length <= 4 || pub.stockCount <= 20)
  ) {
    return true
  }

  return false
}

export function pickBestStartWhenUnlocked(
  hand: Card[],
  teamBooks: Book[],
  urgency: 'low' | 'medium' | 'high',
  difficulty: AiDifficulty,
  isPlayingFoot = false,
): string[] | null {
  const options = getStartOptions(hand, teamBooks, isPlayingFoot)
  if (options.length === 0) return null

  const needsDirty = teamNeedsDirtyBook(teamBooks)
  const needsClean = teamNeedsCleanBook(teamBooks)
  const learned = learnedOrDefault()
  const strength = learningStrength(learned.sampleSize, difficulty)

  const scored = options.map((opt) => {
    let value = opt.score
    const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length
    value += rankCount * 4
    value += opt.cardIds.length >= 4 ? (opt.cardIds.length - 3) * 6 : 0
    if (opt.cardIds.length >= 7) value += 35

    if (difficulty === 'expert') {
      if (opt.clean) {
        value += urgency === 'low' ? 40 : urgency === 'medium' ? 25 : 12
        value += rankCount * 5
      } else {
        value -= urgency === 'low' ? 80 : urgency === 'medium' ? 50 : 20
        if (needsDirty) value += 20
        else value -= 60
      }
      if (needsClean && opt.clean) value += 15
      if (strength > 0) {
        if (opt.clean) value += learned.cleanBias * 35 * strength
        else value -= (1 - learned.cleanBias) * 20 * strength
        if (opt.cardIds.length >= 4) value += learned.largeBookBias * 25 * strength
        value -= learned.buildExistingBias * 12 * strength
      }
    } else {
      if (opt.clean) {
        value += urgency === 'low' ? 20 : 12
      } else {
        value -= needsDirty ? 10 : 40
        if (needsDirty) value += urgency === 'low' ? 15 : 10
      }
      if (needsClean && opt.clean) value += urgency === 'low' ? 12 : 8
      if (urgency === 'high') value += opt.score * 0.4
    }

    return { opt, value }
  })

  scored.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value
    return b.opt.cardIds.length - a.opt.cardIds.length
  })

  const cleanStarts = scored.filter((s) => s.opt.clean)
  const preferCleanOnly =
    cleanStarts.length > 0 &&
    urgency === 'low' &&
    !needsDirty &&
    difficulty === 'expert' &&
    (strength < 0.25 || learned.cleanBias >= 0.5)

  if (preferCleanOnly) {
    const bestClean = [...cleanStarts].sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      return b.opt.cardIds.length - a.opt.cardIds.length
    })
    if (urgency === 'low' && Math.random() < 0.12 && bestClean.length > 1) {
      return bestClean[1].opt.cardIds
    }
    return bestClean[0].opt.cardIds
  }

  if (
    difficulty === 'normal' &&
    urgency === 'low' &&
    Math.random() < 0.12 &&
    scored.length > 1
  ) {
    return scored[1].opt.cardIds
  }

  return scored[0].opt.cardIds
}

/** Prefer natural adds; never dirty a clean book without strategic justification. */
export function pickBestAddToBook(
  actions: Extract<AiAction, { type: 'addToBook' }>[],
  pub: AiPublicState,
  booksWithWildAddedThisTurn: string[],
  difficulty: AiDifficulty,
  chatMessages: ChatMessage[] = [],
  state?: GameState,
): Extract<AiAction, { type: 'addToBook' }> | null {
  if (actions.length === 0) return null

  const teamBooks = pub.myTeamBooks
  const hand = pub.myHand

  const allowed = actions.filter((action) => {
    const book = teamBooks.find((b) => b.id === action.bookId)
    if (!book) return false
    const cards = hand.filter((c) => action.cardIds.includes(c.id))
    return justifyDirtyingCleanBook(
      book,
      cards,
      pub,
      booksWithWildAddedThisTurn,
      chatMessages,
      state,
    )
  })

  if (allowed.length === 0) return null

  const urgency = meldPressure(pub)
  const heldCards = pub.myHand.length + pub.myFootCount
  const aggressive = urgency === 'high' || (urgency === 'medium' && heldCards >= 12)
  const nearGoOut =
    partnerNearGoOut(pub.otherPlayers, pub.myTeamId, chatMessages, state) ||
    /* While playing foot, held cards live in hand — myFootCount mirrors hand size. */
    (pub.isPlayingFoot && pub.myHand.length <= 4)
  const canGoOutNow =
    teamHasCompletedCleanBook(teamBooks) && teamHasCompletedDirtyBook(teamBooks)
  const learned = learnedOrDefault()
  const strength = learningStrength(learned.sampleSize, difficulty)

  const scored = allowed.map((action) => {
    const book = teamBooks.find((b) => b.id === action.bookId)!
    const cards = hand.filter((c) => action.cardIds.includes(c.id))
    const wildsAdded = countWildsInCards(cards)
    const naturalsAdded = cards.length - wildsAdded
    const clean = isCleanBook(book)
    const newSize = book.cards.length + cards.length
    const completes = newSize >= 7

    let score = action.priority

    if (clean && wildsAdded > 0) {
      /* Base cost of giving up a clean bonus path — strategy score differentiates targets. */
      score -= difficulty === 'expert' ? 280 : 220
      score += scoreWildOnCleanTarget(book, cards, teamBooks, {
        urgency,
        canTeamGoOut: canGoOutNow,
        nearGoOut,
      })
      if (strength > 0) {
        score -= learned.cleanBias * 40 * strength
      }
    }

    if (clean && naturalsAdded > 0) {
      score += 50
      if (completes) score += 45
      if (book.cards.length === 6 && naturalsAdded > 0) score += 30
    }

    if (!clean && wildsAdded > 0 && bookWildCount(book) < 2) {
      /* Dirty books are the default wild sink — prefer completing them. */
      score += 40
      if (book.cards.length === 6 && completes) score += 80
      else if (completes) score += 35
      else score += Math.max(0, 6 - book.cards.length) * 5
    }

    if (naturalsAdded > 0 && !clean) {
      score += 25
    }

    if (completes && clean && naturalsAdded > 0) {
      score += 40
    }

    if (strength > 0) {
      score += learned.buildExistingBias * 28 * strength
      if (naturalsAdded > 0) score += learned.buildExistingBias * 12 * strength
      if (clean && naturalsAdded > 0) score += learned.cleanBias * 18 * strength
      if (completes) score += learned.largeBookBias * 15 * strength
      if (urgency === 'high' || aggressive) {
        score += learned.raceUrgency * 22 * strength
      }
    }

    if (
      state &&
      opponentTeamSignaledGoOut(
        chatMessages,
        pub.myTeamId,
        state.playerCount as PlayerCount,
      ) &&
      clean &&
      wildsAdded > 0 &&
      book.cards.length >= 5 &&
      completes
    ) {
      score += difficulty === 'expert' ? 120 : 80
    }

    if (
      state &&
      partnerGoOutSignaledInChat(chatMessages, state, pub.myTeamId) &&
      wildsAdded > 0
    ) {
      score += 35
    }

    if (aggressive) {
      score += cards.length * (urgency === 'high' ? 28 : 14)
      score += Math.min(heldCards, 24) * (urgency === 'high' ? 2 : 1)
    }

    return { action, score, book, cards, wildsAdded, clean, completes }
  })

  scored.sort((a, b) => b.score - a.score)

  /*
   * After a human Yes to wilding a clean book, play that wild before any natural
   * of the same rank — otherwise re-planning prefers the identity card and the
   * consented wild never lands.
   */
  const approvedWildAdds = scored.filter(
    ({ wildsAdded, book }) =>
      wildsAdded > 0 && bookHasPartnerWildApproval(book.id, pub, chatMessages, state),
  )
  if (approvedWildAdds.length > 0) {
    approvedWildAdds.sort((a, b) => {
      const aPure = a.wildsAdded === a.cards.length ? 1 : 0
      const bPure = b.wildsAdded === b.cards.length ? 1 : 0
      if (aPure !== bPure) return bPure - aPure
      return b.score - a.score
    })
    return approvedWildAdds[0].action
  }

  const naturalOnClean = scored.filter(
    ({ clean, wildsAdded }) => clean && wildsAdded === 0,
  )

  const strategicWildOnClean = scored.filter(({ clean, wildsAdded, book, completes }) => {
    if (!clean || wildsAdded === 0) return false
    /* Always allow justified wild-on-clean that completes a dirty for go-out. */
    if (
      book.cards.length >= 5 &&
      completes &&
      !teamHasCompletedDirtyBook(teamBooks) &&
      teamHasCompletedCleanBook(teamBooks)
    ) {
      return true
    }
    return aggressive || nearGoOut
  })

  const nonCleanOrNatural = scored.filter(
    ({ clean, wildsAdded }) => wildsAdded === 0 || !clean,
  )

  let pool = scored
  if (!aggressive) {
    if (naturalOnClean.length > 0) {
      pool = [...naturalOnClean, ...strategicWildOnClean]
    } else if (strategicWildOnClean.length > 0) {
      pool = [...nonCleanOrNatural, ...strategicWildOnClean]
    } else {
      pool = nonCleanOrNatural
    }
  }

  if (pool.length === 0) return null

  pool.sort((a, b) => b.score - a.score)

  if (
    difficulty === 'normal' &&
    urgency === 'low' &&
    Math.random() < 0.08 &&
    pool.length > 1
  ) {
    return pool[1].action
  }

  return pool[0].action
}

/** Place a lone wild on a dirty book before the AI is forced to discard it. */
export function pickLoneWildAdd(
  hand: Card[],
  teamBooks: Book[],
  booksWithWildAddedThisTurn: string[],
  /** Clean books the human partner already approved dirtying. */
  approvedCleanBookIds: string[] = [],
): { bookId: string; cardId: string } | null {
  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  if (wilds.length === 0) return null

  const dirtyBooks = teamBooks.filter(
    (book) => !isCleanBook(book) && bookWildCount(book) < 2,
  )
  const approvedCleanBooks = teamBooks.filter(
    (book) => approvedCleanBookIds.includes(book.id) && isCleanBook(book),
  )

  // Prefer placing jokers before deuces.
  const orderedWilds = [...wilds].sort((a, b) => {
    if (a.rank === 'Joker' && b.rank !== 'Joker') return -1
    if (b.rank === 'Joker' && a.rank !== 'Joker') return 1
    return cardPointValue(b) - cardPointValue(a)
  })

  /* Prefer completing a 6-card dirty (+100), then fill toward completion. */
  const orderedDirty = [...dirtyBooks].sort((a, b) => {
    const aComplete = a.cards.length === 6 ? 2 : a.cards.length >= 5 ? 1 : 0
    const bComplete = b.cards.length === 6 ? 2 : b.cards.length >= 5 ? 1 : 0
    if (aComplete !== bComplete) return bComplete - aComplete
    return b.cards.length - a.cards.length
  })

  const orderedApprovedClean = [...approvedCleanBooks].sort((a, b) => {
    const aComplete = a.cards.length === 6 ? 2 : a.cards.length >= 5 ? 1 : 0
    const bComplete = b.cards.length === 6 ? 2 : b.cards.length >= 5 ? 1 : 0
    if (aComplete !== bComplete) return bComplete - aComplete
    return a.cards.length - b.cards.length
  })

  for (const wild of orderedWilds) {
    for (const book of orderedDirty) {
      if (booksWithWildAddedThisTurn.includes(book.id)) continue
      const check = canAddToBook(book, [wild], {
        wildAlreadyAddedThisTurn: false,
      })
      if (check.ok) {
        return { bookId: book.id, cardId: wild.id }
      }
    }
  }

  /* Honor partner Yes when no dirty sink took the wild. */
  for (const wild of orderedWilds) {
    for (const book of orderedApprovedClean) {
      if (booksWithWildAddedThisTurn.includes(book.id)) continue
      if (wouldDestroyOnlyCompletedCleanBook(book, [wild], teamBooks)) continue
      const check = canAddToBook(book, [wild], {
        wildAlreadyAddedThisTurn: false,
      })
      if (check.ok) {
        return { bookId: book.id, cardId: wild.id }
      }
    }
  }

  return null
}

/** Start a dirty book with a wild (especially a joker) instead of discarding it. */
export function pickWildStartBook(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot = false,
): string[] | null {
  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  if (wilds.length === 0) return null

  const dirtyStarts = getStartOptions(hand, teamBooks, isPlayingFoot).filter((opt) => !opt.clean)
  if (dirtyStarts.length === 0) return null

  const usesWild = dirtyStarts.filter((opt) =>
    opt.cardIds.some((id) => {
      const card = hand.find((c) => c.id === id)
      return card && isWildCard(card)
    }),
  )
  const pool = usesWild.length > 0 ? usesWild : dirtyStarts

  pool.sort((a, b) => {
    const aJoker = a.cardIds.some(
      (id) => hand.find((c) => c.id === id)?.rank === 'Joker',
    )
    const bJoker = b.cardIds.some(
      (id) => hand.find((c) => c.id === id)?.rank === 'Joker',
    )
    if (aJoker !== bJoker) return aJoker ? -1 : 1
    return b.score - a.score
  })

  return pool[0]?.cardIds ?? null
}

/** Never discard jokers while naturals or deuces remain; only shed jokers when holding 3+. */
export function pickDiscardCard(
  hand: Card[],
  teamBooks: Book[],
  difficulty: AiDifficulty,
  goingOut: boolean,
  /** Opponent book ranks on the table (public info). */
  opponentRanks: Rank[] = [],
): string {
  if (hand.length === 0) return ''
  if (goingOut) {
    const naturals = hand.filter((c) => !isWildCard(c) && !isRedThree(c))
    if (naturals.length > 0) {
      return naturals.sort((a, b) => cardPointValue(b) - cardPointValue(a))[0].id
    }
    const deuces = hand.filter((c) => c.rank === '2')
    if (deuces.length > 0) return deuces[0].id
    return hand[0].id
  }

  const redThrees = hand.filter(isRedThree)
  if (redThrees.length > 0) return redThrees[0].id

  const rankGroups = groupByRank(hand)
  const teamRanks = new Set(teamBooks.map((b) => b.rank))
  const oppRankSet = new Set(opponentRanks)
  const learned = learnedOrDefault()
  const strength = learningStrength(learned.sampleSize, difficulty)

  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  const jokers = wilds.filter((c) => c.rank === 'Joker')
  const deuces = wilds.filter((c) => c.rank === '2')
  const naturals = hand.filter((c) => !isWildCard(c) && !isRedThree(c))

  let candidates: Card[]
  if (naturals.length > 0) {
    candidates = naturals
  } else if (deuces.length > 0) {
    candidates = deuces
  } else if (jokers.length > 0) {
    candidates = jokers
  } else {
    candidates = hand.filter((c) => !isRedThree(c))
  }

  const scored = candidates.map((card) => {
    const penalty = cardPointValue(card)
    let discardScore = penalty

    if (!isWildCard(card)) {
      const sameRank = rankGroups.get(card.rank) ?? []
      if (sameRank.length >= 2) discardScore -= 40
      if (sameRank.length >= 3) discardScore -= 30
      if (teamRanks.has(card.rank)) discardScore -= 25
      if (strength > 0) {
        if (sameRank.length >= 2) discardScore -= learned.protectPairs * 35 * strength
        if (teamRanks.has(card.rank)) {
          discardScore -= learned.buildExistingBias * 20 * strength
        }
        if (oppRankSet.has(card.rank)) {
          discardScore -= learned.avoidFeedingOpponents * 70 * strength
        }
        if (penalty >= 20) {
          discardScore += learned.raceUrgency * 12 * strength
        }
      }
    } else if (card.rank === 'Joker') {
      discardScore -= 500
    } else {
      discardScore -= 100
    }

    if (difficulty === 'normal' && !isWildCard(card) && Math.random() < 0.15) {
      discardScore += Math.random() * 12
    }

    return { card, discardScore }
  })

  scored.sort((a, b) => b.discardScore - a.discardScore)
  return scored[0].card.id
}

export { findAddToBookActions, findStartBookActions }
