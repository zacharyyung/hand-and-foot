import type { PlayerCount } from './teams'
import { partnerSeat, teamIdForSeat } from './teams'
import type { GameState, PlayerState } from './deal'
import { isCleanBook, teamHasCleanAndDirtyBooks, type Book } from './books'

export type ChatMessageType =
  | 'ready_go_out'
  | 'approve_go_out'
  | 'deny_go_out'
  | 'partner_reply'
  | 'wild_request'
  | 'wild_approve'
  | 'wild_deny'

export interface ChatMessage {
  id: string
  senderSeatIndex: number
  senderName: string
  senderAvatar: string
  text: string
  timestamp: number
  type: ChatMessageType
  /** Target book when AI asks to dirty a clean book with a wild. */
  bookId?: string
}

export const READY_GO_OUT_SIGNAL_TEXT = 'I can go out!'
export const APPROVE_GO_OUT_TEXT = 'Yes — you can go out!'
export const DENY_GO_OUT_TEXT = "No — don't go out."

export function isGoOutRequest(type: ChatMessageType): boolean {
  return type === 'ready_go_out'
}

function isOnLastFootCard(player: PlayerState): boolean {
  return (
    player.isPlayingFoot &&
    player.hand.length === 1 &&
    player.foot.length === 0 &&
    !player.footOnHold
  )
}

/** Playing foot with books set — partner chat is advisory, not required to signal. */
export function canInitiateGoOutSignal(state: GameState, seatIndex: number): boolean {
  if (state.phase !== 'playing' || state.currentPlayerIndex !== seatIndex) return false
  if (state.turnPhase !== 'play') return false
  const player = state.players[seatIndex]
  if (!player.isPlayingFoot) return false
  return teamReadyToGoOut(state, player.profile.teamId)
}

function teamReadyToGoOut(state: GameState, teamId: number): boolean {
  const team = state.teams.find((t) => t.id === teamId)
  if (!team?.meldThresholdMet) return false
  return teamHasCleanAndDirtyBooks(team.books)
}

function partnerDeniedGoOut(
  messages: ChatMessage[],
  partnerIdx: number,
  afterTimestamp: number,
): boolean {
  const response = partnerResponseAfter(messages, partnerIdx, afterTimestamp)
  if (response?.type === 'deny_go_out') return true
  if (response?.type === 'partner_reply') {
    return parsePartnerReplyIntent(response.text) === 'deny'
  }
  return false
}

/** Partner said no to the latest go-out ask (advisory — does not block going out). */
export function unresolvedPartnerDenial(
  messages: ChatMessage[],
  requesterSeat: number,
  playerCount: PlayerCount,
): ChatMessage | null {
  const latest = latestReadyGoOutFrom(messages, requesterSeat)
  if (!latest) return null

  const partnerIdx = partnerSeat(requesterSeat, playerCount)
  if (awaitingPartnerGoOutResponse(messages, requesterSeat, partnerIdx)) return null

  const response = partnerResponseAfter(messages, partnerIdx, latest.timestamp)
  if (!response || !isGoOutResponse(response.type)) return null
  if (!partnerDeniedGoOut(messages, partnerIdx, latest.timestamp)) {
    return null
  }

  const laterAsk = messages.some(
    (m) =>
      m.type === 'ready_go_out' &&
      m.senderSeatIndex === requesterSeat &&
      m.timestamp > response.timestamp,
  )
  return laterAsk ? null : response
}

/** Only the partner of a pending go-out request may reply yes/no. */
export function canRespondToPartnerGoOutRequest(
  messages: ChatMessage[],
  responderSeat: number,
  playerCount: PlayerCount,
): boolean {
  const partnerIdx = partnerSeat(responderSeat, playerCount)
  return pendingPartnerGoOutRequest(messages, responderSeat, partnerIdx) !== null
}

