import { useEffect, useRef, useState } from 'react'
import type { TeamState } from '../game/deal'
import { meldThreshold, teamBoardPoints } from '../game/scoring'
import { TEAM_COLORS } from '../game/teams'
import { playSound } from '../game/audio'

interface ScoreboardProps {
  teams: TeamState[]
  compact?: boolean
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    if (prev.current === value) return
    const from = prev.current
    const to = value
    prev.current = value
    const delta = to - from
    if (Math.abs(delta) > 80) {
      setDisplay(to)
      return
    }
    const steps = Math.min(12, Math.abs(delta))
    let step = 0
    const id = window.setInterval(() => {
      step++
      const next = Math.round(from + (delta * step) / steps)
      setDisplay(next)
      if (step % 3 === 0) playSound('scoreTick')
      if (step >= steps) window.clearInterval(id)
    }, 28)
    return () => window.clearInterval(id)
  }, [value])

  return <span className="tabular-nums">{display}</span>
}

export function CurrentRoundTracker({ teams }: { teams: TeamState[] }) {
  return (
    <div
      className="flex items-center gap-2.5 sm:gap-3.5"
      title="Points on the table this round"
    >
      {teams.map((team, i) => (
        <div key={team.id} className="flex items-center gap-1.5">
          {i > 0 && <span className="mr-1 h-3 w-px bg-white/10" aria-hidden />}
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: TEAM_COLORS[team.id] }}
          />
          <span
            className="font-display text-base font-semibold leading-none tabular-nums sm:text-lg"
            style={{ color: TEAM_COLORS[team.id] }}
          >
            <AnimatedNumber value={teamBoardPoints(team.books)} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function Scoreboard({ teams, compact = false }: ScoreboardProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {teams.map((team) => (
          <div key={team.id} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: TEAM_COLORS[team.id] }}
            />
            <span className="font-display text-sm font-semibold tabular-nums text-ink">
              <AnimatedNumber value={team.score} />
            </span>
            <span className="text-[9px] text-ink-faint tabular-nums">
              {meldThreshold(team.score)}
              {team.meldThresholdMet ? '' : '🔒'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-4">
      {teams.map((team) => (
        <div key={team.id} className="min-w-[7rem]">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TEAM_COLORS[team.id] }}
            />
            <span className="font-display text-lg font-semibold tabular-nums text-ink">
              <AnimatedNumber value={team.score} />
            </span>
          </div>
          <p className="text-[10px] text-ink-muted">
            Board {teamBoardPoints(team.books)} · Need {meldThreshold(team.score)}
          </p>
        </div>
      ))}
    </div>
  )
}
