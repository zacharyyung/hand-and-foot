import type { GameState } from '../deal'
import { getTeam } from '../actions'
import { getGoOutBlockReason } from '../books'
import { buildAiPublicState } from './publicState'
import { isRedThree } from '../cards'
import { heldCardPenalty } from '../scoring'
import {
  APPROVE_GO_OUT_TEXT,
  awaitingPartnerGoOutResponse,
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  createReadyGoOutSignal,
  DENY_GO_OUT_TEXT,
  pendingPartnerGoOutRequest,
  teamCanGoOut,
  type ChatMessage,
} from '../chat'
import type { PlayerCount } from '../teams'
import { partnerSeat } from '../teams'

export interface PartnerGoOutRecommendation {
  approve: boolean
  message: string
}

/** AI partner weighs books, foot progress, and opponent card piles. */
export function analyzePartnerGoOutRequest(
  state: GameState,
  aiSeatIndex: number,
): PartnerGoOutRecommendation {
  const player = state.players[aiSeatIndex]
  const partnerIdx = partnerSeat(aiSeatIndex, state.playerCount as PlayerCount)
  const team = getTeam(state, player.profile.teamId)
  const pub = buildAiPublicState(state, aiSeatIndex)
  const partnerInfo = pub.otherPlayers.find((p) => p.seatIndex === partnerIdx)
  const difficulty = player.profile.aiDifficulty ?? 'normal'

  const blockReason = getGoOutBlockReason(team.books, team.meldThresholdMet)
  if (blockReason) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} ${blockReason}`,
    }
  }

  const opponents = pub.otherPlayers.filter((p) => p.teamId !== pub.myTeamId)
  const opponentCards = opponents.reduce((sum, p) => sum + p.handCount + p.footCount, 0)
  const opponentRacing = opponents.some(
    (p) => p.isPlayingFoot && p.footCount === 0 && p.handCount <= 3,
  )
  const opponentLow = opponents.some((p) => p.handCount + p.footCount <= 5)

  const partnerInFoot = partnerInfo?.isPlayingFoot ?? false
  const partnerHand = partnerInfo?.handCount ?? 99
  const partnerFootLeft = partnerInfo?.footCount ?? 0
  const partnerClosing =
    partnerInFoot && partnerFootLeft === 0 && partnerHand <= 3
  const partnerStillInHand = !partnerInFoot || partnerFootLeft > 0

  const aiCardsLeft = pub.myHand.length + pub.myFootCount
  const aiAlsoLow = aiCardsLeft <= 4

  const aiHand = player.hand
  const redThrees = aiHand.filter(isRedThree).length
  const handPenalty = heldCardPenalty(aiHand)

  let score = 0
  if (teamCanGoOut(state, team.id)) score += 4
  if (partnerClosing) score += 5
  if (partnerStillInHand && partnerHand > 5) score -= 4
  if (opponentCards >= 18) score += 3
  if (opponentCards >= 24) score += 2
  if (opponentRacing) score -= 3
  if (opponentLow && !opponentRacing) score += 1
  if (aiCardsLeft >= 10 && opponentCards >= 14) score -= 2
  if (aiAlsoLow) score += 2
  if (redThrees > 0) score -= 3 + redThrees * 2
  if (handPenalty >= 45) score -= 5
  else if (handPenalty >= 30) score -= 3

  if (difficulty === 'expert') {
    if (opponentRacing && !partnerClosing) score -= 2
    if (partnerClosing && opponentCards >= 12) score += 2
  } else if (difficulty === 'normal') {
    if (teamCanGoOut(state, team.id) && partnerInFoot) score += 1
  }

  const approve = score >= 3

  if (approve) {
    if (partnerClosing && opponentCards >= 18) {
      return {
        approve: true,
        message: `${APPROVE_GO_OUT_TEXT} Opponents still hold a lot of cards.`,
      }
    }
    if (partnerClosing && opponentRacing) {
      return {
        approve: true,
        message: `${APPROVE_GO_OUT_TEXT} Go now — they're closing too.`,
      }
    }
    if (partnerClosing) {
      return {
        approve: true,
        message: `${APPROVE_GO_OUT_TEXT} You're in foot and our books are set.`,
      }
    }
    if (opponentCards >= 20) {
      return {
        approve: true,
        message: `${APPROVE_GO_OUT_TEXT} Good time to strand the other team.`,
      }
    }
    if (aiAlsoLow) {
      return {
        approve: true,
        message: `${APPROVE_GO_OUT_TEXT} We're both low — close it out.`,
      }
    }
    return {
      approve: true,
      message: APPROVE_GO_OUT_TEXT,
    }
  }

  if (partnerStillInHand && !partnerInFoot) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} Pick up your foot first.`,
    }
  }
  if (partnerStillInHand && partnerFootLeft > 0) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} You still have foot cards to play.`,
    }
  }
  if (opponentRacing) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} Opponents are close — keep building points.`,
    }
  }
  if (aiCardsLeft >= 10 && opponentCards >= 14) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} I still have cards to meld — wait a bit.`,
    }
  }
  if (redThrees > 0 && handPenalty >= 25) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} I still have red threes and high-value cards to play.`,
    }
  }
  if (handPenalty >= 40) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} I still have a lot of points in my hand.`,
    }
  }
  if (!partnerClosing && partnerHand > 3) {
    return {
      approve: false,
      message: `${DENY_GO_OUT_TEXT} You're not down to your last cards yet.`,
    }
  }
  return {
    approve: false,
    message: DENY_GO_OUT_TEXT,
  }
}

