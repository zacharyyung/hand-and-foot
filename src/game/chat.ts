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
export const PROACTIVE_GO_OUT_APPROVE_TEXT = 'You should go out!'
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

/** Latest yes/no advice from this seat about their partner going out. */
export function latestPartnerGoOutAdvice(
  messages: ChatMessage[],
  advisorSeat: number,
): 'approve' | 'deny' | null {
  let latest: ChatMessage | null = null
  for (const msg of messages) {
    if (msg.senderSeatIndex !== advisorSeat) continue
    if (!isGoOutResponse(msg.type)) continue
    if (!latest || msg.timestamp > latest.timestamp) latest = msg
  }
  if (!latest) return null
  if (latest.type === 'approve_go_out') return 'approve'
  if (latest.type === 'deny_go_out') return 'deny'
  if (latest.type === 'partner_reply') {
    const intent = parsePartnerReplyIntent(latest.text)
    return intent === 'neutral' ? null : intent
  }
  return null
}

/** Partner already said no to going out — don't keep asking (like wild deny). */
export function wasPartnerGoOutDenied(
  messages: ChatMessage[],
  requesterSeat: number,
  responderSeat: number,
): boolean {
  const request = latestReadyGoOutFrom(messages, requesterSeat)
  if (!request) return false
  if (awaitingPartnerGoOutResponse(messages, requesterSeat, responderSeat)) return false
  return latestPartnerGoOutAdvice(messages, responderSeat) === 'deny'
}

/** Partner said no to the latest go-out ask (advisory — does not block going out). */
export function unresolvedPartnerDenial(
  messages: ChatMessage[],
  requesterSeat: number,
  playerCount: PlayerCount,
): ChatMessage | null {
  const partnerIdx = partnerSeat(requesterSeat, playerCount)
  if (!wasPartnerGoOutDenied(messages, requesterSeat, partnerIdx)) return null

  const latest = latestReadyGoOutFrom(messages, requesterSeat)
  if (!latest) return null

  return partnerResponseAfter(messages, partnerIdx, latest.timestamp)
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

/**
 * Tell your partner they should go out without waiting for them to ask.
 * Shown when the team is ready and partner is in foot — and you have not already cleared them.
 */
export function canProactivelyApprovePartnerGoOut(
  state: GameState,
  responderSeat: number,
  messages: ChatMessage[],
): boolean {
  if (state.phase !== 'playing') return false
  const playerCount = state.playerCount as PlayerCount
  const partnerIdx = partnerSeat(responderSeat, playerCount)
  if (pendingPartnerGoOutRequest(messages, responderSeat, partnerIdx)) return false
  if (latestPartnerGoOutAdvice(messages, responderSeat) === 'approve') return false

  const partner = state.players[partnerIdx]
  if (!partner.isPlayingFoot) return false
  return teamReadyToGoOut(state, partner.profile.teamId)
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

  if (message.type === 'approve_go_out') {
    const playerCount = state.playerCount as PlayerCount
    return (
      canRespondToPartnerGoOutRequest(
        existingMessages,
        message.senderSeatIndex,
        playerCount,
      ) ||
      canProactivelyApprovePartnerGoOut(state, message.senderSeatIndex, existingMessages)
    )
  }

  if (message.type === 'deny_go_out' || message.type === 'partner_reply') {
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

/** AI may ask its human partner before playing a wild onto a clean / partner book. */
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

export function createWildRequestSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  bookRank: string,
  bookId: string,
  priorAskTexts: string[] = [],
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: pickWildRequestText(bookRank, bookId, priorAskTexts),
    timestamp: Date.now(),
    type: 'wild_request',
    bookId,
  }
}

/** Spoken / chat label for a book rank ("10", "ace", "jack", …). */
export function wildBookRankLabel(bookRank: string): string {
  if (bookRank === 'Joker') return 'joker'
  if (bookRank === 'A') return 'ace'
  if (bookRank === 'K') return 'king'
  if (bookRank === 'Q') return 'queen'
  if (bookRank === 'J') return 'jack'
  return bookRank
}

const WILD_REQUEST_LINES: Array<(label: string) => string> = [
  (label) => `How about the ${label} book?`,
  (label) => `Mind if I wild the ${label}s?`,
  (label) => `What do you think — wild on the ${label}s?`,
  (label) => `Can I put a wild on our ${label} book?`,
  (label) => `I'd like to dirty the ${label}s. Okay?`,
  (label) => `Wild into the ${label}s?`,
  (label) => `Could use a wild on the ${label} book — alright?`,
  (label) => `Thinking the ${label}s. Want me to wild it?`,
]

function pickWildRequestText(
  bookRank: string,
  bookId: string,
  priorAskTexts: string[],
): string {
  const label = wildBookRankLabel(bookRank)
  const candidates = WILD_REQUEST_LINES.map((line) => line(label))
  const unused = candidates.filter((text) => !priorAskTexts.includes(text))
  const pool = unused.length > 0 ? unused : candidates
  let hash = 0
  for (let i = 0; i < bookId.length; i++) hash = (hash * 31 + bookId.charCodeAt(i)) | 0
  hash = (hash + priorAskTexts.length * 17) | 0
  return pool[Math.abs(hash) % pool.length]!
}

export function createWildApproveSignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  bookId: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: 'Yes — go ahead.',
    timestamp: Date.now(),
    type: 'wild_approve',
    bookId,
  }
}

