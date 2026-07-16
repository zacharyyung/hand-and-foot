import { useEffect, useRef, useState } from 'react'
import type { TeamState } from '../game/deal'
import { meldThreshold, teamBoardPoints } from '../game/scoring'
import { TEAM_COLORS } from '../game/teams'
import { playSound } from '../game/audio'
import { MeldRulesHint } from './MeldRulesHint'

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

function TeamDotsRow({
  teams,
  value,
  size = 'md',
}: {
  teams: TeamState[]
  value: (team: TeamState) => number
  size?: 'md' | 'sm'
}) {
  const numberClass =
    size === 'md'
      ? 'font-display text-base font-semibold leading-none tabular-nums sm:text-lg'
      : 'font-display text-xs font-semibold leading-none tabular-nums sm:text-sm'

  return (
    <>
      {teams.map((team, i) => (
        <div key={team.id} className="flex items-center gap-1.5">
          {i > 0 && <span className="mr-1 h-3 w-px bg-white/10" aria-hidden />}
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: TEAM_COLORS[team.id] }}
          />
          <span className={numberClass} style={{ color: TEAM_COLORS[team.id] }}>
            <AnimatedNumber value={value(team)} />
          </span>
        </div>
      ))}
    </>
  )
}

/** Round points on the table, with cumulative game total underneath. */
export function CurrentRoundTracker({ teams }: { teams: TeamState[] }) {
  return (
    <div className="flex flex-col items-center gap-1" title="Round table points and cumulative scores">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="w-[4.75rem] shrink-0 text-right text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
          Table
        </span>
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <TeamDotsRow teams={teams} value={(team) => teamBoardPoints(team.books)} size="md" />
        </div>
      </div>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="w-[4.75rem] shrink-0 text-right text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
          Cumulative
        </span>
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <TeamDotsRow teams={teams} value={(team) => team.score} size="sm" />
        </div>
      </div>
    </div>
  )
}

function MeldTeamRow({ team }: { team: TeamState }) {
  const needed = meldThreshold(team.score)
  const met = team.meldThresholdMet

  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: TEAM_COLORS[team.id] }}
        aria-hidden
      />
      {met ? (
        <span
          className="text-[11px] font-semibold tabular-nums text-accent"
          title="Initial meld requirement met"
        >
          Met
        </span>
      ) : (
        <span
          className="text-[11px] font-semibold tabular-nums text-ink-soft"
          title={`Need ${needed} points to meld this round`}
        >
          {needed}
          <span className="ml-0.5 text-[9px] font-medium text-ink-faint">pts</span>
        </span>
      )}
    </div>
  )
}

/** Initial meld points each team still needs before laying cards down. */
export function MeldTracker({ teams }: { teams: TeamState[] }) {
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-1.5"
      title="Initial meld requirement per team"
    >
      <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wider text-ink-faint">
        To meld
      </span>
      {teams.map((team) => (
        <MeldTeamRow key={team.id} team={team} />
      ))}
      <MeldRulesHint />
    </div>
  )
}

/** @deprecated Use MeldTracker and CurrentRoundTracker separately. */
export function Scoreboard({ teams, compact = false }: { teams: TeamState[]; compact?: boolean }) {
  if (compact) return <MeldTracker teams={teams} />
  return (
    <div className="flex flex-wrap items-start gap-4">
      <CurrentRoundTracker teams={teams} />
      <MeldTracker teams={teams} />
    </div>
  )
}
