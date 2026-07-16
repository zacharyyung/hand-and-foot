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

/** Identity chip — rail placard outside the felt, books render on the table. */
export function SeatPanel({
  player,
  role,
  isActive,
  myTeamId,
  side,
  style,
}: SeatPanelProps) {
  const teamColor = TEAM_COLORS[player.profile.teamId]
  const isMyTeam = player.profile.teamId === myTeamId

  const roleLabel =
    role === 'you' ? 'You' : role === 'partner' ? 'Partner' : 'Opp.'

  const handCount = playerHandCount(player)
  const footCount = playerFootCount(player)

  const isSouth = side === 'south'

  const positionStyle: CSSProperties = isSouth
    ? { left: '50%', bottom: '0.25rem', top: 'auto' }
    : style

  const chipStyle = {
    '--seat-team': teamColor,
  } as CSSProperties

  return (
    <div className={`absolute z-20 ${seatAnchorClass(side)}`} style={positionStyle}>
      <div
        className={[
          'seat-chip',
          isMyTeam ? 'seat-chip-ally' : '',
          isActive ? 'seat-chip-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={chipStyle}
      >
        <div className="seat-chip-avatar" aria-hidden>
          {player.profile.avatar}
        </div>
        <div className="seat-chip-body">
          <div className="seat-chip-name-row">
            <p className="seat-chip-name">{player.profile.name}</p>
            {isActive && (
              <span className="seat-chip-turn-dot" aria-label="Current turn" />
            )}
          </div>
          <div className="seat-chip-meta">
            <span className="seat-chip-role">{roleLabel}</span>
            <span className="seat-chip-piles">
              <span className="seat-chip-pile" title="Hand cards">
                <span className="seat-chip-pile-label">H</span>
                <span className="seat-chip-pile-count">{handCount}</span>
              </span>
              <span className="seat-chip-pile" title="Foot cards">
                <span className="seat-chip-pile-label">F</span>
                <span className="seat-chip-pile-count">{footCount}</span>
              </span>
            </span>
            {player.isPlayingFoot && (
              <span className="seat-chip-tag seat-chip-tag-foot">Foot</span>
            )}
            {player.footOnHold && (
              <span className="seat-chip-tag seat-chip-tag-hold">Hold</span>
            )}
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
