import type { Card } from './cards'
import type { Book } from './books'
import {
  canAddToBook,
  canStartBook,
  countWildsInCards,
  getGoOutBlockReason,
  teamHasCleanAndDirtyBooks,
} from './books'
import type { GameState, PlayerState } from './deal'
import { shuffleDeck } from './shuffle'
import { meldContributionFromCards, meldThreshold } from './scoring'
import { applyRoundScores } from './roundScoring'
import { nextSeatCounterClockwise, type PlayerCount } from './teams'
import type { ChatMessage } from './chat'
import { getPartnerGoOutBlockReason, hasPartnerGoOutClearance } from './chat'

export function getActiveCards(player: PlayerState): Card[] {
  return player.isPlayingFoot ? player.hand : player.hand
}

export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex]
}

export function getTeam(state: GameState, teamId: number) {
  return state.teams.find((t) => t.id === teamId)!
}

export function replenishStock(state: GameState): GameState {
  if (state.stock.length > 0 || state.discard.length === 0) return state

  return {
    ...state,
    stock: shuffleDeck([...state.discard]),
    discard: [],
  }
}

export function drawCards(state: GameState): GameState {
  if (state.turnPhase !== 'draw') return state

  let next = { ...state }
  let drawn = 0

  while (drawn < 2) {
    next = replenishStock(next)
    if (next.stock.length === 0) break

    const [card, ...rest] = next.stock
    const player = next.players[next.currentPlayerIndex]
    const updatedPlayers = [...next.players]
    updatedPlayers[next.currentPlayerIndex] = {
      ...player,
      hand: [...player.hand, card],
    }

    next = {
      ...next,
      stock: rest,
      players: updatedPlayers,
    }
    drawn++
  }

  return {
    ...next,
    turnPhase: 'play',
  }
}

function removeCardsFromHand(hand: Card[], selectedIds: string[]): Card[] {
  const remove = new Set(selectedIds)
  return hand.filter((c) => !remove.has(c.id))
}

function activateFootAfterSkipAndRun(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: [...player.hand, ...player.foot],
    foot: [],
    isPlayingFoot: true,
    footOnHold: false,
  }
}

function activateFootOnHold(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: [],
    isPlayingFoot: false,
    footOnHold: true,
  }
}

function beginFootTurn(player: PlayerState): PlayerState {
  if (!player.footOnHold) return player
  return {
    ...player,
    hand: [...player.foot],
    foot: [],
    isPlayingFoot: true,
    footOnHold: false,
  }
}

function playerHasCards(player: PlayerState): boolean {
  return player.hand.length > 0 || player.foot.length > 0 || player.footOnHold
}

function advanceTurn(state: GameState, fromPlayerIndex: number): GameState {
  const playerCount = state.playerCount as PlayerCount
  let next = state
  let nextIndex = fromPlayerIndex

  for (let i = 0; i < playerCount; i++) {
    nextIndex = nextSeatCounterClockwise(nextIndex, playerCount)
    if (playerHasCards(next.players[nextIndex])) break
  }

  let nextPlayer = next.players[nextIndex]
  if (nextPlayer.footOnHold) {
    const activated = beginFootTurn(nextPlayer)
    const updated = [...next.players]
    updated[nextIndex] = activated
    next = { ...next, players: updated }
  }

  return {
    ...next,
    currentPlayerIndex: nextIndex,
    turnPhase: 'draw',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
  }
}