export function isAllowedChatMessage(
  state: GameState,
  message: ChatMessage,
  existingMessages: ChatMessage[],
): boolean {
  if (state.phase !== 'playing') return false

  if (message.type === 'ready_go_out') {
    return canInitiateGoOutSignal(state, message.senderSeatIndex)
  }

  if (isGoOutResponse(message.type)) {
    return canRespondToPartnerGoOutRequest(
      existingMessages,
      message.senderSeatIndex,
      state.playerCount as PlayerCount,
    )
  }

  if (message.type === 'wild_approve' || message.type === 'wild_deny') {
    return canRespondToPartnerWildRequest(
      existingMessages,
      message.senderSeatIndex,
      state.playerCount as PlayerCount,
    )
  }

  return false
}

export function isGoOutResponse(type: ChatMessageType): boolean {
  return type === 'approve_go_out' || type === 'deny_go_out' || type === 'partner_reply'
}

/** Public go-out intent — rivals watch for this, not partner yes/no replies. */
export function isGoOutRelatedSignal(type: ChatMessageType): boolean {
  return type === 'ready_go_out'
}

export function createReadyGoOutSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: READY_GO_OUT_SIGNAL_TEXT,
    timestamp: Date.now(),
    type: 'ready_go_out',
  }
}

export function createApproveGoOutSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  text: string = APPROVE_GO_OUT_TEXT,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text,
    timestamp: Date.now(),
    type: 'approve_go_out',
  }
}

export function createDenyGoOutSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  text: string = DENY_GO_OUT_TEXT,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text,
    timestamp: Date.now(),
    type: 'deny_go_out',
  }
}

export function createPartnerReplySignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  text: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: text.trim(),
    timestamp: Date.now(),
    type: 'partner_reply',
  }
}

export function createWildRequestSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  bookRank: string,
  bookId: string,
): ChatMessage {
  const rankLabel = bookRank === 'Joker' ? 'joker' : bookRank
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: `Can I add a wild to our ${rankLabel}s book? It's clean right now.`,
    timestamp: Date.now(),
    type: 'wild_request',
    bookId,
  }
}

export function createWildApproveSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: 'Yes — go ahead with the wild.',
    timestamp: Date.now(),
    type: 'wild_approve',
  }
}

export function createWildDenySignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: 'No — keep that book clean for now.',
    timestamp: Date.now(),
    type: 'wild_deny',
  }
}

function latestWildRequestFrom(messages: ChatMessage[], senderSeat: number): ChatMessage | null {
  let latest: ChatMessage | null = null
  for (const msg of messages) {
    if (msg.senderSeatIndex !== senderSeat || msg.type !== 'wild_request') continue
    if (!latest || msg.timestamp > latest.timestamp) latest = msg
  }
  return latest
}

/** AI partner asked to wild a clean book — waiting for human reply. */
export function pendingPartnerWildRequest(
  messages: ChatMessage[],
  responderSeat: number,
  aiPartnerSeat: number,
): ChatMessage | null {
  const request = latestWildRequestFrom(messages, aiPartnerSeat)
  if (!request) return null

  const responded = messages.some(
    (m) =>
      m.senderSeatIndex === responderSeat &&
      (m.type === 'wild_approve' || m.type === 'wild_deny') &&
      m.timestamp > request.timestamp,
  )
  return responded ? null : request
}

/** Resolve which team book an AI wild request targets (for inline consent UI). */
export function wildRequestTargetBook(
  request: ChatMessage,
  books: Book[],
): Book | null {
  if (request.bookId) {
    const byId = books.find((b) => b.id === request.bookId)
    if (byId) return byId
  }

  const match = request.text.match(/our (.+?)s book/i)
  if (!match) return null
  const rankLabel = match[1]!.trim().toLowerCase()
  const rank = rankLabel === 'joker' ? 'Joker' : rankLabel.toUpperCase()

  const cleanMatches = books.filter((b) => b.rank === rank && isCleanBook(b))
  if (cleanMatches.length === 0) return null
  return [...cleanMatches].sort((a, b) => b.cards.length - a.cards.length)[0]!
}

export function canRespondToPartnerWildRequest(
  messages: ChatMessage[],
  responderSeat: number,
  playerCount: PlayerCount,
): boolean {
  const partnerIdx = partnerSeat(responderSeat, playerCount)
  return pendingPartnerWildRequest(messages, responderSeat, partnerIdx) !== null
}

