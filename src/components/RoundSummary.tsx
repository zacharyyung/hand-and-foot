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
  const scored = game.teams.map((t) => {
    const breakdown = breakdowns.find((b) => b.teamId === t.id)!
    const roundPoints = game.roundScores?.[t.id] ?? breakdown.total
    const cumulative = game.roundScores ? t.score : t.score + breakdown.total
    return { teamId: t.id, round: roundPoints, total: cumulative }
  })

  return (
    <div className="animate-fade-up mx-auto max-w-lg px-6 py-12 sm:py-16">
      <header className="mb-8 text-center">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Round {game.roundNumber}
        </p>
        <h2 className="font-display text-3xl font-semibold text-ink">Tally</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {game.winnerTeamId !== null && game.roundScores
            ? `Team ${game.winnerTeamId + 1} wins the game`
            : game.wentOutTeamId !== null
              ? `Team ${game.wentOutTeamId + 1} went out`
              : 'Round complete'}
        </p>
      </header>

      <div className="space-y-3">
        {breakdowns.map((b: RoundScoreBreakdown) => (
          <div key={b.teamId} className="rounded-2xl bg-black/25 px-4 py-3.5 backdrop-blur-sm">
            <p
              className="font-display text-lg font-semibold"
              style={{ color: TEAM_COLORS[b.teamId] }}
            >
              Team {b.teamId + 1}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              <li className="flex justify-between">
                <span>Table</span>
                <span className="tabular-nums text-ink-soft">+{b.tableCardPoints}</span>
              </li>
              <li className="flex justify-between">
                <span>Books</span>
                <span className="tabular-nums text-ink-soft">+{b.bookBonuses}</span>
              </li>
              <li className="flex justify-between">
                <span>Going out</span>
                <span className="tabular-nums text-ink-soft">+{b.goingOutBonus}</span>
              </li>
              <li className="flex justify-between">
                <span>Held cards</span>
                <span className="tabular-nums text-ink-soft">−{b.handFootPenalty}</span>
              </li>
              {b.redThreeCount > 0 && (
                <li className="flex justify-between">
                  <span>
                    Red 3s
                    <span className="ml-1 text-ink-faint">
                      ({b.redThreeCount})
                    </span>
                  </span>
                  <span className="tabular-nums text-ink-soft">−{b.redThreePenalty}</span>
                </li>
              )}
              <li className="mt-1 flex justify-between border-t border-white/10 pt-2 font-semibold text-ink">
                <span>Round</span>
                <span className="font-display tabular-nums">
                  {b.total}
                  <span className="ml-2 text-ink-faint font-sans text-xs font-normal">
                    Σ {scored.find((s) => s.teamId === b.teamId)?.total}
                  </span>
                </span>
              </li>
            </ul>
          </div>
        ))}
      </div>

      <button onClick={onContinue} className="btn-primary mt-10 w-full py-3.5 text-sm">
        {game.roundScores
          ? game.winnerTeamId !== null
            ? 'Final results'
            : 'Next round'
          : 'Continue'}
      </button>
    </div>
  )
}
