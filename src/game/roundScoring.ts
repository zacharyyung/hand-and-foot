import type { GameState } from './deal'
import { dealNewRound } from './deal'
import {
  bookBonus,
  GOING_OUT_BONUS,
  heldNonRedThreePenalty,
  heldRedThreeCount,
  heldRedThreePenalty,
  sumCardPoints,
  WINNING_SCORE,
} from './scoring'
import { nextSeatCounterClockwise, type PlayerCount } from './teams'

export interface RoundScoreBreakdown {
  teamId: number
  tableCardPoints: number
  bookBonuses: number
  goingOutBonus: number
  /** Held non–red-3 cards only (red 3s are listed separately). */
  handFootPenalty: number
  redThreeCount: number
  redThreePenalty: number
  total: number
}

export function scoreRound(state: GameState): RoundScoreBreakdown[] {
  return state.teams.map((team) => {
    const tableCardPoints = sumCardPoints(
      team.books.flatMap((book) => book.cards),
    )
    const bookBonuses = team.books.reduce((sum, book) => sum + bookBonus(book), 0)
    const goingOutBonus = state.wentOutTeamId === team.id ? GOING_OUT_BONUS : 0

    const handFootCards = state.players
      .filter((p) => p.profile.teamId === team.id)
      .flatMap((p) => [...p.hand, ...p.foot])

    const handFootPenalty = heldNonRedThreePenalty(handFootCards)
    const redThreeCount = heldRedThreeCount(handFootCards)
    const redThreePenalty = heldRedThreePenalty(handFootCards)

    const total =
      tableCardPoints + bookBonuses + goingOutBonus - handFootPenalty - redThreePenalty

    return {
      teamId: team.id,
      tableCardPoints,
      bookBonuses,
      goingOutBonus,
      handFootPenalty,
      redThreeCount,
      redThreePenalty,
      total,
    }
  })
}

export function applyRoundScores(state: GameState): GameState {
  const breakdowns = scoreRound(state)
  const roundScores: Record<number, number> = {}

  const teams = state.teams.map((team) => {
    const breakdown = breakdowns.find((b) => b.teamId === team.id)!
    roundScores[team.id] = breakdown.total
    return {
      ...team,
      score: team.score + breakdown.total,
    }
  })

  const over5000 = teams.filter((t) => t.score >= WINNING_SCORE)
  let winnerTeamId: number | null = null

  if (over5000.length > 0) {
    const highest = [...teams].sort((a, b) => b.score - a.score)[0]
    winnerTeamId = over5000.length >= 2 ? highest.id : over5000[0].id
  }

  return {
    ...state,
    teams,
    roundScores,
    winnerTeamId,
    phase: 'roundEnd',
  }
}

export function startNextRound(state: GameState): GameState {
  const playerCount = state.playerCount as PlayerCount
  const nextStarter = nextSeatCounterClockwise(state.roundStarterIndex, playerCount)
  const profiles = state.players.map((p) => p.profile)

  return dealNewRound(
    profiles,
    playerCount,
    state.teams,
    nextStarter,
    state.roundNumber + 1,
  )
}
