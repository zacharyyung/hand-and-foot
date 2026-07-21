import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import {
  bookWildCount,
  canStartBook,
  countWildsInCards,
  isCleanBook,
  teamHasCleanAndDirtyBooks,
} from '../books'
import {
  addToBook,
  canGoOut,
  canPlayerGoOut,
  canTeamGoOut,
  commitStagedMelds,
  discardCard,
  footMeldAllowedForHand,
  getTeam,
  startBook,
} from '../actions'
import type { GameState } from '../deal'
import type { ChatMessage } from '../chat'
import { opponentTeamSignaledGoOut } from '../chat'
import { cardPointValue, meldContributionFromCards } from '../scoring'
import type { PlayerCount } from '../teams'
import { findAddToBookActions } from './decisions'
import { buildAiPublicState, type AiPublicState } from './publicState'
import {
  buildCardBeliefs,
  discardFeedRisk,
  type CardBeliefs,
} from './beliefs'
import {
  cardRetainValue,
  evaluateLeftoverHand,
  evaluatePosition,
  evaluateStartQuality,
} from './evaluate'
import {
  initialMeldUrgency,
  justifyDirtyingCleanBook,
  meldPressure,
  myCardsRemaining,
  pickLoneWildAdd,
  pickWildStartBook,
  teamHasCompletedCleanBook,
  teamHasCompletedDirtyBook,
  teamNeedsCleanBook,
  teamNeedsDirtyBook,
} from './strategy'
import { partnerGoOutSignaledInChat } from './chatSignals'

export type ExpertPlay =
  | { type: 'initialMeld'; groups: string[][] }
  | { type: 'addToBook'; bookId: string; cardIds: string[] }
  | { type: 'startBook'; cardIds: string[] }
  | { type: 'discard'; cardId: string }

interface StartOption {
  cardIds: string[]
  score: number
  rank: Rank
  clean: boolean
}

interface BeamNode {
  state: GameState
  plays: ExpertPlay[]
  value: number
}

const BEAM_WIDTH = 6
const MAX_PLAY_DEPTH = 18
const MAX_INITIAL_PLANS = 100
const ADD_CANDIDATE_CAP = 12
const START_CANDIDATE_CAP = 8

function cloneState(state: GameState): GameState {
  return structuredClone(state)
}

function getStartOptions(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot: boolean,
  meldThresholdMetAfterMeld = true,
): StartOption[] {
  const options: StartOption[] = []
  const takenRanks = new Set(teamBooks.map((b) => b.rank))
  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  const byRank = new Map<Rank, Card[]>()

  for (const card of hand) {
    if (isRedThree(card) || isWildCard(card)) continue
    const list = byRank.get(card.rank) ?? []
    list.push(card)
    byRank.set(card.rank, list)
  }

  const pushOption = (cards: Card[], rank: Rank, clean: boolean) => {
    const cardIds = cards.map((c) => c.id)
    const check = canStartBook(cards, teamBooks)
    if (!check.ok) return
    const projectedBook: Book = {
      id: `preview-${rank}`,
      rank,
      cards,
      teamId: teamBooks[0]?.teamId ?? 0,
      startedBySeatIndex: 0,
    }
    if (
      !footMeldAllowedForHand(
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
      score: meldContributionFromCards(cards),
      rank,
      clean,
    })
  }

  for (const [rank, naturals] of byRank) {
    if (takenRanks.has(rank)) continue

    // Clean starts: use 3..min(7, n) naturals (prefer keeping extras in hand via smaller books when scoring).
    const maxClean = Math.min(7, naturals.length)
    for (let size = 3; size <= maxClean; size++) {
      pushOption(naturals.slice(0, size), rank, true)
    }

    // Dirty starts: 2+ naturals + exactly one wild, total 3..7.
    if (wilds.length > 0 && naturals.length >= 2) {
      const wild = wilds[0]
      const maxDirtyNaturals = Math.min(6, naturals.length)
      for (let n = 2; n <= maxDirtyNaturals; n++) {
        const total = n + 1
        if (total < 3 || total > 7) continue
        pushOption([...naturals.slice(0, n), wild], rank, false)
      }
    }
  }

  return options
}

