import type { TeamState } from '../game/deal'
import { meldThreshold } from '../game/scoring'
import { TEAM_COLORS } from '../game/teams'

interface ScoreboardProps {
  teams: TeamState[]
}

export function Scoreboard({ teams }: ScoreboardProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {teams.map((team) => (
        <div
          key={team.id}
          className="rounded-lg border border-white/10 bg-black/20 px-4 py-2"
          style={{ borderColor: `${TEAM_COLORS[team.id]}55` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: TEAM_COLORS[team.id] }}
            />
            <span className="text-sm font-semibold text-white">
              Team {team.id + 1}: {team.score} pts
            </span>
          </div>
          <p className="text-xs text-white/50">
            Meld req: {meldThreshold(team.score)} ·{' '}
            {team.meldThresholdMet ? 'Unlocked' : 'Locked'}
          </p>
        </div>
      ))}
    </div>
  )
}
