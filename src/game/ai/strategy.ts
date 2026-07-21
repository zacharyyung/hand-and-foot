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
  teamHasCleanAndDirtyBooks,
} from '../books'
import type { GameState } from '../deal'
import type { ChatMessage } from '../chat'
import { opponentTeamSignaledGoOut } from '../chat'
import { partnerGoOutSignaledInChat } from './chatSignals'
import { cardPointValue, meldThreshold, meldContributionFromCards } from '../scoring'
import type { PlayerCount } from '../teams'
import type { AiDifficulty } from '../deal'
import type { AiPublicState } from './publicState'
import { footMeldAllowedForHand } from '../actions'
import { findAddToBookActions, findStartBookActions, type AiAction } from './decisions'

function combinations<T>(items: T[], min: number, max: number): T[][] {
  const results: T[][] = []
  function helper(start: number, combo: T[]) {
    if (combo.length >= min && combo.length <= max) results.push([...combo])
    if (combo.length === max) return
    for (let i = start; i < items.length; i++) {
      combo.push(items[i])
      helper(i + 1, combo)
      combo.pop()
    }
  }
  helper(0, [])
  return results
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

function getStartOptions(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot = false,
  meldThresholdMetAfterMeld = true,
): StartOption[] {
  const options: StartOption[] = []
  const seen = new Set<Rank>()
  const playable = hand.filter((c) => !isRedThree(c))

  for (const combo of combinations(playable, 3, Math.min(7, playable.length))) {
    const cardIds = combo.map((c) => c.id)
    const check = canStartBook(combo, teamBooks)
    if (!check.ok || seen.has(check.rank)) continue
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
      continue
    }
    seen.add(check.rank)
    options.push({
      cardIds: combo.map((c) => c.id),
      score: meldContributionFromCards(combo),
      rank: check.rank,
      clean: !hasWilds(combo),
    })
  }

  return options
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
  const options = getStartOptions(hand, teamBooks, isPlayingFoot)
  if (options.length === 0) return null

  const needsDirty = teamNeedsDirtyBook(teamBooks)
  const needsClean = teamNeedsCleanBook(teamBooks)

  const scoreOption = (opt: StartOption) => {
    let s = opt.score
    const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length

    if (difficulty === 'expert') {
      if (opt.clean) {
        s += urgency === 'low' ? 50 : urgency === 'medium' ? 35 : 20
        s += rankCount * 6
      } else {
        s -= urgency === 'low' ? 50 : urgency === 'medium' ? 25 : 8
      if (needsDirty) s += 18
      else s -= 30
      if (needsClean && opt.clean) s += 12
      }
      if (urgency === 'high') s += opt.score * 0.35
    } else {
      if (opt.clean) {
        s += urgency === 'low' ? 25 : urgency === 'medium' ? 18 : 10
        s += rankCount * 4
      } else {
        s -= needsDirty ? 15 : 50
        if (needsDirty) s += urgency === 'low' ? 12 : 8
      }
      if (needsClean && opt.clean) s += 15
      if (urgency === 'high') s += opt.score * 0.35
    }

    return s
  }

  const sorted = [...options].sort((a, b) => scoreOption(b) - scoreOption(a))
  const allowDirtyStack = urgency !== 'low' || required <= 50

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

    const skip = search(index + 1, used, chosen, points)
    if (skip) return skip

    const opt = sorted[index]
    if (opt.cardIds.some((id) => used.has(id))) {
      return search(index + 1, used, chosen, points)
    }

    if (
      !opt.clean &&
      dirtyBooksInPlan(chosen) >= 1 &&
      !allowDirtyStack
    ) {
      return search(index + 1, used, chosen, points)
    }

    const nextUsed = new Set(used)
    opt.cardIds.forEach((id) => nextUsed.add(id))
    return search(
      index + 1,
      nextUsed,
      [...chosen, opt.cardIds],
      points + opt.score,
    )
  }

  const plan = search(0, new Set(), [], 0)
  if (!plan) return null
  if (difficulty !== 'expert' || urgency !== 'low' || required <= 50) return plan

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

    const skip = search(index + 1, used, chosen, points)
    if (skip) return skip

    const opt = sorted[index]
    if (opt.cardIds.some((id) => used.has(id))) {
      return search(index + 1, used, chosen, points)
    }

    const nextUsed = new Set(used)
    opt.cardIds.forEach((id) => nextUsed.add(id))
    return search(
      index + 1,
      nextUsed,
      [...chosen, opt.cardIds],
      points + opt.score,
    )
  }

  return search(0, new Set(), [], 0)
}

