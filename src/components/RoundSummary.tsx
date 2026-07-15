import type { GameState } from '../game/deal'
import type { RoundScoreBreakdown } from '../game/roundScoring'
import { scoreRound } from '../game/roundScoring'
import { TEAM_COLORS } from '../game/teams'

interface RoundSummaryProps {
  game: GameState
  onContinue: () => void
}

export function RoundSummary({ game, onContinue }: RoundSummaryProps) {
  const breakdowns = scoreRound(game)
  const scored = game.roundScores
    ? game.teams.map((t) => ({
        teamId: t.id,
        round: game.roundScores![t.id],
        total: t.score,
      }))
    : breakdowns.map((b) => ({
        teamId: b.teamId,
        round: b.total,
        total: game.teams.find((t) => t.id === b.teamId)!.score,
      }))

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h2 className="mb-2 text-2xl font-bold text-white">Round {game.roundNumber} Complete</h2>
      <p className="mb-6 text-white/60">
        {game.winnerTeamId !== null && game.roundScores
          ? `Team ${game.winnerTeamId + 1} wins the game!`
          : game.wentOutTeamId !== null
            ? `Team ${game.wentOutTeamId + 1} went out (+100 bonus)`
            : 'Round ended'}
      </p>

      <div className="space-y-3">
        {breakdowns.map((b: RoundScoreBreakdown) => (
          <div
            key={b.teamId}
            className="rounded-xl border border-white/10 bg-black/20 p-4"
            style={{ borderColor: `${TEAM_COLORS[b.teamId]}55` }}
          >
            <p className="font-semibold text-white" style={{ color: TEAM_COLORS[b.teamId] }}>
              Team {b.teamId + 1}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-white/70">
              <li>Table cards: +{b.tableCardPoints}</li>
              <li>Book bonuses: +{b.bookBonuses}</li>
              <li>Going out: +{b.goingOutBonus}</li>
              <li>Hand/foot penalty: −{b.handFootPenalty}</li>
              <li className="font-semibold text-white">
                Round total: {b.total} · Cumulative:{' '}
                {scored.find((s) => s.teamId === b.teamId)?.total}
              </li>
            </ul>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        className="mt-8 w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-400"
      >
        {game.roundScores
          ? game.winnerTeamId !== null
            ? 'View Final Results'
            : 'Next Round'
          : 'Apply Scores'}
      </button>
    </div>
  )
}