/**
 * Enumerate threshold-meeting initial meld plans and pick by leftover EV + book quality.
 * Fixes the old DFS that returned the first (often worst) feasible plan.
 */
export function planExpertInitialMeld(
  hand: Card[],
  teamBooks: Book[],
  required: number,
  urgency: 'low' | 'medium' | 'high',
  isPlayingFoot: boolean,
): string[][] | null {
  const options = getStartOptions(hand, teamBooks, isPlayingFoot, true)
  if (options.length === 0) return null

  const needsDirty = teamNeedsDirtyBook(teamBooks)
  const needsClean = teamNeedsCleanBook(teamBooks)

  const scoredOpts = options
    .map((opt) => {
      const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length
      let value = evaluateStartQuality(
        hand.filter((c) => opt.cardIds.includes(c.id)),
        opt.clean,
        urgency,
        needsClean,
        needsDirty,
      )
      value += rankCount * 8
      // Prefer keeping extra copies of the rank when starting clean.
      if (opt.clean && rankCount > opt.cardIds.filter((id) => {
        const c = hand.find((x) => x.id === id)
        return c && !isWildCard(c)
      }).length) {
        value += 15
      }
      return { opt, value }
    })
    .sort((a, b) => b.value - a.value)

  const sorted = scoredOpts.map((s) => s.opt)
  const allowDirtyStack = urgency !== 'low' || required <= 50
  let bestPlan: string[][] | null = null
  let bestScore = -Infinity
  let found = 0

  function dirtyCount(chosen: string[][]): number {
    return chosen.filter((ids) =>
      ids.some((id) => {
        const card = hand.find((c) => c.id === id)
        return card && isWildCard(card)
      }),
    ).length
  }

  function consider(chosen: string[][], points: number) {
    if (points < required) return
    found += 1
    const used = new Set(chosen.flat())
    const leftover = hand.filter((c) => !used.has(c.id))
    const projectedBooks: Book[] = [
      ...teamBooks,
      ...chosen.map((ids, i) => {
        const cards = hand.filter((c) => ids.includes(c.id))
        const rank =
          cards.find((c) => !isWildCard(c))?.rank ?? ('A' as Rank)
        return {
          id: `plan-${i}-${rank}`,
          rank,
          cards,
          teamId: teamBooks[0]?.teamId ?? 0,
          startedBySeatIndex: 0,
        }
      }),
    ]
    const cleanBooks = chosen.filter((ids) => !ids.some((id) => {
      const c = hand.find((x) => x.id === id)
      return c && isWildCard(c)
    })).length
    const quality =
      evaluateLeftoverHand(leftover, projectedBooks) +
      points * 0.35 +
      cleanBooks * 40 -
      dirtyCount(chosen) * (urgency === 'low' ? 35 : 12) -
      chosen.flat().length * 2

    if (quality > bestScore) {
      bestScore = quality
      bestPlan = chosen.map((ids) => [...ids])
    }
  }

  function search(
    index: number,
    used: Set<string>,
    chosen: string[][],
    points: number,
  ): void {
    if (found >= MAX_INITIAL_PLANS) return
    if (points >= required) {
      consider(chosen, points)
      // Still try leaner plans that skip extra books.
    }
    if (index >= sorted.length) {
      consider(chosen, points)
      return
    }

    // Prefer including stronger options first (branch include before skip).
    const opt = sorted[index]
    const conflict = opt.cardIds.some((id) => used.has(id))
    const dirtyBlocked =
      !opt.clean && dirtyCount(chosen) >= 1 && !allowDirtyStack

    if (!conflict && !dirtyBlocked) {
      const nextUsed = new Set(used)
      opt.cardIds.forEach((id) => nextUsed.add(id))
      search(index + 1, nextUsed, [...chosen, opt.cardIds], points + opt.score)
    }

    search(index + 1, used, chosen, points)
  }

  search(0, new Set(), [], 0)

  if (bestPlan) return bestPlan

  // High-urgency fallback: any feasible plan from greedy include-first.
  for (const preferClean of [true, false]) {
    const pool = preferClean ? sorted.filter((o) => o.clean) : sorted
    const used = new Set<string>()
    const chosen: string[][] = []
    let points = 0
    for (const opt of pool) {
      if (opt.cardIds.some((id) => used.has(id))) continue
      if (!opt.clean && dirtyCount(chosen) >= 1 && !allowDirtyStack) continue
      opt.cardIds.forEach((id) => used.add(id))
      chosen.push(opt.cardIds)
      points += opt.score
      if (points >= required) return chosen
    }
  }

  return null
}