export function meldUrgency(teamScore: number): 'low' | 'medium' | 'high' {
  const req = meldThreshold(teamScore)
  if (req >= 150) return 'high'
  if (req >= 100) return 'medium'
  return 'low'
}

function raisePressure(
  level: 'low' | 'medium' | 'high',
  target: 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  if (target === 'high') return 'high'
  if (level === 'low') return 'medium'
  return level
}

/** Cards still held by the acting AI (foot count mirrors hand while playing foot). */
export function myCardsRemaining(pub: AiPublicState): number {
  return pub.isPlayingFoot ? pub.myHand.length : pub.myHand.length + pub.myFootCount
}

/** How hard the AI should push to meld — rises with meld limits, hand size, race, and stock. */
export function meldPressure(pub: AiPublicState): 'low' | 'medium' | 'high' {
  let level = meldUrgency(pub.teamScore)
  const held = myCardsRemaining(pub)
  const goOutReady =
    pub.teamMeldThresholdMet && teamHasCleanAndDirtyBooks(pub.myTeamBooks)
  const needsDirtyDone = !teamHasCompletedDirtyBook(pub.myTeamBooks)
  const needsCleanDone = !teamHasCompletedCleanBook(pub.myTeamBooks)
  const hasCompletedClean = teamHasCompletedCleanBook(pub.myTeamBooks)
  const opponentsRacing = opponents(pub.otherPlayers, pub.myTeamId).some(
    (p) => p.handCount + p.footCount <= 6,
  )
  const opponentClosing = opponents(pub.otherPlayers, pub.myTeamId).some(
    (p) => p.isPlayingFoot && p.handCount + p.footCount <= 4,
  )
  const partnerClosing = teammates(pub.otherPlayers, pub.myTeamId).some(
    (p) => p.isPlayingFoot && p.handCount + p.footCount <= 4,
  )

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

  // Opening rounds (50-point meld): don't stall — treat as at least medium until in.
  if (!pub.teamMeldThresholdMet && pub.requiredMeld <= 50 && level === 'low') {
    level = 'medium'
  }

  if (pub.isPlayingFoot && pub.myFootCount >= 9 && level === 'low') {
    level = 'medium'
  }

  // Endgame / race: small feet used to stay "low" and freeze melding — push hard instead.
  if (pub.isPlayingFoot && pub.myHand.length <= 6) {
    level = raisePressure(level, 'medium')
  }
  if (pub.isPlayingFoot && pub.myHand.length <= 4) {
    level = raisePressure(level, 'high')
  }
  if (goOutReady && pub.isPlayingFoot) {
    level = 'high'
  }
  // One completed clean but no dirty yet — must create/finish dirty to catch a race.
  if (hasCompletedClean && needsDirtyDone && pub.isPlayingFoot) {
    level = raisePressure(level, 'high')
  }
  if (needsCleanDone && pub.isPlayingFoot && pub.myHand.length <= 8) {
    level = raisePressure(level, 'medium')
  }
  if (opponentsRacing || partnerClosing) {
    level = raisePressure(level, 'high')
  }
  if (opponentClosing) {
    level = 'high'
  }

  return level
}