export function hasPartnerWildApproval(
  messages: ChatMessage[],
  aiPartnerSeat: number,
  responderSeat: number,
): boolean {
  const request = latestWildRequestFrom(messages, aiPartnerSeat)
  if (!request) return false
  return messages.some(
    (m) =>
      m.senderSeatIndex === responderSeat &&
      m.type === 'wild_approve' &&
      m.timestamp > request.timestamp,
  )
}

/** Infer yes/no from a partner's free-form reply (for AI clearance). */
export function parsePartnerReplyIntent(
  text: string,
): 'approve' | 'deny' | 'neutral' {
  const lower = text.toLowerCase()

  const denyPatterns =
    /\b(no|don't|do not|not yet|wait|hold|stop|nope|nah|negative)\b/
  const approvePatterns =
    /\b(yes|yeah|yep|sure|go ahead|go out|do it|ok|okay|approved|affirmative|green light)\b/

  const deny = denyPatterns.test(lower)
  const approve = approvePatterns.test(lower)

  if (approve && !deny) return 'approve'
  if (deny && !approve) return 'deny'
  if (approve && deny) return 'neutral'
  return 'neutral'
}

export function latestReadyGoOutFrom(
  messages: ChatMessage[],
  seatIndex: number,
): ChatMessage | null {
  let latest: ChatMessage | null = null
  for (const msg of messages) {
    if (msg.senderSeatIndex !== seatIndex) continue
    if (msg.type !== 'ready_go_out') continue
    if (!latest || msg.timestamp > latest.timestamp) latest = msg
  }
  return latest
}

/** Partner's yes/no after a teammate's "I can go out!" request. */
export function partnerResponseAfter(
  messages: ChatMessage[],
  responderSeat: number,
  afterTimestamp: number,
): ChatMessage | null {
  let latest: ChatMessage | null = null
  for (const msg of messages) {
    if (msg.senderSeatIndex !== responderSeat) continue
    if (!isGoOutResponse(msg.type)) continue
    if (msg.timestamp <= afterTimestamp) continue
    if (!latest || msg.timestamp > latest.timestamp) latest = msg
  }
  return latest
}

/** Partner asked to go out and is waiting for this seat's yes/no. */
export function pendingPartnerGoOutRequest(
  messages: ChatMessage[],
  responderSeat: number,
  partnerSeat: number,
): ChatMessage | null {
  const partnerReady = latestReadyGoOutFrom(messages, partnerSeat)
  if (!partnerReady) return null

  const responded = messages.some(
    (m) =>
      m.senderSeatIndex === responderSeat &&
      isGoOutResponse(m.type) &&
      m.timestamp > partnerReady.timestamp,
  )
  return responded ? null : partnerReady
}

/** Requester signaled go-out and is waiting for partner's yes/no. */
export function awaitingPartnerGoOutResponse(
  messages: ChatMessage[],
  requesterSeat: number,
  partnerSeat: number,
): boolean {
  const request = latestReadyGoOutFrom(messages, requesterSeat)
  if (!request) return false

  return !messages.some(
    (m) =>
      m.senderSeatIndex === partnerSeat &&
      isGoOutResponse(m.type) &&
      m.timestamp > request.timestamp,
  )
}

/** Opponents holding many cards — AI may go out even if partner said no. */
export function opponentsHoldManyCards(state: GameState, seatIndex: number): boolean {
  const player = state.players[seatIndex]
  const myTeamId = player.profile.teamId
  let total = 0
  for (const p of state.players) {
    if (p.profile.teamId === myTeamId) continue
    total += p.hand.length + p.foot.length
  }
  return total >= 18
}

/** Whether partner advised against going out on the latest ask. */
export function partnerAdvisedAgainstGoOut(
  messages: ChatMessage[],
  requesterSeat: number,
  playerCount: PlayerCount,
): boolean {
  return unresolvedPartnerDenial(messages, requesterSeat, playerCount) !== null
}

/** Latest go-out ask still waiting on partner (informational — turn is not blocked). */
export function isAwaitingPartnerGoOutClearance(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): boolean {
  if (!teamReadyToGoOut(state, state.players[seatIndex].profile.teamId)) return false

  const myReady = latestReadyGoOutFrom(messages, seatIndex)
  if (!myReady) return false

  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  return awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)
}