export function commitStagedMelds(
  state: GameState,
  stagedGroups: string[][],
): { state: GameState; error?: string } {
  if (state.turnPhase !== 'play') {
    return { state, error: 'You can only meld during the play phase.' }
  }

  if (stagedGroups.length === 0) {
    return { state, error: 'Stage at least one book before melding.' }
  }

  const playerIndex = state.currentPlayerIndex
  const player = state.players[playerIndex]
  const meldCheck = rejectLastFootMeld(player)
  if (!meldCheck.ok) return { state, error: meldCheck.error }

  const team = getTeam(state, player.profile.teamId)

  if (team.meldThresholdMet) {
    return { state, error: 'Your team has already met the meld requirement.' }
  }

  const required = meldThreshold(team.score)
  let virtualBooks = [...team.books]
  let totalPoints = 0
  const parsedGroups: { cardIds: string[]; cards: Card[]; rank: Book['rank'] }[] = []

  for (const cardIds of stagedGroups) {
    const cards = player.hand.filter((c) => cardIds.includes(c.id))
    if (cards.length !== cardIds.length) {
      return { state, error: 'Staged cards are no longer in your hand.' }
    }

    const check = canStartBook(cards, virtualBooks)
    if (!check.ok) return { state, error: check.reason }

    totalPoints += meldContributionFromCards(cards)
    parsedGroups.push({ cardIds, cards, rank: check.rank })
    virtualBooks.push({
      id: `staged-${check.rank}-${parsedGroups.length}`,
      rank: check.rank,
      cards,
      teamId: team.id,
      startedBySeatIndex: playerIndex,
    })
  }

  if (totalPoints < required) {
    return {
      state,
      error: `Staged meld needs ${required}+ points. You have ${totalPoints}.`,
    }
  }

  let nextState = state
  let nextPlayer = player
  let wildBooksThisTurn = [...state.booksWithWildAddedThisTurn]

  for (const group of parsedGroups) {
    const book: Book = {
      id: `book-${team.id}-${group.rank}-${Date.now()}-${Math.random()}`,
      rank: group.rank,
      cards: group.cards,
      teamId: team.id,
      startedBySeatIndex: playerIndex,
    }

    if (countWildsInCards(group.cards) > 0) {
      wildBooksThisTurn = [...wildBooksThisTurn, book.id]
    }

    const newHand = removeCardsFromHand(nextPlayer.hand, group.cardIds)
    nextPlayer = { ...nextPlayer, hand: newHand }

    const teams = nextState.teams.map((t) =>
      t.id === team.id ? { ...t, books: [...t.books, book], meldThresholdMet: true } : t,
    )

    const players = [...nextState.players]
    players[playerIndex] = nextPlayer

    nextState = {
      ...nextState,
      players,
      teams,
      meldPointsThisTurn: totalPoints,
      booksWithWildAddedThisTurn: wildBooksThisTurn,
    }

    if (
      newHand.length === 0 &&
      !nextPlayer.isPlayingFoot &&
      nextPlayer.foot.length > 0
    ) {
      nextPlayer = activateFootAfterSkipAndRun({ ...nextPlayer, hand: newHand })
      const updated = [...nextState.players]
      updated[playerIndex] = nextPlayer
      nextState = { ...nextState, players: updated }
    }
  }

  return { state: nextState }
}

export function validateStageBook(
  hand: Card[],
  cardIds: string[],
  teamBooks: Book[],
  stagedRanks: Book['rank'][],
): { ok: true; rank: Book['rank'] } | { ok: false; reason: string } {
  const selected = hand.filter((c) => cardIds.includes(c.id))
  const virtualBooks: Book[] = [
    ...teamBooks,
    ...stagedRanks.map((rank, i) => ({
      id: `virtual-${i}`,
      rank,
      cards: [],
      teamId: -1,
      startedBySeatIndex: -1,
    })),
  ]
  return canStartBook(selected, virtualBooks)
}