function scoreAddAction(
  action: { bookId: string; cardIds: string[]; priority: number },
  pub: AiPublicState,
  state: GameState,
  chatMessages: ChatMessage[],
): number {
  const book = pub.myTeamBooks.find((b) => b.id === action.bookId)
  if (!book) return -Infinity
  const cards = pub.myHand.filter((c) => action.cardIds.includes(c.id))
  const wilds = countWildsInCards(cards)
  const naturals = cards.length - wilds
  const clean = isCleanBook(book)
  const newSize = book.cards.length + cards.length
  const completes = newSize >= 7
  const urgency = meldPressure(pub)
  const goOutReady = teamHasCleanAndDirtyBooks(pub.myTeamBooks)
  const becomesGoOutReady =
    !goOutReady &&
    completes &&
    ((clean && wilds > 0 && teamHasCompletedCleanBook(pub.myTeamBooks.filter((b) => b.id !== book.id))) ||
      (!clean && teamHasCompletedCleanBook(pub.myTeamBooks)) ||
      (clean && wilds === 0 && teamHasCompletedDirtyBook(pub.myTeamBooks)))

  let score = action.priority + naturals * 36 + sumPoints(cards) * 0.65 + cards.length * 18

  if (clean && wilds > 0) {
    // Still costly, but completing the missing dirty for go-out overrides.
    score -= becomesGoOutReady || (completes && teamHasCompletedCleanBook(
      pub.myTeamBooks.filter((b) => b.id !== book.id),
    ) && !teamHasCompletedDirtyBook(pub.myTeamBooks))
      ? 40
      : 450
  }
  if (clean && naturals > 0) {
    score += 75
    if (completes) score += 110
    if (book.cards.length === 6) score += 65
  }
  if (!clean && wilds > 0 && bookWildCount(book) < 2) score += 45
  if (!clean && naturals > 0) score += 36
  if (completes && clean) score += 70
  if (becomesGoOutReady) score += 400
  if (goOutReady) score += cards.length * 50

  // Dumping onto books always beats holding when race/stock pressure is up.
  const held = myCardsRemaining(pub)
  if (held >= 14) score += cards.length * 20
  if (pub.stockCount <= 25) score += cards.length * 10
  if (pub.isPlayingFoot) score += cards.length * 16

  if (
    opponentTeamSignaledGoOut(
      chatMessages,
      pub.myTeamId,
      state.playerCount as PlayerCount,
    ) &&
    completes
  ) {
    score += 80
  }
  if (partnerGoOutSignaledInChat(chatMessages, state, pub.myTeamId)) {
    score += wilds > 0 ? 50 : 25
  }

  if (urgency === 'high') score += cards.length * 30
  else if (urgency === 'medium') score += cards.length * 14

  return score
}

function sumPoints(cards: Card[]): number {
  return cards.reduce((s, c) => s + cardPointValue(c), 0)
}

