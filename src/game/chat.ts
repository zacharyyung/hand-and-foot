import type { PlayerCount } from './teams'
import { partnerSeat, teamIdForSeat } from './teams'
import type { GameState, PlayerState } from './deal'
import { teamHasCleanAndDirtyBooks } from './books'
import type { Rank } from './cards'

export type ChatMessageType =
  | 'ready_go_out'
  | 'approve_go_out'
  | 'deny_go_out'
  | 'partner_reply'
  | 'wild_request'
  | 'wild_approve'
  | 'wild_deny'

/** Proposed wild add the AI wants partner consent for. */
export interface WildBookProposal {
  bookId: string
  rank: Rank
  cardIds: string[]
}

export interface ChatMessage {
  id: string
  senderSeatIndex: number
  senderName: string
  senderAvatar: string
  text: string
  timestamp: number
  type: ChatMessageType
  wildProposal?: WildBookProposal
}

export const READY_GO_OUT_SIGNAL_TEXT = 'I can go out!'
export const APPROVE_GO_OUT_TEXT = 'Yes — you can go out!'
export const DENY_GO_OUT_TEXT = "No — don't go out."
export const APPROVE_WILD_TEXT = 'Yes — play the wild.'
export const DENY_WILD_TEXT = "No — don't play that wild."

export function wildAskText(
  rank: Rank,
  options?: { partnerOwned?: boolean; clean?: boolean },
): string {
  const rankLabel = rank === 'Joker' ? 'joker' : rank
  const whose = options?.partnerOwned ? 'your' : 'our'
  const cleanNote = options?.clean ? " It's clean right now." : ''
  return `Can I add a wild to ${whose} ${rankLabel}s book?${cleanNote}`
}

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

  if (message.type === 'wild_request') {
    return canAiSendWildRequest(state, message.senderSeatIndex, existingMessages)
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

/** AI may ask its human partner before playing a wild onto their book. */
export function canAiSendWildRequest(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): boolean {
  if (state.phase !== 'playing' || state.currentPlayerIndex !== seatIndex) return false
  if (state.turnPhase !== 'play') return false
  const player = state.players[seatIndex]
  if (player.profile.isHuman) return false
  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  if (!state.players[partnerIdx]?.profile.isHuman) return false
  return pendingPartnerWildRequest(messages, partnerIdx, seatIndex) === null
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

function sameWildProposal(
  a: WildBookProposal | undefined,
  b: WildBookProposal | undefined,
): boolean {
  if (!a || !b) return false
  if (a.bookId !== b.bookId) return false
  if (a.cardIds.length !== b.cardIds.length) return false
  const aIds = [...a.cardIds].sort()
  const bIds = [...b.cardIds].sort()
  return aIds.every((id, i) => id === bIds[i])
}

export function createWildRequestSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  proposal: WildBookProposal,
  text?: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: text ?? wildAskText(proposal.rank),
    timestamp: Date.now(),
    type: 'wild_request',
    wildProposal: proposal,
  }
}

export function createWildApproveSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  proposal?: WildBookProposal,
  text: string = APPROVE_WILD_TEXT,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text,
    timestamp: Date.now(),
    type: 'wild_approve',
    wildProposal: proposal,
  }
}

export function createWildDenySignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  proposal?: WildBookProposal,
  text: string = DENY_WILD_TEXT,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text,
    timestamp: Date.now(),
    type: 'wild_deny',
    wildProposal: proposal,
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

function wildResponseAfter(
  messages: ChatMessage[],
  responderSeat: number,
  afterTimestamp: number,
): ChatMessage | null {
  let latest: ChatMessage | null = null
  for (const msg of messages) {
    if (msg.senderSeatIndex !== responderSeat) continue
    if (msg.type !== 'wild_approve' && msg.type !== 'wild_deny') continue
    // Allow equal timestamps — ask + reply can be created in the same ms in tests/UI.
    if (msg.timestamp < afterTimestamp) continue
    if (!latest || msg.timestamp > latest.timestamp) latest = msg
  }
  return latest
}

/** AI partner asked to play a wild — waiting for human reply. */
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
      m.timestamp >= request.timestamp,
  )
  return responded ? null : request
}

/** AI asked to play a wild and is still waiting on its human partner. */
export function awaitingPartnerWildResponse(
  messages: ChatMessage[],
  aiSeatIndex: number,
  humanPartnerSeat: number,
): boolean {
  return pendingPartnerWildRequest(messages, humanPartnerSeat, aiSeatIndex) !== null
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
  proposal?: WildBookProposal,
): boolean {
  if (proposal) {
    let latestAsk: ChatMessage | null = null
    for (const msg of messages) {
      if (msg.type !== 'wild_request' || msg.senderSeatIndex !== aiPartnerSeat) continue
      if (!sameWildProposal(msg.wildProposal, proposal)) continue
      if (!latestAsk || msg.timestamp > latestAsk.timestamp) latestAsk = msg
    }
    if (!latestAsk) return false
    return wildResponseAfter(messages, responderSeat, latestAsk.timestamp)?.type === 'wild_approve'
  }

  const request = latestWildRequestFrom(messages, aiPartnerSeat)
  if (!request) return false
  return wildResponseAfter(messages, responderSeat, request.timestamp)?.type === 'wild_approve'
}

/** Human denied a wild add for this book (or the latest ask). */
export function partnerDeniedWildBook(
  messages: ChatMessage[],
  aiSeatIndex: number,
  humanPartnerSeat: number,
  bookId?: string,
): boolean {
  if (bookId) {
    for (const msg of messages) {
      if (msg.type !== 'wild_request' || msg.senderSeatIndex !== aiSeatIndex) continue
      if (msg.wildProposal?.bookId !== bookId) continue
      if (wildResponseAfter(messages, humanPartnerSeat, msg.timestamp)?.type === 'wild_deny') {
        return true
      }
    }
    return false
  }

  const request = latestWildRequestFrom(messages, aiSeatIndex)
  if (!request) return false
  return wildResponseAfter(messages, humanPartnerSeat, request.timestamp)?.type === 'wild_deny'
}

/** Book ids the human has denied for wild adds this chat history. */
export function deniedWildBookIds(
  messages: ChatMessage[],
  aiSeatIndex: number,
  humanPartnerSeat: number,
): Set<string> {
  const denied = new Set<string>()
  for (const msg of messages) {
    if (msg.type !== 'wild_request' || msg.senderSeatIndex !== aiSeatIndex) continue
    const bookId = msg.wildProposal?.bookId
    if (!bookId) continue
    if (wildResponseAfter(messages, humanPartnerSeat, msg.timestamp)?.type === 'wild_deny') {
      denied.add(bookId)
    }
  }
  return denied
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

  const playerCount = state.playerCount as PlayerCount
  const partnerIdx = partnerSeat(seatIndex, playerCount)
  const partnerIsHuman = state.players[partnerIdx]?.profile.isHuman === true

  if (hasPartnerGoOutApproval(state, seatIndex, messages)) return true

  if (partnerIsHuman) {
    // Wait for the human's yes/no before discarding the last card.
    if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) return false
    if (!latestReadyGoOutFrom(messages, seatIndex)) return false
    if (partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)) {
      return opponentsHoldManyCards(state, seatIndex)
    }
    return false
  }

  if (opponentsHoldManyCards(state, seatIndex)) return true

  if (partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)) {
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
  if (type === 'wild_request') return 'Ask to play a wild'
  if (type === 'wild_approve') return APPROVE_WILD_TEXT
  if (type === 'wild_deny') return DENY_WILD_TEXT
  return 'Partner reply'
}
