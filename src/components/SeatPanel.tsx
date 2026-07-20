import type { CSSProperties } from 'react'
import type { PlayerState } from '../game/deal'
import { playerFootCount, playerHandCount } from '../game/deal'
import type { CompassSide, SeatRole } from '../game/tableLayout'
import { CardPile } from './CardPile'
import { TEAM_COLORS } from '../game/teams'

interface SeatPanelProps {
  player: PlayerState
  seatIndex: number
  role: SeatRole
  isActive: boolean
  myTeamId: number
  side: CompassSide
  coords: { left: number; top: number }
  /** Avatar + H/F counts only — for phone-width table. */
  abbreviated?: boolean
}

function seatAnchorClass(side: CompassSide, abbreviated = false): string {
  switch (side) {
    case 'south':
      return '-translate-x-1/2 translate-y-0'
    case 'north':
      return '-translate-x-1/2'
    case 'west':
    case 'east':
      return abbreviated ? '' : '-translate-y-1/2'
    case 'nw':
      return abbreviated ? '' : ''
    case 'ne':
      return abbreviated ? '' : ''
    case 'sw':
      return abbreviated ? '' : '-translate-y-full'
    case 'se':
      return abbreviated ? '' : '-translate-y-full'
    default:
      return '-translate-x-1/2'
  }
}

function isEastSide(side: CompassSide): boolean {
  return side === 'east' || side === 'ne' || side === 'se'
}

function seatPositionStyle(
  side: CompassSide,
  coords: { left: number; top: number },
  abbreviated = false,
): CSSProperties {
  if (side === 'south') {
    return abbreviated
      ? { left: '50%', bottom: '0.125rem', top: 'auto' }
      : { left: '50%', bottom: '0.25rem', top: 'auto' }
  }

  if (abbreviated && side === 'west') {
    return { left: '3%', top: 'calc(50% - 6rem)' }
  }

  if (abbreviated && side === 'east') {
    return { right: '3%', left: 'auto', top: 'calc(50% - 6rem)' }
  }

  if (abbreviated && (side === 'nw' || side === 'ne')) {
    return isEastSide(side)
      ? { right: '3%', left: 'auto', top: '12%' }
      : { left: '3%', top: '12%' }
  }

  if (abbreviated && side === 'sw') {
    return { left: '3%', bottom: 'calc(26% + 0.25rem)', top: 'auto' }
  }

  if (abbreviated && side === 'se') {
    return { right: '3%', left: 'auto', bottom: 'calc(26% + 0.25rem)', top: 'auto' }
  }

  if (isEastSide(side)) {
    return {
      right: `${100 - coords.left}%`,
      top: `${coords.top}%`,
      left: 'auto',
    }
  }

  return {
    left: `${coords.left}%`,
    top: `${coords.top}%`,
  }
}

/** Identity chip — rail placard outside the felt, books render on the table. */
export function SeatPanel({
  player,
  seatIndex,
  role,
  isActive,
  myTeamId,
  side,
  coords,
  abbreviated = false,
}: SeatPanelProps) {
  const teamColor = TEAM_COLORS[player.profile.teamId]
  const isMyTeam = player.profile.teamId === myTeamId

  const roleLabel =
    role === 'you' ? 'You' : role === 'partner' ? 'P' : 'O'

  const handCount = playerHandCount(player)
  const footCount = playerFootCount(player)

  const positionStyle = seatPositionStyle(side, coords, abbreviated)

  const chipStyle = {
    '--seat-team': teamColor,
  } as CSSProperties

  if (abbreviated) {
    return (
      <div className={`absolute z-20 ${seatAnchorClass(side, abbreviated)}`} style={positionStyle}>
        <span
          data-flight-anchor={`seat-${seatIndex}`}
          className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
          aria-hidden
        />
        <div
          className={[
            'seat-chip seat-chip-abbreviated',
            isMyTeam ? 'seat-chip-ally' : '',
            isActive ? 'seat-chip-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={chipStyle}
          title={`${player.profile.name} · ${role === 'you' ? 'You' : role === 'partner' ? 'Partner' : 'Opponent'} · Team ${player.profile.teamId + 1}`}
        >
          <span className="seat-chip-team-pip" aria-hidden />
          <div className="seat-chip-avatar seat-chip-avatar-sm" aria-hidden>
            {player.profile.avatar}
          </div>
          <div className="seat-chip-abbrev-counts">
            {(!player.isPlayingFoot || handCount > 0) && (
              <span className="seat-chip-abbrev-pile" title="Hand">
                H{handCount}
              </span>
            )}
            <span
              className={[
                'seat-chip-abbrev-pile',
                player.isPlayingFoot ? 'seat-chip-pile-foot-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title="Foot"
            >
              F{footCount}
            </span>
          </div>
          {role === 'you' && <span className="seat-chip-you-tag">You</span>}
          {isActive && (
            <span className="seat-chip-turn-dot seat-chip-turn-dot-sm" aria-label="Current turn" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`absolute z-20 ${seatAnchorClass(side)}`} style={positionStyle}>
      <span
        data-flight-anchor={`seat-${seatIndex}`}
        className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
        aria-hidden
      />
      <div
        className={[
          'seat-chip',
          isMyTeam ? 'seat-chip-ally' : '',
          isActive ? 'seat-chip-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={chipStyle}
        title={`Team ${player.profile.teamId + 1}`}
      >
        <span className="seat-chip-team-pip" aria-hidden />
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
              {(!player.isPlayingFoot || handCount > 0) && (
                <span className="seat-chip-pile" title="Hand cards">
                  <span className="seat-chip-pile-label">H</span>
                  <span className="seat-chip-pile-count">{handCount}</span>
                </span>
              )}
              <span
                className={[
                  'seat-chip-pile',
                  player.isPlayingFoot ? 'seat-chip-pile-foot-active' : '',
                  player.footOnHold ? 'seat-chip-pile-foot-hold' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={
                  player.isPlayingFoot
                    ? 'Playing foot'
                    : player.footOnHold
                      ? 'Foot on hold'
                      : 'Foot cards'
                }
              >
                <span className="seat-chip-pile-label">F</span>
                <span className="seat-chip-pile-count">{footCount}</span>
              </span>
            </span>
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