function partnerApprovedGoOut(
  messages: ChatMessage[],
  partnerIdx: number,
  afterTimestamp: number,
): boolean {
  const response = partnerResponseAfter(messages, partnerIdx, afterTimestamp)
  if (response?.type === 'approve_go_out') return true
  if (response?.type === 'partner_reply') {
    return parsePartnerReplyIntent(response.text) === 'approve'
  }
  return false
}

/** Partner replied yes to the latest go-out ask. */
export function hasPartnerGoOutApproval(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): boolean {
  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  const myReady = latestReadyGoOutFrom(messages, seatIndex)
  if (!myReady) return false
  return partnerApprovedGoOut(messages, partnerIdx, myReady.timestamp)
}

/** @deprecated Partner clearance is advisory; use hasPartnerGoOutApproval or canGoOut. */
export function hasPartnerGoOutClearance(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): boolean {
  return hasPartnerGoOutApproval(state, seatIndex, messages)
}

/** Whether AI should go out now after consulting partner chat. */
export function shouldAiAttemptGoOut(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): boolean {
  const player = state.players[seatIndex]
  if (!player.isPlayingFoot || player.hand.length !== 1 || player.foot.length > 0) {
    return false
  }

  const team = state.teams.find((t) => t.id === player.profile.teamId)
  if (!team || !teamReadyToGoOut(state, team.id)) return false

  if (hasPartnerGoOutApproval(state, seatIndex, messages)) return true

  if (opponentsHoldManyCards(state, seatIndex)) return true

  if (partnerAdvisedAgainstGoOut(messages, seatIndex, state.playerCount as PlayerCount)) {
    return opponentsHoldManyCards(state, seatIndex)
  }

  return true
}

/** Advisory hint about partner go-out chat — never a hard block. */
export function getPartnerGoOutHint(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): string | null {
  const player = state.players[seatIndex]
  if (!player.isPlayingFoot || !isOnLastFootCard(player)) return null

  const team = state.teams.find((t) => t.id === player.profile.teamId)
  if (!team || !teamReadyToGoOut(state, team.id)) return null

  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  const myReady = latestReadyGoOutFrom(messages, seatIndex)

  if (!myReady) {
    return 'Tip: ask your partner in table chat before you discard to go out.'
  }

  if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) {
    return 'Waiting for partner — you may still go out if all requirements are met.'
  }

  if (partnerAdvisedAgainstGoOut(messages, seatIndex, state.playerCount as PlayerCount)) {
    return 'Partner suggests waiting, but you may go out if you think it is best.'
  }

  return null
}

/** @deprecated Use getPartnerGoOutHint — partner chat is advisory only. */
export function getPartnerGoOutBlockReason(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): string | null {
  return getPartnerGoOutHint(state, seatIndex, messages)
}

/** Any team has signaled go-out intent in table chat (visible to everyone). */
export function teamSignaledGoOut(
  messages: ChatMessage[],
  teamId: number,
  playerCount: PlayerCount,
): boolean {
  return messages.some(
    (m) =>
      m.type === 'ready_go_out' &&
      teamIdForSeat(m.senderSeatIndex, playerCount) === teamId,
  )
}

/** A rival team signaled go-out — time to race or dirty books for points. */
export function opponentTeamSignaledGoOut(
  messages: ChatMessage[],
  myTeamId: number,
  playerCount: PlayerCount,
): boolean {
  return messages.some(
    (m) =>
      m.type === 'ready_go_out' &&
      teamIdForSeat(m.senderSeatIndex, playerCount) !== myTeamId,
  )
}

export function teamCanGoOut(state: GameState, teamId: number): boolean {
  const team = state.teams.find((t) => t.id === teamId)
  if (!team) return false
  return team.meldThresholdMet && teamHasCleanAndDirtyBooks(team.books)
}

export function signalLabel(type: ChatMessageType): string {
  if (type === 'ready_go_out') return READY_GO_OUT_SIGNAL_TEXT
  if (type === 'approve_go_out') return APPROVE_GO_OUT_TEXT
  if (type === 'deny_go_out') return DENY_GO_OUT_TEXT
  return 'Partner reply'
}