export function createWildDenySignal(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  bookId: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: 'No — keep it clean.',
    timestamp: Date.now(),
    type: 'wild_deny',
    bookId,
  }
}

function latestWildRequestFrom(
  messages: ChatMessage[],
  senderSeat: number,
  bookId?: string,
): ChatMessage | null {
  let latest: ChatMessage | null = null
  for (const msg of messages) {
    if (msg.senderSeatIndex !== senderSeat || msg.type !== 'wild_request') continue
    if (bookId != null && msg.bookId !== bookId) continue
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
  return responseToWildRequest(messages, request, responderSeat) ? null : request
}

/** AI asked to play a wild and is still waiting on its human partner. */
export function awaitingPartnerWildResponse(
  messages: ChatMessage[],
  aiSeatIndex: number,
  humanPartnerSeat: number,
): boolean {
  return pendingPartnerWildRequest(messages, humanPartnerSeat, aiSeatIndex) !== null
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
    const bookId = msg.bookId
    if (!bookId) continue
    if (wasPartnerWildDeniedForBook(messages, aiSeatIndex, humanPartnerSeat, bookId)) {
      denied.add(bookId)
    }
  }
  return denied
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

  const match =
    request.text.match(/the (.+?) book/i) ??
    request.text.match(/the (.+?)s\b/i) ??
    request.text.match(/our (.+?) book/i) ??
    request.text.match(/our (.+?)s\b/i)
  if (!match) return null
  const rankLabel = match[1]!.trim().toLowerCase()
  const rank =
    rankLabel === 'joker'
      ? 'Joker'
      : rankLabel === 'ace'
        ? 'A'
        : rankLabel === 'king'
          ? 'K'
          : rankLabel === 'queen'
            ? 'Q'
            : rankLabel === 'jack'
              ? 'J'
              : rankLabel.toUpperCase()

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

function responseToWildRequest(
  messages: ChatMessage[],
  request: ChatMessage,
  responderSeat: number,
): 'approve' | 'deny' | null {
  let response: ChatMessage | null = null
  for (const m of messages) {
    if (m.senderSeatIndex !== responderSeat) continue
    if (m.type !== 'wild_approve' && m.type !== 'wild_deny') continue
    if (m.timestamp <= request.timestamp) continue

    /* Prefer book-scoped replies so Yes on book B cannot rewrite No on book A. */
    if (request.bookId && m.bookId) {
      if (m.bookId !== request.bookId) continue
    } else if (request.bookId && !m.bookId) {
      /* Legacy replies without bookId only count before the next wild ask. */
      const superseded = messages.some(
        (r) =>
          r.type === 'wild_request' &&
          r.senderSeatIndex === request.senderSeatIndex &&
          r.timestamp > request.timestamp &&
          r.timestamp < m.timestamp,
      )
      if (superseded) continue
    }

    /* Earliest matching reply is the direct answer to this ask. */
    if (!response || m.timestamp < response.timestamp) response = m
  }
  if (!response) return null
  return response.type === 'wild_approve' ? 'approve' : 'deny'
}

function latestWildVerdictForBook(
  messages: ChatMessage[],
  aiPartnerSeat: number,
  responderSeat: number,
  bookId: string,
): 'approve' | 'deny' | null {
  let verdict: 'approve' | 'deny' | null = null
  for (const msg of messages) {
    if (msg.type !== 'wild_request' || msg.senderSeatIndex !== aiPartnerSeat) continue
    if (msg.bookId !== bookId) continue
    const response = responseToWildRequest(messages, msg, responderSeat)
    if (response) verdict = response
  }
  return verdict
}

/** Partner approved dirtying this specific book (not a blanket yes for every clean book). */
export function hasPartnerWildApprovalForBook(
  messages: ChatMessage[],
  aiPartnerSeat: number,
  responderSeat: number,
  bookId: string,
): boolean {
  return latestWildVerdictForBook(messages, aiPartnerSeat, responderSeat, bookId) === 'approve'
}

/** Partner already said no to wilding this book — don't keep asking. */
export function wasPartnerWildDeniedForBook(
  messages: ChatMessage[],
  aiPartnerSeat: number,
  responderSeat: number,
  bookId: string,
): boolean {
  return latestWildVerdictForBook(messages, aiPartnerSeat, responderSeat, bookId) === 'deny'
}

/**
 * Human's answer to the AI's latest wild ask was No.
 * Used to stop fishing other books for the rest of a mid-turn resume.
 */
export function partnerDeniedLatestWildAsk(
  messages: ChatMessage[],
  aiPartnerSeat: number,
  responderSeat: number,
): boolean {
  const request = latestWildRequestFrom(messages, aiPartnerSeat)
  if (!request) return false
  return responseToWildRequest(messages, request, responderSeat) === 'deny'
}

/** @deprecated Prefer hasPartnerWildApprovalForBook — kept for older call sites. */
export function hasPartnerWildApproval(
  messages: ChatMessage[],
  aiPartnerSeat: number,
  responderSeat: number,
): boolean {
  const request = latestWildRequestFrom(messages, aiPartnerSeat)
  if (!request?.bookId) {
    if (!request) return false
    return responseToWildRequest(messages, request, responderSeat) === 'approve'
  }
  return hasPartnerWildApprovalForBook(
    messages,
    aiPartnerSeat,
    responderSeat,
    request.bookId,
  )
}

/** Prior wild-ask lines from this AI (for natural variation). */
export function priorWildAskTexts(
  messages: ChatMessage[],
  aiPartnerSeat: number,
): string[] {
  return messages
    .filter((m) => m.senderSeatIndex === aiPartnerSeat && m.type === 'wild_request')
    .map((m) => m.text)
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

/**
 * Partner cleared going out — either replied yes to an ask, or proactively said
 * "You should go out!" (standing approval until a later deny).
 */
export function hasPartnerGoOutApproval(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
): boolean {
  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  if (latestPartnerGoOutAdvice(messages, partnerIdx) === 'approve') return true

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
    /* Wait for the human's yes/no before discarding the last card. */
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
  if (type === 'wild_approve') return 'Yes — go ahead.'
  if (type === 'wild_deny') return 'No — keep it clean.'
  return 'Partner reply'
}
