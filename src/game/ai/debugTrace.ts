import { cardLabel } from '../cards'
import type { Card } from '../cards'
import type { AiDifficulty, GameState } from '../deal'
import { getTeam } from '../actions'
import type { ChatMessage } from '../chat'
import { findAddToBookActions, findStartBookActions } from './decisions'
import { buildAiPublicState } from './publicState'
import {
  initialMeldUrgency,
  meldPressure,
  pickBestAddToBook,
  pickBestStartWhenUnlocked,
  pickDiscardCard,
  planInitialMeld,
  teamNeedsCleanBook,
  teamNeedsDirtyBook,
} from './strategy'

export interface AiDebugStep {
  phase: string
  detail: string
}

export interface AiDebugTurnTrace {
  seatIndex: number
  playerName: string
  difficulty: AiDifficulty
  roundNumber: number
  steps: AiDebugStep[]
  handAtStart: Card[]
  footAtStart: Card[]
}

export interface AiDebugSnapshot {
  seatIndex: number
  playerName: string
  difficulty: AiDifficulty
  isPlayingFoot: boolean
  footOnHold: boolean
  hand: Card[]
  foot: Card[]
  urgency: 'low' | 'medium' | 'high'
  teamMeldThresholdMet: boolean
  requiredMeld: number
  meldPointsThisTurn: number
  teamScore: number
  needsCleanBook: boolean
  needsDirtyBook: boolean
  startActionCount: number
  addActionCount: number
  topStarts: string[]
  topAdds: string[]
  initialMeldPlan: string | null
  bestStartPreview: string | null
  bestAddPreview: string | null
  discardPreview: string | null
  notes: string[]
}

export class AiDebugCollector {
  readonly trace: AiDebugTurnTrace

  constructor(
    seatIndex: number,
    playerName: string,
    difficulty: AiDifficulty,
    roundNumber: number,
    hand: Card[],
    foot: Card[],
  ) {
    this.trace = {
      seatIndex,
      playerName,
      difficulty,
      roundNumber,
      steps: [],
      handAtStart: [...hand],
      footAtStart: [...foot],
    }
  }

  step(phase: string, detail: string): void {
    this.trace.steps.push({ phase, detail })
  }
}

function formatCards(cards: Card[]): string {
  if (cards.length === 0) return '(empty)'
  return cards.map(cardLabel).join(' ')
}

function formatCardIds(hand: Card[], ids: string[]): string {
  const labels = ids.map((id) => {
    const card = hand.find((c) => c.id === id)
    return card ? cardLabel(card) : id
  })
  return labels.join(' ')
}