function candidateAdds(
  state: GameState,
  chatMessages: ChatMessage[],
): Array<{ bookId: string; cardIds: string[]; score: number }> {
  const pub = buildAiPublicState(state, state.currentPlayerIndex)
  const team = getTeam(state, pub.myTeamId)
  const actions = findAddToBookActions(
    pub.myHand,
    pub.myTeamBooks,
    pub.isPlayingFoot,
    state.booksWithWildAddedThisTurn,
    team.meldThresholdMet,
  )

  const allowed = actions.filter((action) => {
    const book = pub.myTeamBooks.find((b) => b.id === action.bookId)
    if (!book) return false
    const cards = pub.myHand.filter((c) => action.cardIds.includes(c.id))
    return justifyDirtyingCleanBook(
      book,
      cards,
      pub,
      state.booksWithWildAddedThisTurn,
      chatMessages,
      state,
    )
  })

  return allowed
    .map((action) => ({
      bookId: action.bookId,
      cardIds: action.cardIds,
      score: scoreAddAction(action, pub, state, chatMessages),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, ADD_CANDIDATE_CAP)
}

function candidateStarts(state: GameState): Array<{ cardIds: string[]; score: number }> {
  const pub = buildAiPublicState(state, state.currentPlayerIndex)
  if (!pub.teamMeldThresholdMet) return []
  const urgency = meldPressure(pub)
  const options = getStartOptions(
    pub.myHand,
    pub.myTeamBooks,
    pub.isPlayingFoot,
    true,
  )
  const needsDirty = teamNeedsDirtyBook(pub.myTeamBooks)
  const needsClean = teamNeedsCleanBook(pub.myTeamBooks)
  const needsDirtyCompleted = !teamHasCompletedDirtyBook(pub.myTeamBooks)
  const hasCleanDone = teamHasCompletedCleanBook(pub.myTeamBooks)

  return options
    .map((opt) => {
      const cards = pub.myHand.filter((c) => opt.cardIds.includes(c.id))
      const rankCount = pub.myHand.filter(
        (c) => c.rank === opt.rank && !isRedThree(c),
      ).length
      let score = evaluateStartQuality(
        cards,
        opt.clean,
        urgency,
        needsClean,
        needsDirty,
      )
      score += rankCount * 6
      // Endgame: prefer opening the missing dirty book when clean is already done.
      if (!opt.clean && needsDirtyCompleted && hasCleanDone) {
        score += urgency === 'high' ? 120 : 70
      }
      if (opt.clean && needsClean && !hasCleanDone) {
        score += 80
      }
      return { cardIds: opt.cardIds, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, START_CANDIDATE_CAP)
}

function terminalValue(
  state: GameState,
  _chatMessages: ChatMessage[],
): { value: number; discardId: string } {
  const pub = buildAiPublicState(state, state.currentPlayerIndex)
  const beliefs = buildCardBeliefs(pub, state.playerCount)
  const team = getTeam(state, pub.myTeamId)
  // Use rules go-out (ignore partner chat) so terminal scoring still races to close.
  const rulesGoOut = canGoOut(state)
  const goOutReady = canTeamGoOut(team.books, team.meldThresholdMet)
  const discardId = pickExpertDiscard(pub, beliefs, rulesGoOut, state)
  const afterDiscardHand = pub.myHand.filter((c) => c.id !== discardId)
  const discardCardObj = pub.myHand.find((c) => c.id === discardId)

  // Evaluate as if we discarded (hand without that card) without mutating turn order.
  const simulatedPub: AiPublicState = {
    ...pub,
    myHand: afterDiscardHand,
    myFootCount:
      !pub.isPlayingFoot && afterDiscardHand.length === 0
        ? pub.myFootCount
        : pub.isPlayingFoot
          ? afterDiscardHand.length
          : pub.myFootCount,
    isPlayingFoot:
      pub.isPlayingFoot ||
      (afterDiscardHand.length === 0 && pub.myFootCount > 0),
  }

  let value = evaluatePosition(simulatedPub, state.playerCount, beliefs).score

  if (rulesGoOut && discardId) {
    value += 800
  } else if (goOutReady && pub.isPlayingFoot) {
    // Reward getting down to a closable hand; punish parking with dumpable cards.
    value += Math.max(0, 8 - pub.myHand.length) * 45
    const teamRanks = new Set(pub.myTeamBooks.map((b) => b.rank))
    const dumpableLeft = afterDiscardHand.filter(
      (c) =>
        (!isWildCard(c) && !isRedThree(c) && teamRanks.has(c.rank)) ||
        (isWildCard(c) &&
          pub.myTeamBooks.some((b) => !isCleanBook(b) && bookWildCount(b) < 2)),
    ).length
    value -= dumpableLeft * 90
  }

  // Missing dirty while holding a wild and a completed clean — bad terminal.
  if (
    teamHasCompletedCleanBook(pub.myTeamBooks) &&
    !teamHasCompletedDirtyBook(pub.myTeamBooks) &&
    pub.myHand.some((c) => isWildCard(c) && !isRedThree(c))
  ) {
    value -= 250
  }

  if (discardCardObj && isRedThree(discardCardObj)) {
    value += 200
  }

  // Prefer dumping high-point dead cards.
  if (discardCardObj && !isWildCard(discardCardObj)) {
    value += cardPointValue(discardCardObj) * 0.4
  }

  return { value, discardId }
}

/**
 * Expectimax-style discard: score each candidate by retain EV, feed risk,
 * book utility, and end-of-round penalty exposure.
 */
export function pickExpertDiscard(
  pub: AiPublicState,
  beliefs: CardBeliefs,
  goingOut: boolean,
  state: GameState,
): string {
  const hand = pub.myHand
  if (hand.length === 0) return ''

  if (goingOut) {
    const naturals = hand.filter((c) => !isWildCard(c) && !isRedThree(c))
    if (naturals.length > 0) {
      return [...naturals].sort((a, b) => cardPointValue(b) - cardPointValue(a))[0].id
    }
    const deuces = hand.filter((c) => c.rank === '2')
    if (deuces.length > 0) return deuces[0].id
    return hand[0].id
  }

  const redThrees = hand.filter(isRedThree)
  if (redThrees.length > 0) return redThrees[0].id

  const opponents = pub.otherPlayers.filter((p) => p.teamId !== pub.myTeamId)
  const opponentCards = opponents.reduce((s, p) => s + p.handCount + p.footCount, 0)
  const partners = pub.otherPlayers.filter((p) => p.teamId === pub.myTeamId)
  const partnerCards = partners.reduce((s, p) => s + p.handCount + p.footCount, 0)
  const teamRanks = new Set(pub.myTeamBooks.map((b) => b.rank))
  const opponentRanks = new Set(
    pub.allTableBooks
      .filter((b) => b.teamId !== pub.myTeamId)
      .map((b) => b.rank),
  )

  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  const jokers = wilds.filter((c) => c.rank === 'Joker')
  const deuces = wilds.filter((c) => c.rank === '2')
  const naturals = hand.filter((c) => !isWildCard(c) && !isRedThree(c))

  let candidates: Card[]
  if (naturals.length > 0) candidates = naturals
  else if (deuces.length > 0) candidates = deuces
  else if (jokers.length > 0) candidates = jokers
  else candidates = hand.filter((c) => !isRedThree(c))

  const urgency = meldPressure(pub)
  const scored = candidates.map((card) => {
    // Higher discardScore = more eager to discard.
    let discardScore = cardPointValue(card)

    if (!isWildCard(card)) {
      const sameRank = hand.filter(
        (c) => c.rank === card.rank && !isWildCard(c) && !isRedThree(c),
      ).length
      // Breaking pairs/sets is costly.
      discardScore -= sameRank >= 3 ? 90 : sameRank === 2 ? 55 : 0
      if (teamRanks.has(card.rank)) discardScore -= 70
      // Keep ranks opponents already booked (they can't start another) — safer discards.
      if (opponentRanks.has(card.rank)) discardScore += 12
      // Soft feed risk via card counting.
      discardScore -= discardFeedRisk(beliefs, card.rank, opponentCards) * 8
      // Partner may still need this rank for a book.
      if (!teamRanks.has(card.rank) && sameRank === 1) {
        discardScore -= discardFeedRisk(beliefs, card.rank, partnerCards) * 3
      }
      discardScore -= cardRetainValue(card, hand, pub.myTeamBooks) * 0.6
    } else if (card.rank === 'Joker') {
      discardScore -= 600
    } else {
      discardScore -= 180
      // If no dirty slot remains and hand is drowning in deuces, shedding becomes ok.
      const dirtySlots = pub.myTeamBooks.filter(
        (b) => !isCleanBook(b) && bookWildCount(b) < 2,
      ).length
      if (dirtySlots === 0 && deuces.length >= 3 && urgency === 'high') {
        discardScore += 40
      }
    }

    // Monte-Carlo-ish one-step: value of position without this card.
    const leftover = hand.filter((c) => c.id !== card.id)
    const leftoverPub: AiPublicState = { ...pub, myHand: leftover }
    const pos = evaluatePosition(leftoverPub, state.playerCount, beliefs).score
    discardScore += pos * 0.02

    return { card, discardScore }
  })

  scored.sort((a, b) => b.discardScore - a.discardScore)
  return scored[0].card.id
}

function expandNode(
  node: BeamNode,
  chatMessages: ChatMessage[],
): BeamNode[] {
  const state = node.state
  if (state.turnPhase !== 'play') return []
  if (canPlayerGoOut(state, chatMessages)) return []

  const pub = buildAiPublicState(state, state.currentPlayerIndex)
  const children: BeamNode[] = []

  if (!pub.teamMeldThresholdMet) {
    const required = Math.max(0, pub.requiredMeld - pub.meldPointsThisTurn)
    const urgency = initialMeldUrgency(pub.requiredMeld, meldPressure(pub))
    let plan = planExpertInitialMeld(
      pub.myHand,
      pub.myTeamBooks,
      required,
      urgency,
      pub.isPlayingFoot,
    )
    if (!plan && urgency !== 'high') {
      plan = planExpertInitialMeld(
        pub.myHand,
        pub.myTeamBooks,
        required,
        'high',
        pub.isPlayingFoot,
      )
    }
    if (plan && plan.length > 0) {
      const result = commitStagedMelds(cloneState(state), plan)
      if (!result.error) {
        const nextPub = buildAiPublicState(result.state, result.state.currentPlayerIndex)
        const value = evaluatePosition(nextPub, result.state.playerCount).score
        children.push({
          state: result.state,
          plays: [...node.plays, { type: 'initialMeld', groups: plan }],
          value,
        })
      }
    }
    return children
  }

  // Near go-out: keep one discard card.
  const team = getTeam(state, pub.myTeamId)
  if (
    pub.isPlayingFoot &&
    pub.myHand.length === 1 &&
    canTeamGoOut(team.books, team.meldThresholdMet)
  ) {
    return []
  }

  for (const add of candidateAdds(state, chatMessages)) {
    const result = addToBook(cloneState(state), add.bookId, add.cardIds)
    if (result.error) continue
    const nextPub = buildAiPublicState(result.state, result.state.currentPlayerIndex)
    children.push({
      state: result.state,
      plays: [
        ...node.plays,
        { type: 'addToBook', bookId: add.bookId, cardIds: add.cardIds },
      ],
      value: evaluatePosition(nextPub, result.state.playerCount).score + add.score * 0.05,
    })
  }

  for (const start of candidateStarts(state)) {
    const result = startBook(cloneState(state), start.cardIds)
    if (result.error) continue
    const nextPub = buildAiPublicState(result.state, result.state.currentPlayerIndex)
    children.push({
      state: result.state,
      plays: [...node.plays, { type: 'startBook', cardIds: start.cardIds }],
      value: evaluatePosition(nextPub, result.state.playerCount).score + start.score * 0.05,
    })
  }

  return children
}

/**
 * Beam-search the meld sequence, then append an expectimax discard.
 * Acts as a shallow game-tree policy with a TD-style value function at the leaves.
 */
export function planExpertTurn(
  state: GameState,
  chatMessages: ChatMessage[] = [],
): ExpertPlay[] {
  let beams: BeamNode[] = [
    {
      state: cloneState(state),
      plays: [],
      value: evaluatePosition(
        buildAiPublicState(state, state.currentPlayerIndex),
        state.playerCount,
      ).score,
    },
  ]

  let bestTerminal: { plays: ExpertPlay[]; value: number } | null = null
  const rootPub = buildAiPublicState(state, state.currentPlayerIndex)
  const raceMode =
    meldPressure(rootPub) === 'high' ||
    (rootPub.isPlayingFoot &&
      teamHasCompletedCleanBook(rootPub.myTeamBooks) &&
      !teamHasCompletedDirtyBook(rootPub.myTeamBooks)) ||
    (rootPub.teamMeldThresholdMet &&
      teamHasCleanAndDirtyBooks(rootPub.myTeamBooks) &&
      rootPub.isPlayingFoot)

  for (let depth = 0; depth < MAX_PLAY_DEPTH; depth++) {
    const nextBeams: BeamNode[] = []

    for (const node of beams) {
      const children = expandNode(node, chatMessages)

      // In race/endgame, keep melding while legal dump/add/start children exist.
      const mustContinue = raceMode && children.length > 0
      if (!mustContinue) {
        const terminal = terminalValue(node.state, chatMessages)
        if (!bestTerminal || terminal.value > bestTerminal.value) {
          bestTerminal = {
            plays: [...node.plays, { type: 'discard', cardId: terminal.discardId }],
            value: terminal.value,
          }
        }
      }

      if (children.length === 0) {
        const terminal = terminalValue(node.state, chatMessages)
        if (!bestTerminal || terminal.value > bestTerminal.value) {
          bestTerminal = {
            plays: [...node.plays, { type: 'discard', cardId: terminal.discardId }],
            value: terminal.value,
          }
        }
        continue
      }

      // Rank children by eventual terminal value so go-out progress isn't pruned away.
      for (const child of children) {
        const childTerminal = terminalValue(child.state, chatMessages)
        const goOutProgress =
          Number(teamHasCleanAndDirtyBooks(
            buildAiPublicState(child.state, child.state.currentPlayerIndex).myTeamBooks,
          )) *
            200 +
          (rootPub.myHand.length -
            buildAiPublicState(child.state, child.state.currentPlayerIndex).myHand.length) *
            25
        child.value = childTerminal.value + goOutProgress * 0.15 + child.value * 0.05
        nextBeams.push(child)
      }
    }

    if (nextBeams.length === 0) break

    nextBeams.sort((a, b) => b.value - a.value)
    beams = nextBeams.slice(0, BEAM_WIDTH)
  }

  // Evaluate final beams as terminals too.
  for (const node of beams) {
    const terminal = terminalValue(node.state, chatMessages)
    if (!bestTerminal || terminal.value > bestTerminal.value) {
      bestTerminal = {
        plays: [...node.plays, { type: 'discard', cardId: terminal.discardId }],
        value: terminal.value,
      }
    }
  }

  if (bestTerminal) return bestTerminal.plays

  // Absolute fallback: discard something legal.
  const pub = buildAiPublicState(state, state.currentPlayerIndex)
  const beliefs = buildCardBeliefs(pub, state.playerCount)
  const discardId = pickExpertDiscard(
    pub,
    beliefs,
    canGoOut(state) || canPlayerGoOut(state, chatMessages),
    state,
  )
  return [{ type: 'discard', cardId: discardId }]
}

/**
 * Apply expert plan to game state. Handles late wild dumps before discard
 * when the planner did not already empty useful wilds.
 */
export function applyExpertPlan(
  state: GameState,
  plan: ExpertPlay[],
  chatMessages: ChatMessage[],
): { state: GameState; debugSteps: Array<{ phase: string; detail: string }> } {
  let current = state
  const debugSteps: Array<{ phase: string; detail: string }> = []

  for (const play of plan) {
    if (play.type === 'initialMeld') {
      const result = commitStagedMelds(current, play.groups)
      if (!result.error) {
        current = result.state
        debugSteps.push({
          phase: 'initial',
          detail: `Expert initial meld: ${play.groups.length} book(s)`,
        })
      } else {
        debugSteps.push({ phase: 'initial', detail: `Failed: ${result.error}` })
      }
    } else if (play.type === 'addToBook') {
      const result = addToBook(current, play.bookId, play.cardIds)
      if (!result.error) {
        current = result.state
        debugSteps.push({
          phase: 'add',
          detail: `Expert add ${play.cardIds.length} card(s)`,
        })
      }
    } else if (play.type === 'startBook') {
      const result = startBook(current, play.cardIds)
      if (!result.error) {
        current = result.state
        debugSteps.push({
          phase: 'start',
          detail: `Expert start book (${play.cardIds.length} cards)`,
        })
      }
    } else if (play.type === 'discard') {
      // Opportunistic lone-wild dump if still holding a placeable wild.
      if (!canPlayerGoOut(current, chatMessages)) {
        const pub = buildAiPublicState(current, current.currentPlayerIndex)
        const loneWild = pickLoneWildAdd(
          pub.myHand,
          pub.myTeamBooks,
          current.booksWithWildAddedThisTurn,
        )
        if (loneWild && loneWild.cardId !== play.cardId) {
          const wildResult = addToBook(current, loneWild.bookId, [loneWild.cardId])
          if (!wildResult.error) {
            current = wildResult.state
            debugSteps.push({ phase: 'wild', detail: 'Expert parked lone wild on dirty book' })
          }
        } else if (!loneWild) {
          const refreshed = buildAiPublicState(current, current.currentPlayerIndex)
          if (refreshed.teamMeldThresholdMet) {
            const wildStart = pickWildStartBook(
              refreshed.myHand,
              refreshed.myTeamBooks,
              refreshed.isPlayingFoot,
            )
            if (wildStart && !wildStart.includes(play.cardId)) {
              const startResult = startBook(current, wildStart)
              if (!startResult.error) {
                current = startResult.state
                debugSteps.push({ phase: 'wild', detail: 'Expert started dirty book with wild' })
              }
            }
          }
        }
      }

      // Recompute discard if wild dump changed the hand.
      let discardId = play.cardId
      const hand = current.players[current.currentPlayerIndex]?.hand ?? []
      if (!hand.some((c) => c.id === discardId)) {
        const pub = buildAiPublicState(current, current.currentPlayerIndex)
        const beliefs = buildCardBeliefs(pub, current.playerCount)
        discardId = pickExpertDiscard(
          pub,
          beliefs,
          canPlayerGoOut(current, chatMessages),
          current,
        )
      }

      const result = discardCard(current, discardId, chatMessages)
      if (!result.error) {
        current = result.state
        debugSteps.push({ phase: 'discard', detail: `Expert discard ${discardId}` })
      } else {
        debugSteps.push({ phase: 'discard', detail: `Discard failed: ${result.error}` })
      }
    }
  }

  return { state: current, debugSteps }
}