export function startBook(
  state: GameState,
  cardIds: string[],
): { state: GameState; error?: string } {
  if (state.turnPhase !== 'play') {
    return { state, error: 'You can only meld during the play phase.' }
  }

  const playerIndex = state.currentPlayerIndex
  const player = state.players[playerIndex]
  const meldCheck = rejectLastFootMeld(player)
  if (!meldCheck.ok) return { state, error: meldCheck.error }

  const team = getTeam(state, player.profile.teamId)
  const selected = player.hand.filter((c) => cardIds.includes(c.id))

  const check = canStartBook(selected, team.books)
  if (!check.ok) return { state, error: check.reason }

  if (!team.meldThresholdMet) {
    const newMeldPoints = state.meldPointsThisTurn + meldContributionFromCards(selected)
    const required = meldThreshold(team.score)
    if (newMeldPoints < required) {
      return {
        state,
        error: `Your team needs a ${required}-point meld. You have ${newMeldPoints} points melded this turn.`,
      }
    }
  }

  const book: Book = {
    id: `book-${team.id}-${check.rank}-${Date.now()}`,
    rank: check.rank,
    cards: selected,
    teamId: team.id,
    startedBySeatIndex: playerIndex,
  }

  const newHand = removeCardsFromHand(player.hand, cardIds)
  let updatedPlayer: PlayerState = { ...player, hand: newHand }

  const meldPointsThisTurn =
    state.meldPointsThisTurn + meldContributionFromCards(selected)
  const thresholdNowMet =
    team.meldThresholdMet ||
    meldPointsThisTurn >= meldThreshold(team.score)

  const teamsWithThreshold = state.teams.map((t) =>
    t.id === team.id
      ? {
          ...t,
          books: [...t.books, book],
          meldThresholdMet: thresholdNowMet,
        }
      : t,
  )

  if (newHand.length === 0 && !player.isPlayingFoot && player.foot.length > 0) {
    updatedPlayer = activateFootAfterSkipAndRun({ ...updatedPlayer, hand: newHand })
  }

  const players = [...state.players]
  players[playerIndex] = updatedPlayer

  const wildInBook = countWildsInCards(selected) > 0

  return {
    state: {
      ...state,
      players,
      teams: teamsWithThreshold,
      meldPointsThisTurn,
      booksWithWildAddedThisTurn: wildInBook
        ? [...state.booksWithWildAddedThisTurn, book.id]
        : state.booksWithWildAddedThisTurn,
    },
  }
}

export function addToBook(
  state: GameState,
  bookId: string,
  cardIds: string[],
): { state: GameState; error?: string } {
  if (state.turnPhase !== 'play') {
    return { state, error: 'You can only meld during the play phase.' }
  }

  const playerIndex = state.currentPlayerIndex
  const player = state.players[playerIndex]
  const meldCheck = rejectLastFootMeld(player)
  if (!meldCheck.ok) return { state, error: meldCheck.error }

  const team = getTeam(state, player.profile.teamId)

  if (!team.meldThresholdMet) {
    return { state, error: 'Your team must meet the meld threshold before adding to books.' }
  }

  const book = team.books.find((b) => b.id === bookId)
  if (!book) return { state, error: 'Book not found.' }

  const selected = player.hand.filter((c) => cardIds.includes(c.id))
  const check = canAddToBook(book, selected, {
    wildAlreadyAddedThisTurn: state.booksWithWildAddedThisTurn.includes(bookId),
  })
  if (!check.ok) return { state, error: check.reason }

  const updatedBook: Book = {
    ...book,
    cards: [...book.cards, ...selected],
  }

  const newHand = removeCardsFromHand(player.hand, cardIds)
  let updatedPlayer: PlayerState = { ...player, hand: newHand }

  const updatedTeams = state.teams.map((t) =>
    t.id === team.id
      ? { ...t, books: t.books.map((b) => (b.id === bookId ? updatedBook : b)) }
      : t,
  )

  if (newHand.length === 0 && !player.isPlayingFoot && player.foot.length > 0) {
    updatedPlayer = activateFootAfterSkipAndRun({ ...updatedPlayer, hand: newHand })
  }

  const players = [...state.players]
  players[playerIndex] = updatedPlayer

  const wildAdded = countWildsInCards(selected) > 0

  return {
    state: {
      ...state,
      players,
      teams: updatedTeams,
      booksWithWildAddedThisTurn: wildAdded
        ? [...state.booksWithWildAddedThisTurn, bookId]
        : state.booksWithWildAddedThisTurn,
    },
  }
}

/** Discarding the last card from the foot — the only way to end the round. */
export function isAttemptingGoOutDiscard(player: PlayerState): boolean {
  return (
    player.isPlayingFoot &&
    player.hand.length === 1 &&
    player.foot.length === 0 &&
    !player.footOnHold
  )
}

export function canTeamGoOut(books: Book[], meldThresholdMet: boolean): boolean {
  return meldThresholdMet && teamHasCleanAndDirtyBooks(books)
}