/** Urgency used for initial 50+ meld planning — less picky than mid-game hoarding. */
export function initialMeldUrgency(
  required: number,
  urgency: 'low' | 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  if (required <= 50) return urgency === 'high' ? 'high' : 'medium'
  if (required <= 100 && urgency === 'low') return 'medium'
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
    (p) => p.isPlayingFoot && p.handCount + p.footCount <= 3,
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
 * Wild on a clean book costs a 300-point bonus — only allow when dumping/endgame
 * or completing the team's required dirty book to go out.
 *
 * Go-out / race exceptions are checked BEFORE the early-round clean-book lock,
 * otherwise expert AI freezes in foot with a completed clean and no dirty.
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

  const urgency = meldPressure(pub)
  const heldCards = myCardsRemaining(pub)
  const alternative = hasAlternativeWildTarget(
    pub.myHand,
    pub.myTeamBooks,
    book.id,
    booksWithWildAddedThisTurn,
  )

  if (alternative) return false

  const books = pub.myTeamBooks
  const newSize = book.cards.length + cards.length
  const completes = newSize >= 7
  const otherCompletedClean = books.some(
    (b) => b.id !== book.id && b.cards.length >= 7 && isCleanBook(b),
  )
  const needsDirtyCompleted = !teamHasCompletedDirtyBook(books)
  const racing = opponentRacing(
    pub.otherPlayers,
    pub.myTeamId,
    chatMessages,
    state?.playerCount as PlayerCount | undefined,
  )
  const partnerClosing = partnerNearGoOut(
    pub.otherPlayers,
    pub.myTeamId,
    chatMessages,
    state,
  )

  // Sole path to the required dirty book for going out — never block this.
  const completesForGoOut =
    completes && otherCompletedClean && needsDirtyCompleted && book.cards.length >= 5

  if (completesForGoOut) {
    return true
  }

  // Progress a near-complete clean into the missing dirty when racing / in foot.
  if (
    needsDirtyCompleted &&
    otherCompletedClean &&
    book.cards.length >= 5 &&
    (urgency !== 'low' || racing || partnerClosing || pub.isPlayingFoot)
  ) {
    return true
  }

  // No dirty book exists at all and we already have a completed clean — start one.
  if (
    needsDirtyCompleted &&
    otherCompletedClean &&
    !books.some((b) => isDirtyBook(b)) &&
    (racing || partnerClosing || pub.isPlayingFoot || urgency === 'high')
  ) {
    return true
  }

  if (
    urgency === 'high' &&
    heldCards <= 6 &&
    pub.myHand.length <= 3 &&
    partnerClosing
  ) {
    return true
  }

  if (urgency === 'high' && pub.myHand.length <= 3 && racing) {
    return true
  }

  if (
    urgency === 'high' &&
    heldCards >= 14 &&
    pub.stockCount <= 25 &&
    completes &&
    book.cards.length >= 5
  ) {
    return true
  }

  // Early rounds: protect clean bonuses unless a go-out/race exception above fired.
  const earlyRound = pub.teamScore <= 999 && urgency === 'low'
  if (earlyRound) return false

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

  const scored = options.map((opt) => {
    let value = opt.score
    const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length
    value += rankCount * 4

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

  scored.sort((a, b) => b.value - a.value)

  const cleanStarts = scored.filter((s) => s.opt.clean)
  const preferCleanOnly =
    cleanStarts.length > 0 &&
    urgency === 'low' &&
    !needsDirty &&
    difficulty === 'expert'

  if (preferCleanOnly) {
    return cleanStarts[0].opt.cardIds
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
  const heldCards = myCardsRemaining(pub)
  const aggressive = urgency === 'high' || (urgency === 'medium' && heldCards >= 12)

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
      score -= difficulty === 'expert' ? 400 : 300
    }

    if (clean && naturalsAdded > 0) {
      score += 50
      if (completes) score += 45
      if (book.cards.length === 6 && naturalsAdded > 0) score += 30
    }

    if (!clean && wildsAdded > 0 && bookWildCount(book) < 2) {
      score += 20
    }

    if (naturalsAdded > 0 && !clean) {
      score += 25
    }

    if (completes && clean && naturalsAdded > 0) {
      score += 40
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

    return { action, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const naturalOnClean = scored.filter(({ action }) => {
    const book = teamBooks.find((b) => b.id === action.bookId)!
    const cards = hand.filter((c) => action.cardIds.includes(c.id))
    return isCleanBook(book) && countWildsInCards(cards) === 0
  })

  const pool = aggressive
    ? scored
    : naturalOnClean.length > 0
      ? naturalOnClean
      : scored.filter(({ action }) => {
          const book = teamBooks.find((b) => b.id === action.bookId)!
          const cards = hand.filter((c) => action.cardIds.includes(c.id))
          return countWildsInCards(cards) === 0 || !isCleanBook(book)
        })

  if (pool.length === 0) return null

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
): { bookId: string; cardId: string } | null {
  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  if (wilds.length === 0) return null

  const dirtyBooks = teamBooks.filter(
    (book) => !isCleanBook(book) && bookWildCount(book) < 2,
  )

  // Prefer placing jokers before deuces.
  const orderedWilds = [...wilds].sort((a, b) => {
    if (a.rank === 'Joker' && b.rank !== 'Joker') return -1
    if (b.rank === 'Joker' && a.rank !== 'Joker') return 1
    return cardPointValue(b) - cardPointValue(a)
  })

  for (const wild of orderedWilds) {
    for (const book of dirtyBooks) {
      if (booksWithWildAddedThisTurn.includes(book.id)) continue
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
