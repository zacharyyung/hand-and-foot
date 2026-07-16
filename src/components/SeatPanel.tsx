import type { CSSProperties } from 'react'
import type { PlayerState } from '../game/deal'
import { playerFootCount, playerHandCount } from '../game/deal'
import type { CompassSide, SeatRole } from '../game/tableLayout'
import { CardPile } from './CardPile'
import { TEAM_COLORS } from '../game/teams'

interface SeatPanelProps {
  player: PlayerState
  role: SeatRole
  isActive: boolean
  myTeamId: number
  side: CompassSide
  style: { left: string; top: string }
}

function seatAnchorClass(side: CompassSide): string {
  switch (side) {
    case 'south':
      return '-translate-x-1/2 translate-y-0'
    case 'north':
      return '-translate-x-1/2'
    case 'west':
      return '-translate-y-1/2'
    case 'east':
      return '-translate-x-full -translate-y-1/2'
    case 'nw':
      return ''
    case 'ne':
      return '-translate-x-full'
    case 'sw':
      return '-translate-y-full'
    case 'se':
      return '-translate-x-full -translate-y-full'
    default:
      return '-translate-x-1/2'
  }
}

/** Identity chip only — books render separately on the felt. */
export function SeatPanel({
  player,
  role,
  isActive,
  myTeamId,
  side,
  style,
}: SeatPanelProps) {
  const color = TEAM_COLORS[player.profile.teamId]
  const isMyTeam = player.profile.teamId === myTeamId

  const roleLabel =
    role === 'you' ? 'You' : role === 'partner' ? 'Partner' : 'Opp.'

  const handCount = playerHandCount(player)
  const footCount = playerFootCount(player)

  const isSouth = side === 'south'

  const positionStyle: CSSProperties = isSouth
    ? { left: '50%', bottom: '0.25rem', top: 'auto' }
    : style

  return (
    <div className={`absolute z-20 ${seatAnchorClass(side)}`} style={positionStyle}>
      <div
        className={`seat-plaque relative shrink-0 ${isActive ? 'seat-plaque-active animate-soft-pulse' : ''}`}
        style={
          !isActive && isMyTeam
            ? { borderColor: `${color}55`, boxShadow: `0 0 0 1px ${color}22` }
            : undefined
        }
      >
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {player.profile.avatar}
          </span>
          <div className="min-w-0">
            <p className="truncate font-sans text-[11px] font-semibold leading-tight text-ink">
              {player.profile.name}
            </p>
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[9px] text-ink-muted">
              <span style={{ color }}>{roleLabel}</span>
              <span className="tabular-nums text-ink-faint">
                {handCount}
                <span className="mx-0.5 opacity-40">·</span>
                {footCount}
              </span>
              {player.isPlayingFoot && (
                <span className="text-accent">Foot</span>
              )}
              {player.footOnHold && (
                <span className="text-sky-300/90">Hold</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ViewerFootPile({
  footCount,
  showFootPile,
  footCards,
  compact = false,
  inline = false,
}: {
  footCount: number
  showFootPile: boolean
  footCards: PlayerState['foot']
  compact?: boolean
  inline?: boolean
}) {
  if (footCount === 0) return null

  if (inline) {
    return (
      <span className="text-[11px] text-ink-muted">
        Foot {footCount}
        {showFootPile ? '' : ' · playing'}
      </span>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'mb-3 justify-center'}`}>
      <span className="text-[10px] text-ink-muted">Foot {footCount}</span>
      {showFootPile ? (
        <CardPile cards={footCards} label="" faceDown small />
      ) : (
        <div className="flex h-12 w-8 items-center justify-center rounded-lg border border-white/15 bg-blue-950/40 text-[10px] text-ink-muted">
          {footCount}
        </div>
      )}
    </div>
  )
}