export function discardCard(
  state: GameState,
  cardId: string,
  chatMessages: ChatMessage[] = [],
): { state: GameState; error?: string } {
  if (state.turnPhase !== 'play' && state.turnPhase !== 'discard') {
    return { state, error: 'You must draw before discarding.' }
  }

  const playerIndex = state.currentPlayerIndex
  const player = state.players[playerIndex]
  const card = player.hand.find((c) => c.id === cardId)
  if (!card) return { state, error: 'Card not found in hand.' }

  const team = getTeam(state, player.profile.teamId)

  if (isAttemptingGoOutDiscard(player)) {
    if (!canTeamGoOut(team.books, team.meldThresholdMet)) {
      return {
        state,
        error:
          getGoOutBlockReason(team.books, team.meldThresholdMet) ??
          'Cannot go out — need 1 completed clean book and 1 completed dirty book (7+ each).',
      }
    }
    if (!hasPartnerGoOutClearance(state, playerIndex, chatMessages)) {
      return {
        state,
        error:
          getPartnerGoOutBlockReason(state, playerIndex, chatMessages) ??
          'Your partner has not cleared you to go out — wait for table chat.',
      }
    }
  }

  const willBeEmpty = player.hand.length === 1
  const partnerCleared = hasPartnerGoOutClearance(state, playerIndex, chatMessages)
  const goingOut =
    willBeEmpty &&
    player.isPlayingFoot &&
    player.foot.length === 0 &&
    !player.footOnHold &&
    canTeamGoOut(team.books, team.meldThresholdMet) &&
    partnerCleared

  const newHand = removeCardsFromHand(player.hand, [cardId])
  let updatedPlayer: PlayerState = { ...player, hand: newHand }

  if (willBeEmpty && !player.isPlayingFoot && player.foot.length > 0 && !goingOut) {
    updatedPlayer = activateFootOnHold({ ...updatedPlayer, hand: newHand })
  }

  const players = [...state.players]
  players[playerIndex] = updatedPlayer

  let next: GameState = {
    ...state,
    players,
    discard: [...state.discard, card],
    turnPhase: 'draw',
    meldPointsThisTurn: 0,
    booksWithWildAddedThisTurn: [],
  }

  if (goingOut) {
    const roundEndState: GameState = {
      ...next,
      phase: 'roundEnd',
      wentOutTeamId: team.id,
    }
    return { state: applyRoundScores(roundEndState) }
  }

  return { state: advanceTurn(next, playerIndex) }
}

export function canGoOut(state: GameState): boolean {
  const player = getCurrentPlayer(state)
  const team = getTeam(state, player.profile.teamId)

  if (!isAttemptingGoOutDiscard(player)) return false

  return canTeamGoOut(team.books, team.meldThresholdMet)
}

/** Whether the active player may go out, including partner chat clearance. */
export function canPlayerGoOut(
  state: GameState,
  chatMessages: ChatMessage[] = [],
): boolean {
  if (!canGoOut(state)) return false
  const player = getCurrentPlayer(state)
  return hasPartnerGoOutClearance(state, player.profile.seatIndex, chatMessages)
}

/** Last card while playing the foot — must be discarded to go out, never melded. */
export function isLastFootCard(player: PlayerState): boolean {
  return (
    player.isPlayingFoot &&
    player.hand.length === 1 &&
    player.foot.length === 0 &&
    !player.footOnHold
  )
}

const LAST_FOOT_CARD_MELD_ERROR =
  'Your last foot card must be discarded to go out — you cannot meld it into a book.'

function rejectLastFootMeld(player: PlayerState): { ok: false; error: string } | { ok: true } {
  if (isLastFootCard(player)) {
    return { ok: false, error: LAST_FOOT_CARD_MELD_ERROR }
  }
  return { ok: true }
}

/** Discarding the last hand card while the foot pile is still waiting. */
export function canGoToFoot(player: PlayerState): boolean {
  return (
    player.hand.length === 1 &&
    !player.isPlayingFoot &&
    player.foot.length > 0
  )
}

/** Melding/adding every selected card empties the hand with foot still waiting. */
export function willSkipAndRun(player: PlayerState, cardIds: string[]): boolean {
  return (
    !player.isPlayingFoot &&
    player.foot.length > 0 &&
    player.hand.length > 1 &&
    cardIds.length > 0 &&
    cardIds.length === player.hand.length
  )
}