export function buildAiDebugSnapshot(
  state: GameState,
  seatIndex: number,
  chatMessages: ChatMessage[] = [],
): AiDebugSnapshot | null {
  const player = state.players[seatIndex]
  if (!player || player.profile.isHuman) return null

  const pub = buildAiPublicState(state, seatIndex)
  const team = getTeam(state, pub.myTeamId)
  const difficulty = player.profile.aiDifficulty ?? 'normal'
  const urgency = meldPressure(pub)
  const notes: string[] = []

  const startActions = findStartBookActions(
    pub.myHand,
    pub.myTeamBooks,
    pub.isPlayingFoot,
    pub.teamMeldThresholdMet,
  )
  const addActions = findAddToBookActions(
    pub.myHand,
    pub.myTeamBooks,
    pub.isPlayingFoot,
    state.booksWithWildAddedThisTurn,
    team.meldThresholdMet,
  )
  const startBookActions = startActions.filter((a) => a.type === 'startBook')

  const required = Math.max(0, pub.requiredMeld - pub.meldPointsThisTurn)
  const openUrgency = initialMeldUrgency(pub.requiredMeld, urgency)
  let plan = !pub.teamMeldThresholdMet
    ? planInitialMeld(
        pub.myHand,
        pub.myTeamBooks,
        required,
        openUrgency,
        difficulty,
        pub.isPlayingFoot,
      )
    : null
  if (!plan && !pub.teamMeldThresholdMet && openUrgency !== 'high') {
    plan = planInitialMeld(
      pub.myHand,
      pub.myTeamBooks,
      required,
      'high',
      difficulty,
      pub.isPlayingFoot,
    )
    if (plan) notes.push('Initial meld only works at high urgency retry.')
  }

  const bestAdd = pub.teamMeldThresholdMet
    ? pickBestAddToBook(
        addActions,
        pub,
        state.booksWithWildAddedThisTurn,
        difficulty,
        chatMessages,
        state,
      )
    : null

  if (pub.teamMeldThresholdMet && addActions.length > 0 && !bestAdd) {
    notes.push('Add actions exist but scoring filtered them all out (e.g. dirtying clean book).')
  }

  const bestStart = pub.teamMeldThresholdMet
    ? pickBestStartWhenUnlocked(
        pub.myHand,
        pub.myTeamBooks,
        urgency,
        difficulty,
        pub.isPlayingFoot,
      )
    : null

  const discardId = pickDiscardCard(
    pub.myHand,
    pub.myTeamBooks,
    difficulty,
    false,
    pub.allTableBooks
      .filter((b) => b.teamId !== pub.myTeamId)
      .map((b) => b.rank),
  )
  const discardPreviewCard = pub.myHand.find((c) => c.id === discardId)

  if (!pub.teamMeldThresholdMet && startBookActions.length === 0) {
    notes.push('No legal start-book combos (foot discard rule or rank conflicts).')
  }
  if (!pub.teamMeldThresholdMet && startBookActions.length > 0 && !plan) {
    notes.push(`Has ${startBookActions.length} start option(s) but no plan meets ${required} pts.`)
  }
  if (pub.teamMeldThresholdMet && addActions.length === 0 && !bestStart) {
    notes.push('Unlocked but no add or start actions available.')
  }
  if (difficulty === 'normal') {
    notes.push(
      'Normal mode may randomly skip melds in hand (~2–10%); foot turns never sandbag.',
    )
  }

  const topStarts = [...startBookActions]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((a) => `${formatCardIds(pub.myHand, a.cardIds)} (${a.score} pts)`)

  const topAdds = addActions
    .slice(0, 5)
    .map((a) => {
      const book = pub.myTeamBooks.find((b) => b.id === a.bookId)
      const rank = book?.rank ?? '?'
      return `${rank}: ${formatCardIds(pub.myHand, a.cardIds)} (p${a.priority})`
    })

  return {
    seatIndex,
    playerName: player.profile.name,
    difficulty,
    isPlayingFoot: player.isPlayingFoot,
    footOnHold: player.footOnHold,
    hand: [...player.hand],
    foot: [...player.foot],
    urgency,
    teamMeldThresholdMet: pub.teamMeldThresholdMet,
    requiredMeld: pub.requiredMeld,
    meldPointsThisTurn: pub.meldPointsThisTurn,
    teamScore: pub.teamScore,
    needsCleanBook: teamNeedsCleanBook(pub.myTeamBooks),
    needsDirtyBook: teamNeedsDirtyBook(pub.myTeamBooks),
    startActionCount: startBookActions.length,
    addActionCount: addActions.length,
    topStarts,
    topAdds,
    initialMeldPlan: plan
      ? plan.map((book) => formatCardIds(pub.myHand, book)).join(' | ')
      : null,
    bestStartPreview: bestStart ? formatCardIds(pub.myHand, bestStart) : null,
    bestAddPreview: bestAdd
      ? `${pub.myTeamBooks.find((b) => b.id === bestAdd.bookId)?.rank ?? '?'}: ${formatCardIds(pub.myHand, bestAdd.cardIds)}`
      : null,
    discardPreview: discardPreviewCard ? cardLabel(discardPreviewCard) : null,
    notes,
  }
}

export function formatAiDebugSnapshot(snapshot: AiDebugSnapshot): string[] {
  const lines = [
    `Urgency: ${snapshot.urgency} · ${snapshot.difficulty} · team ${snapshot.teamScore} pts`,
    snapshot.teamMeldThresholdMet
      ? 'Team meld threshold met — free melding.'
      : `Need initial meld: ${snapshot.requiredMeld} pts (${snapshot.meldPointsThisTurn} this turn).`,
    `Book needs: ${snapshot.needsCleanBook ? 'clean ' : ''}${snapshot.needsDirtyBook ? 'dirty' : ''}`.trim(),
    `Hand (${snapshot.hand.length}): ${formatCards(snapshot.hand)}`,
    `Foot (${snapshot.foot.length}${snapshot.isPlayingFoot ? ', playing' : ''}${snapshot.footOnHold ? ', on hold' : ''}): ${formatCards(snapshot.foot)}`,
    `Start options: ${snapshot.startActionCount} · Add options: ${snapshot.addActionCount}`,
  ]

  if (snapshot.initialMeldPlan) {
    lines.push(`Initial meld plan: ${snapshot.initialMeldPlan}`)
  }
  if (snapshot.bestAddPreview) {
    lines.push(`Top add pick: ${snapshot.bestAddPreview}`)
  }
  if (snapshot.topStarts.length > 0) {
    lines.push(`Top starts: ${snapshot.topStarts.join('; ')}`)
  }
  if (snapshot.topAdds.length > 0) {
    lines.push(`Sample adds: ${snapshot.topAdds.join('; ')}`)
  }
  if (snapshot.bestStartPreview) {
    lines.push(`Best new book: ${snapshot.bestStartPreview}`)
  }
  if (snapshot.discardPreview) {
    lines.push(`Would discard: ${snapshot.discardPreview}`)
  }
  lines.push(...snapshot.notes.map((n) => `Note: ${n}`))
  return lines
}
