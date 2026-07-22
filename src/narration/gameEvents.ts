import type { Card } from '../game/cards'
import { bookWildCount } from '../game/books'
import type { GameState } from '../game/deal'
import { scoreRound } from '../game/roundScoring'
import type { GameNarrationEvent } from './types'

function playerName(state: GameState, seatIndex: number): string {
  return state.players[seatIndex]?.profile.name ?? `Player ${seatIndex + 1}`
}

function isHumanSeat(state: GameState, seatIndex: number): boolean {
  return state.players[seatIndex]?.profile.isHuman ?? false
}

function actingSeat(prev: GameState, next: GameState): number {
  if (prev.currentPlayerIndex !== next.currentPlayerIndex) {
    return prev.currentPlayerIndex
  }
  return next.currentPlayerIndex
}

function countBooks(state: GameState): Map<string, number> {
  const counts = new Map<string, number>()
  for (const team of state.teams) {
    for (const book of team.books) {
      counts.set(book.id, book.cards.length)
    }
  }
  return counts
}

function findNewBooks(prev: GameState, next: GameState) {
  const prevIds = new Set(prev.teams.flatMap((t) => t.books.map((b) => b.id)))
  const created: Array<{ teamId: number; rank: string; cardCount: number; seatIndex: number }> = []

  for (const team of next.teams) {
    for (const book of team.books) {
      if (prevIds.has(book.id)) continue
      created.push({
        teamId: team.id,
        rank: book.rank,
        cardCount: book.cards.length,
        seatIndex: book.startedBySeatIndex,
      })
    }
  }
  return created
}

function findBookGrowth(prev: GameState, next: GameState, seatIndex: number) {
  const events: Array<{
    rank: string
    added: number
    bookComplete: boolean
  }> = []
  const prevCounts = countBooks(prev)

  for (const team of next.teams) {
    for (const book of team.books) {
      const before = prevCounts.get(book.id) ?? 0
      const after = book.cards.length
      if (after <= before) continue
      events.push({
        rank: book.rank,
        added: after - before,
        bookComplete: before < 7 && after >= 7,
      })
    }
  }
  return events.map((event) => ({ ...event, seatIndex }))
}

function findCompletedBooks(prev: GameState, next: GameState, seatIndex: number) {
  const prevCounts = countBooks(prev)
  const completed: Array<{
    teamId: number
    rank: string
    clean: boolean
  }> = []

  for (const team of next.teams) {
    for (const book of team.books) {
      const before = prevCounts.get(book.id) ?? 0
      if (before >= 7 || book.cards.length < 7) continue
      completed.push({
        teamId: team.id,
        rank: book.rank,
        clean: bookWildCount(book) === 0,
      })
    }
  }
  return completed.map((event) => ({ ...event, seatIndex }))
}

function topDiscard(state: GameState): Card | null {
  return state.discard[state.discard.length - 1] ?? null
}

export function diffGameNarrationEvents(
  prev: GameState | null,
  next: GameState,
  viewerSeat: number,
): GameNarrationEvent[] {
  const events: GameNarrationEvent[] = []

  if (!prev) return events

  const actorSeat = actingSeat(prev, next)

  if (prev.roundNumber !== next.roundNumber && next.phase === 'playing') {
    events.push({ type: 'round_start', roundNumber: next.roundNumber })
  }

  if (prev.phase !== next.phase) {
    if (next.phase === 'roundEnd') {
      events.push({
        type: 'round_end',
        wentOutTeamId: next.wentOutTeamId,
        breakdowns: scoreRound(next),
      })
    }
    if (next.phase === 'gameOver' && next.winnerTeamId !== null) {
      const winner = next.teams.find((t) => t.id === next.winnerTeamId)
      events.push({
        type: 'game_over',
        winnerTeamId: next.winnerTeamId,
        score: winner?.score ?? 0,
      })
    }
  }

  if (
    prev.wentOutTeamId === null &&
    next.wentOutTeamId !== null &&
    next.phase === 'playing' &&
    isHumanSeat(prev, actorSeat)
  ) {
    events.push({
      type: 'go_out',
      teamId: next.wentOutTeamId,
      playerName: playerName(prev, actorSeat),
    })
  }

  if (isHumanSeat(next, actorSeat)) {
    for (const team of next.teams) {
      const prevTeam = prev.teams.find((t) => t.id === team.id)
      if (prevTeam && !prevTeam.meldThresholdMet && team.meldThresholdMet) {
        events.push({
          type: 'threshold_met',
          teamId: team.id,
          points: team.books.reduce((sum, book) => sum + book.cards.length, 0),
          playerName: playerName(next, actorSeat),
        })
      }
    }
  }

  if (prev.currentPlayerIndex !== next.currentPlayerIndex && next.phase === 'playing') {
    const current = next.players[next.currentPlayerIndex]
    if (current.profile.isHuman) {
      events.push({
        type: 'turn_start',
        playerName: current.profile.name,
        isViewer: next.currentPlayerIndex === viewerSeat,
        isPlayingFoot: current.isPlayingFoot,
      })
    }
  }

  if (
    isHumanSeat(next, actorSeat) &&
    prev.turnPhase === 'draw' &&
    next.turnPhase === 'play' &&
    prev.currentPlayerIndex === next.currentPlayerIndex
  ) {
    events.push({
      type: 'draw',
      playerName: playerName(next, actorSeat),
      count: 2,
      fromStock: true,
    })
  }

  if (isHumanSeat(next, actorSeat)) {
    for (const created of findNewBooks(prev, next)) {
      if (!isHumanSeat(next, created.seatIndex)) continue
      events.push({
        type: 'meld_start',
        playerName: playerName(next, created.seatIndex),
        rank: created.rank as import('../game/cards').Rank,
        cardCount: created.cardCount,
        teamId: created.teamId,
      })
    }

    for (const growth of findBookGrowth(prev, next, actorSeat)) {
      if (growth.bookComplete) continue
      events.push({
        type: 'meld_add',
        playerName: playerName(next, actorSeat),
        rank: growth.rank as import('../game/cards').Rank,
        cardCount: growth.added,
        bookComplete: false,
      })
    }

    for (const completed of findCompletedBooks(prev, next, actorSeat)) {
      events.push({
        type: 'book_complete',
        teamId: completed.teamId,
        rank: completed.rank as import('../game/cards').Rank,
        clean: completed.clean,
        playerName: playerName(next, actorSeat),
      })
    }
  }

  const prevTop = topDiscard(prev)
  const nextTop = topDiscard(next)
  if (
    isHumanSeat(prev, actorSeat) &&
    nextTop &&
    prevTop?.id !== nextTop.id &&
    next.discard.length >= prev.discard.length
  ) {
    const discarder = prev.players[actorSeat]
    const goingOut = next.phase === 'roundEnd'
    const goToFoot =
      discarder.hand.length === 0 &&
      discarder.foot.length > 0 &&
      !discarder.isPlayingFoot

    events.push({
      type: 'discard',
      playerName: playerName(prev, actorSeat),
      card: nextTop,
      goingOut,
      goToFoot,
    })
  }

  for (let seat = 0; seat < next.players.length; seat++) {
    if (!isHumanSeat(next, seat)) continue
    const prevPlayer = prev.players[seat]
    const nextPlayer = next.players[seat]
    const footActivated =
      (!prevPlayer.isPlayingFoot && nextPlayer.isPlayingFoot) ||
      (!prevPlayer.footOnHold && nextPlayer.footOnHold)
    if (footActivated) {
      events.push({ type: 'go_to_foot', playerName: playerName(next, seat) })
    }
  }

  return events
}