/** AI asks partner when in foot with books set — chat is advisory. */
export function maybeAiChatSignal(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): ChatMessage | null {
  const player = state.players[seatIndex]
  if (player.profile.isHuman) return null
  if (state.currentPlayerIndex !== seatIndex) return null
  if (state.turnPhase !== 'play') return null

  const team = getTeam(state, player.profile.teamId)
  if (!teamCanGoOut(state, team.id)) return null

  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) return null

  const pub = buildAiPublicState(state, seatIndex)
  if (!pub.isPlayingFoot) return null

  const closing = pub.myFootCount === 0 && pub.myHand.length <= 4
  if (!closing) return null

  return createReadyGoOutSignal(
    seatIndex,
    player.profile.name,
    player.profile.avatar,
  )
}

/** Seats where an AI partner still needs to reply to a teammate's go-out ask. */
export function aiPartnerGoOutReplySeats(
  state: GameState,
  messages: ChatMessage[],
): number[] {
  const seats: number[] = []
  const playerCount = state.playerCount as PlayerCount

  for (let seat = 0; seat < state.playerCount; seat++) {
    if (state.players[seat].profile.isHuman) continue
    const partnerIdx = partnerSeat(seat, playerCount)
    if (pendingPartnerGoOutRequest(messages, seat, partnerIdx)) {
      seats.push(seat)
    }
  }

  return seats
}

/** AI partner replies with a situational yes/no when teammate asks to go out. */
export function maybeAiPartnerGoOutResponse(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): ChatMessage | null {
  const player = state.players[seatIndex]
  if (player.profile.isHuman) return null

  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  const pending = pendingPartnerGoOutRequest(messages, seatIndex, partnerIdx)
  if (!pending) return null

  const recommendation = analyzePartnerGoOutRequest(state, seatIndex)

  if (recommendation.approve) {
    return createApproveGoOutSignal(
      seatIndex,
      player.profile.name,
      player.profile.avatar,
      recommendation.message,
    )
  }

  return createDenyGoOutSignal(
    seatIndex,
    player.profile.name,
    player.profile.avatar,
    recommendation.message,
  )
}

export function partnerGoOutSignaledInChat(
  messages: ChatMessage[],
  state: GameState,
  myTeamId: number,
): boolean {
  return messages.some(
    (m) =>
      m.type === 'ready_go_out' &&
      state.players[m.senderSeatIndex]?.profile.teamId === myTeamId,
  )
}
